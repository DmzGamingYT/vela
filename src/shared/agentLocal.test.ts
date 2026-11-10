/**
 * Mesure réelle du format des actions sur un modèle local (`chatModel` parle à
 * Ollama comme n'importe quel fournisseur compatible OpenAI).
 *
 * Volontairement hors de la suite par défaut : il faut Ollama, un modèle
 * téléchargé, et une à deux minutes.
 *
 *   ollama pull gemma3:1b
 *   VELA_LOCAL_BENCH=1 npx vitest run src/shared/agentLocal.test.ts
 *   VELA_LOCAL_MODEL=qwen3:1.7b VELA_LOCAL_REPS=3 VELA_LOCAL_BENCH=1 npx vitest run …
 *
 * Trois bras sur les mêmes tâches : l'ancien protocole en une passe, le
 * découpage en prose amorcée, et le découpage avec schéma strict côté
 * fournisseur. Les réponses brutes des ratés sont imprimées : sans elles, un
 * taux ne dit pas si le modèle s'est trompé d'outil ou a copié un exemple.
 */
import { describe, expect, it } from 'vitest'
import { chatModel } from './agentModel'
import {
  ACT_ARGS_SYSTEM,
  ACT_CHOICE_SYSTEM,
  ACT_SYSTEM_PROMPT,
  AGENT_BUDGET,
  TOOL_CHOICE_SCHEMA,
  buildStepPrompt,
  buildToolArgsPrompt,
  buildToolChoicePrompt,
  parseAgentAction,
  parseToolArgs,
  parseToolChoice,
  type ActTurnInput,
  type AgentAction
} from './agentLoop'
import { providerById } from './providers'

const MODEL = process.env.VELA_LOCAL_MODEL ?? 'gemma3:1b'
const REPS = Math.max(1, Number(process.env.VELA_LOCAL_REPS ?? 2))
const RUN = process.env.VELA_LOCAL_BENCH === '1'

interface Task extends ActTurnInput {
  /** Outil attendu pour la première action de la tâche. */
  tool: string
}

const page = (title: string, url: string): { title: string; url: string } => ({ title, url })

const TASKS: Task[] = [
  {
    prompt: 'Ouvre https://example.org/tarifs',
    step: 1,
    steps: AGENT_BUDGET.steps,
    page: null,
    transcript: '',
    tool: 'open'
  },
  {
    prompt: 'Lis la page et dis-moi ce qu’elle propose',
    step: 1,
    steps: AGENT_BUDGET.steps,
    page: page('Accueil', 'https://example.org/'),
    transcript: '',
    tool: 'read'
  },
  {
    prompt: 'Clique sur le lien « Nous contacter »',
    step: 1,
    steps: AGENT_BUDGET.steps,
    page: page('Accueil', 'https://example.org/'),
    transcript: '',
    tool: 'click'
  },
  {
    prompt: 'Saisis « bonjour » dans le champ de recherche',
    step: 1,
    steps: AGENT_BUDGET.steps,
    page: page('Recherche', 'https://example.org/recherche'),
    transcript: '',
    tool: 'type'
  },
  {
    prompt: 'Liste les liens de la page',
    step: 1,
    steps: AGENT_BUDGET.steps,
    page: page('Accueil', 'https://example.org/'),
    transcript: '',
    tool: 'extract'
  },
  {
    prompt: 'C’est fini : conclus avec un résumé de ce que tu as vu',
    step: 1,
    steps: AGENT_BUDGET.steps,
    page: page('Accueil', 'https://example.org/'),
    transcript: '1. Ouvrir example.org → fait : page d’accueil chargée',
    tool: 'done'
  }
]

const model = (): ReturnType<typeof chatModel> =>
  chatModel({
    definition: providerById('local'),
    config: { baseUrl: 'http://localhost:11434/v1', model: MODEL },
    key: null,
    timeoutMs: 120_000
  })

const flat = (value: string): string => value.replace(/\s+/g, ' ').trim().slice(0, 140)

/** Une action n'est comptée que si elle peut réellement s'exécuter. */
function usable(action: AgentAction | null): boolean {
  if (!action) return false
  return action.tool !== 'done' || Boolean(action.args.summary)
}

