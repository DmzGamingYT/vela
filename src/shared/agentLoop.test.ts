import { describe, expect, it } from 'vitest'
import {
  buildToolArgsPrompt,
  buildToolChoicePrompt,
  parseAgentAction,
  parseToolArgs,
  parseToolChoice,
  type AgentAction
} from './agentLoop'

const turn = {
  prompt: 'Trouve le prix du billet',
  step: 1,
  steps: 10,
  page: { title: 'Boutique', url: 'https://exemple.fr/' },
  transcript: ''
}

describe('choisir un outil, puis remplir ses arguments', () => {
  it('propose les sept outils sans demander d’arguments', () => {
    const prompt = buildToolChoicePrompt(turn)
    for (const name of ['open', 'read', 'click', 'type', 'scroll', 'extract', 'done']) {
      expect(prompt, name).toContain(name)
    }
    expect(prompt).toContain('un seul mot')
    expect(prompt.trimEnd().endsWith('Outil :')).toBe(true)
    expect(prompt).not.toContain('summary —')
  })

  it('ne demande que les champs de l’outil retenu, sans exemple rempli', () => {
    const prompt = buildToolArgsPrompt({ ...turn, tool: 'done' })
    expect(prompt).toContain('Outil choisi : done')
    expect(prompt).toContain('summary — la réponse')
    expect(prompt).not.toContain('role —')
    // Une valeur d'exemple se recopie : un petit modèle la renvoie telle quelle.
    expect(prompt).not.toContain('"nom du champ"')
  })

  it('cite la réponse fautive quand on redemande', () => {
    const prompt = buildToolArgsPrompt({
      ...turn,
      tool: 'click',
      correction: '{"cible":"Envoyer"}'
    })
    expect(prompt).toContain('n’a pas été comprise')
    expect(prompt).toContain('{"cible":"Envoyer"}')
  })

  it('garde les derniers résultats seulement', () => {
    const transcript = Array.from({ length: 9 }, (_, index) => `${index + 1}. étape faite`).join(
      '\n'
    )
    const prompt = buildToolChoicePrompt({ ...turn, transcript })
    expect(prompt).toContain('9. étape faite')
    expect(prompt).not.toContain('1. étape faite\n')
  })

  it('lit un nom d’outil même entouré de texte', () => {
    expect(parseToolChoice('Outil : click')).toBe('click')
    expect(parseToolChoice('```\nopen\n```')).toBe('open')
    expect(parseToolChoice('{"tool":"done"}')).toBe('done')
    expect(parseToolChoice('Je clique sur le bouton.')).toBeNull()
    expect(parseToolChoice('')).toBeNull()
  })

  it('refuse des arguments inutilisables plutôt que de deviner', () => {
    expect(parseToolArgs('click', '{"cible":"Envoyer"}')).toBeNull()
    expect(parseToolArgs('done', '{}')).toBeNull()
    expect(parseToolArgs('type', '{"text":"bonjour"}')).toEqual({
      tool: 'type',
      args: { text: 'bonjour', submit: false }
    })
    expect(parseToolArgs('read', '')).toEqual({ tool: 'read', args: {} })
    expect(parseToolArgs('open', 'Vas-y : https://exemple.fr/prix')).toEqual({
      tool: 'open',
      args: { url: 'https://exemple.fr/prix' }
    })
  })
})

/* ------------------------------------------------------------------------- *
 * Mesure : même code que l'exécution réelle, sur des réponses types de petits
 * modèles. Ce n'est pas une mesure de qualité de modèle, mais du format : la
 * part d'actions exploitables quand le modèle répond comme un modèle de 2–3 B.
 * ------------------------------------------------------------------------- */

interface Sample {
  name: string
  /** Ancien protocole : une seule réponse contenant l'action complète. */
  legacy: string
  /** Nouveau protocole, premier temps. */
  tool: string
  /** Nouveau protocole, second temps, dans l'ordre des tentatives. */
  args: string[]
  want: AgentAction | null
  /** Limite connue : le protocole en deux temps n'y arrive pas encore. */
  gap?: boolean
}

const clickEnvoyer: AgentAction = { tool: 'click', args: { name: 'Envoyer' } }