interface Attempt {
  action: AgentAction | null
  /** Réponse au premier temps (ou du protocole en une passe). */
  raw: string
  /** Réponse aux arguments, quand il y en a une. */
  argsRaw?: string
}

/** Ancien protocole : une seule réponse contenant l'action complète. */
async function legacy(task: Task): Promise<Attempt> {
  const session = await model().create({ system: ACT_SYSTEM_PROMPT })
  try {
    const reply = await session.prompt(buildStepPrompt(task))
    return { action: parseAgentAction(reply), raw: flat(reply) }
  } finally {
    session.destroy()
  }
}

/** Nouveau protocole : l'outil, puis ses arguments, avec une relance. */
async function split(task: Task, strict: boolean): Promise<Attempt> {
  const engine = model()
  const choice = await engine.create({
    system: ACT_CHOICE_SYSTEM,
    ...(strict ? { schema: TOOL_CHOICE_SCHEMA } : {})
  })
  const picked = flat(await choice.prompt(buildToolChoicePrompt(task)))
  choice.destroy()
  const tool = parseToolChoice(picked)
  if (!tool) return { action: null, raw: picked }

  const args = await engine.create({ system: ACT_ARGS_SYSTEM })
  const input = { ...task, tool }
  const first = await args.prompt(buildToolArgsPrompt(input))
  const action = parseToolArgs(tool, first)
  if (action) {
    args.destroy()
    return { action, raw: picked, argsRaw: flat(first) }
  }
  const retry = await args.prompt(buildToolArgsPrompt({ ...input, correction: first }))
  args.destroy()
  return { action: parseToolArgs(tool, retry), raw: picked, argsRaw: flat(retry) }
}

interface Tally {
  label: string
  executable: number
  right: number
  chosen: Map<string, number>
  misses: string[]
}

const tally = (label: string): Tally => ({
  label,
  executable: 0,
  right: 0,
  chosen: new Map(),
  misses: []
})

function record(bucket: Tally, task: Task, attempt: Attempt): void {
  const action = attempt.action
  if (usable(action)) bucket.executable += 1
  if (usable(action) && action?.tool === task.tool) bucket.right += 1
  const picked = action?.tool ?? 'aucun'
  bucket.chosen.set(picked, (bucket.chosen.get(picked) ?? 0) + 1)
  if (action?.tool !== task.tool && bucket.misses.length < 6) {
    bucket.misses.push(
      `${task.tool} → ${picked} · outil: «${attempt.raw}» · args: «${attempt.argsRaw ?? '—'}»`
    )
  }
}

describe.skipIf(!RUN)('mesure réelle sur un modèle local', () => {
  it(`compare les deux protocoles (${MODEL})`, async () => {
    const total = TASKS.length * REPS
    const oneShot = tally('une passe')
    const prose = tally('deux temps, prose amorcée')
    const strict = tally('deux temps, schéma strict')

    for (let rep = 0; rep < REPS; rep += 1) {
      for (const task of TASKS) {
        record(oneShot, task, await legacy(task))
        record(prose, task, await split(task, false))
        record(strict, task, await split(task, true))
      }
    }

    const share = (value: number): number => Math.round((value / total) * 100)
    console.warn(`[ollama ${MODEL}] ${TASKS.length} tâches × ${REPS} passes (${total} essais)`)
    for (const bucket of [oneShot, prose, strict]) {
      console.warn(
        `[ollama ${MODEL}] ${bucket.label} : ${bucket.executable}/${total} exécutables (${share(
          bucket.executable
        )} %), ${bucket.right}/${total} bon outil (${share(bucket.right)} %) — outils : ${[
          ...bucket.chosen
        ]
          .map(([tool, count]) => `${tool}:${count}`)
          .join(' ')}`
      )
    }
    for (const bucket of [prose, strict]) {
      for (const miss of bucket.misses.slice(0, 3)) {
        console.warn(`[ollama ${MODEL}] ${bucket.label} · ${miss}`)
      }
    }

    // La mesure doit avoir tourné : un modèle absent ou muet ne passe pas
    // pour un zéro.
    expect(oneShot.executable + prose.executable + strict.executable).toBeGreaterThan(0)
  }, 900_000)
})