const SAMPLES: Sample[] = [
  {
    name: 'objet complet',
    legacy: '{"tool":"click","args":{"name":"Envoyer"}}',
    tool: 'click',
    args: ['{"name":"Envoyer"}'],
    want: clickEnvoyer
  },
  {
    name: 'prose autour de l’objet',
    legacy: 'Je vais cliquer sur le bouton.\n{"tool":"click","args":{"name":"Envoyer"}}',
    tool: 'click',
    args: ['{"name":"Envoyer"}'],
    want: clickEnvoyer
  },
  {
    name: 'bloc markdown',
    legacy: '```json\n{"tool":"scroll","args":{"direction":"down","amount":900}}\n```',
    tool: 'scroll',
    args: ['{"direction":"down","amount":900}'],
    want: { tool: 'scroll', args: { direction: 'down', amount: 900 } }
  },
  {
    name: 'nom d’outil seul',
    legacy: 'click',
    tool: 'click',
    args: ['{"name":"Envoyer"}'],
    want: clickEnvoyer
  },
  {
    name: 'nom après une étiquette',
    legacy: 'Outil : click',
    tool: 'Outil : click',
    args: ['{"name":"Envoyer"}'],
    want: clickEnvoyer
  },
  {
    name: 'objet outil sans args',
    legacy: '{"tool":"click"}',
    tool: '{"tool":"click"}',
    args: ['{"name":"Envoyer"}'],
    want: clickEnvoyer
  },
  {
    name: 'JSON tronqué',
    legacy: '{"tool":"open","args":{"url":"https://exa',
    tool: '{"tool":"open","args":{"url":"https://exa',
    args: ['{"url":"https://exemple.fr/prix"}'],
    want: { tool: 'open', args: { url: 'https://exemple.fr/prix' } }
  },
  {
    name: 'arguments à plat',
    legacy: '{"tool":"type","text":"bonjour"}',
    tool: '{"tool":"type","text":"bonjour"}',
    args: ['{"text":"bonjour","submit":true}'],
    want: { tool: 'type', args: { text: 'bonjour', submit: true } }
  },
  {
    name: 'objet complet redonné aux arguments',
    legacy: '{"tool":"click","args":{"name":"Envoyer"}}',
    tool: 'click',
    args: ['{"tool":"click","args":{"name":"Envoyer"}}'],
    want: clickEnvoyer
  },
  {
    name: 'adresse nue',
    legacy: '{"tool":"open"}',
    tool: 'open',
    args: ['Vas-y : https://exemple.fr/prix'],
    want: { tool: 'open', args: { url: 'https://exemple.fr/prix' } }
  },
  {
    name: 'outil inventé',
    legacy: '{"tool":"search","args":{"q":"prix"}}',
    tool: 'search',
    args: [],
    want: null
  },
  {
    name: 'réponse vide',
    legacy: '',
    tool: '',
    args: [],
    want: null
  },
  {
    name: 'conclure sans résumé, corrigé',
    legacy: '{"tool":"done","args":{}}',
    tool: 'done',
    args: ['{}', '{"summary":"Le billet coûte 42 €."}'],
    want: { tool: 'done', args: { summary: 'Le billet coûte 42 €.' } }
  },
  {
    name: 'conclure dans une phrase',
    legacy: '{"tool":"done","args":{"summary":"Fini."}}',
    tool: 'Je choisis done.',
    args: ['{"summary":"Fini."}'],
    want: { tool: 'done', args: { summary: 'Fini.' } }
  },
  {
    name: 'lecture sans argument',
    legacy: '{"tool":"read","args":{}}',
    tool: 'read',
    args: [''],
    want: { tool: 'read', args: {} }
  },
  {
    name: 'plafond des liens',
    legacy: '{"tool":"extract","args":{"what":"links","limit":99}}',
    tool: 'extract',
    args: ['{"what":"links","limit":99}'],
    want: { tool: 'extract', args: { what: 'links', limit: 30 } }
  },
  {
    name: 'prose sans nom d’outil',
    legacy: 'Je clique maintenant sur le bouton.',
    tool: 'Je clique maintenant sur le bouton.',
    args: [],
    want: clickEnvoyer,
    gap: true
  },
  {
    name: 'champ inventé',
    legacy: '{"tool":"click","args":{"cible":"Envoyer"}}',
    tool: 'click',
    args: ['{"cible":"Envoyer"}'],
    want: clickEnvoyer,
    gap: true
  }
]

/** Le tour tel que `runAct` l'exécute : outil, puis arguments (une relance). */
function splitPipeline(sample: Sample): AgentAction | null {
  const tool = parseToolChoice(sample.tool)
  if (!tool) return null
  for (const reply of sample.args) {
    const action = parseToolArgs(tool, reply)
    if (action) return action
  }
  return null
}

/** Comparaison d'actions indépendante de l'ordre des clés. */
function canonical(action: AgentAction | null): string {
  if (!action) return 'null'
  const args = Object.entries(action.args).sort(([left], [right]) => left.localeCompare(right))
  return JSON.stringify([action.tool, args])
}

describe('mesure du format des actions', () => {
  it('tient mieux en deux temps courts qu’en une réponse complète', () => {
    const expected = SAMPLES.filter((sample) => sample.want !== null)
    let before = 0
    let after = 0

    for (const sample of SAMPLES) {
      const split = splitPipeline(sample)
      if (sample.gap) expect(split, `limite connue · ${sample.name}`).toBeNull()
      else expect(split, `après · ${sample.name}`).toEqual(sample.want)
      if (sample.want === null) continue
      if (canonical(parseAgentAction(sample.legacy)) === canonical(sample.want)) before += 1
      if (split) after += 1
    }

    const percent = (value: number): number => Math.round((value / expected.length) * 100)
    console.warn(
      `[mesure] actions exploitables sur ${expected.length} réponses types — avant : ${before} (${percent(
        before
      )} %), après : ${after} (${percent(after)} %)`
    )
    // L'ancien protocole échoue même sur un nom d'outil nu : c'est le point de
    // départ de la mesure, pas une régression de l'analyseur.
    expect(parseAgentAction('click')).toBeNull()
    expect(after).toBeGreaterThan(before)
    expect(before).toBeLessThan(expected.length)
  })
})
