import type { StateCreator } from 'zustand'
import type { AgentEvent, SelectionPayload, WorkSummary } from '@shared/types'
import { isHomeUrl } from '@shared/url'
import type { AgentUi, WorkMode } from '../types'
import type { BrowserState } from '../browser'

export interface AgentSlice {
  /** Panneau agent ancré à droite : la page reste visible à côté. */
  agentOpen: boolean
  agent: AgentUi
  agentDraft: string
  workMode: WorkMode
  approved: boolean
  agentSentTabIds: string[]
  /** Onglet à joindre automatiquement quand l'agent s'ouvre depuis une sélection. */
  agentSourceTab: string | null
  toggleAgent(open?: boolean): void
  openAgent(prompt?: string): void
  startAgent(prompt: string, tabIds: string[], mode?: 'answer' | 'act'): Promise<void>
  cancelAgent(): void
  resetAgent(): void
  saveAgentNote(): Promise<void>
  openWork(work: WorkSummary): Promise<boolean>
  renameWork(id: string, title: string): Promise<void>
  archiveWork(id: string, archived: boolean): Promise<void>
  setWorkMode(mode: WorkMode): void
  setApproved(value: boolean): void
  handleSelection(payload: SelectionPayload): void
  handleAgentEvent(event: AgentEvent): void
}

const EMPTY_AGENT: AgentUi = {
  runId: null,
  title: '',
  steps: [],
  markdown: '',
  status: 'idle',
  error: null,
  mode: 'demo',
  prompt: '',
  sources: [],
  requestMode: 'answer',
  journal: []
}

/**
 * Deltas du modèle : ils arrivent par paquets de quelques mots. Les appliquer
 * un par un relançait le rendu Markdown des centaines de fois par rapport ;
 * on les regroupe pour un rendu fluide (≈ 14 par seconde) et beaucoup moins
 * de travail pour le processeur.
 */
const DELTA_FLUSH_MS = 70
let deltaBuffer = ''
let deltaRunId = ''
let deltaTimer: ReturnType<typeof setTimeout> | null = null

type Setter = (
  partial: Partial<BrowserState> | ((state: BrowserState) => Partial<BrowserState>)
) => void

function flushAgentDelta(set: Setter): void {
  if (deltaTimer) {
    clearTimeout(deltaTimer)
    deltaTimer = null
  }
  const chunk = deltaBuffer
  const runId = deltaRunId
  deltaBuffer = ''
  deltaRunId = ''
  if (!chunk) return
  set((state) =>
    state.agent.runId === runId
      ? { agent: { ...state.agent, markdown: state.agent.markdown + chunk } }
      : {}
  )
}

function discardAgentDelta(): void {
  if (deltaTimer) {
    clearTimeout(deltaTimer)
    deltaTimer = null
  }
  deltaBuffer = ''
  deltaRunId = ''
}

/** Agent, rapports de l'atelier et sélection de page. */
export const createAgentSlice: StateCreator<BrowserState, [], [], AgentSlice> = (set, get) => ({
  agentOpen: false,
  agent: EMPTY_AGENT,
  agentDraft: '',
  workMode: 'browse',
  approved: false,
  agentSentTabIds: [],
  agentSourceTab: null,

  toggleAgent(open) {
    // Le panneau vit à côté de la page : ouvrir l’agent ne masque plus rien —
    // mais il prend la place des notes, jamais les deux à la fois.
    const next = open ?? !get().agentOpen
    set({ agentOpen: next, notesOpen: next ? false : get().notesOpen, overlay: null })
  },

  openAgent(prompt = '') {
    set({ agentOpen: true, notesOpen: false, overlay: null, agentDraft: prompt })
  },

  async startAgent(prompt, tabIds, mode = 'answer') {
    const view = get().view
    if (!view) return
    if (!prompt.trim()) {
      get().toast('Dites à l’agent quoi faire.', 'error')
      return
    }
    // En mode « agir », l'agent ouvre son propre onglet : joindre une page est
    // un contexte utile, pas une condition de départ.
    const sources = view.tabs
      .filter((tab) => tabIds.includes(tab.id) && !isHomeUrl(tab.url))
      .map((tab) => ({ tabId: tab.id, title: tab.title, url: tab.url }))
    set({
      agentOpen: get().workMode !== 'work',
      agentDraft: prompt,
      agentSentTabIds:
        view.settings.agent.mode === 'api'
          ? sources.map((source) => source.tabId!).filter(Boolean)
          : [],
      agent: {
        ...EMPTY_AGENT,
        status: 'running',
        mode: view.settings.agent.mode,
        prompt,
        sources: [],
        requestMode: mode
      }
    })
    const result = await get().call(
      () => window.vela.agent.run({ prompt, sources, spaceId: view.activeSpaceId, mode }),
      'L’agent n’a pas pu démarrer.'
    )
    if (result) {
      set((state) => ({ agent: { ...state.agent, runId: result.runId } }))
    } else {
      set((state) => ({
        agent: { ...state.agent, status: 'error', error: 'L’agent n’a pas pu démarrer.' }
      }))
    }
  },

  cancelAgent() {
    const runId = get().agent.runId ?? undefined
    flushAgentDelta(set)
    window.vela.agent.cancel(runId)
    discardAgentDelta()
    set((state) => ({ agent: { ...state.agent, status: 'cancelled' } }))
  },

  resetAgent() {
    discardAgentDelta()
    set({ agent: EMPTY_AGENT, agentSentTabIds: [] })
  },

  /**
   * Rouvre un rapport déjà produit : il redevient le contenu de l'atelier.
   * Le texte complet est lu à ce moment-là, pas pendant les mises à jour d'état.
   */
  async openWork(work) {
    const full = await get().call(() => window.vela.works.get(work.id), 'Rapport introuvable.')
    if (!full) {
      get().toast('Ce rapport n’a pas pu être ouvert.', 'error')
      return false
    }
    set({
      // Déjà dans l’atelier : le rapport s’affiche sur place, sans seconde fenêtre.
      agentOpen: get().workMode !== 'work',
      approved: false,
      agentSentTabIds: [],
      agentDraft: full.prompt,
      agent: {
        runId: null,
        title: full.title,
        steps: [{ label: 'Rapport enregistré', state: 'done' }],
        markdown: full.markdown,
        status: 'done',
        error: null,
        mode: full.mode,
        prompt: full.prompt,
        sources: full.sources,
        // Un rapport rouvert vient d'un travail archivé : son journal est dans
        // le texte du rapport, pas dans une exécution en cours.
        requestMode: 'answer',
        journal: []
      }
    })
    return true
  },

  async renameWork(id, title) {
    const clean = title.trim()
    if (!clean) return
    await get().call(() => window.vela.works.rename({ id, title: clean }), 'Renommage impossible.')
  },

  async archiveWork(id, archived) {
    await get().call(() => window.vela.works.archive({ id, archived }), 'Archivage impossible.')
  },

  setWorkMode(mode) {
    // Entrer dans l’atelier referme le panneau agent : c’est la même surface.
    set((state) => ({ workMode: mode, agentOpen: mode === 'work' ? false : state.agentOpen }))
  },

  setApproved(value) {
    set({ approved: value })
  },

  async saveAgentNote() {
    const { agent, view } = get()
    if (!agent.markdown || !view) return
    const source = view.tabs.find((tab) => !isHomeUrl(tab.url))
    const note = await get().saveNote({
      title: agent.title || 'Rapport Vela',
      body: agent.markdown,
      spaceId: view.activeSpaceId,
      url: source?.url
    })
    if (note) {
      get().toast('Rapport enregistré dans Notes.')
      set({ notesOpen: true, agentOpen: false })
    }
  },

  handleSelection(payload) {
    if (payload.action === 'note') {
      void get().captureSelection()
      return
    }
    if (payload.action === 'highlight') {
      void get()
        .call(() => window.vela.notes.highlight(), 'Surlignage impossible.')
        .then((note) => {
          if (!note) {
            get().toast('Sélectionnez un passage dans la page.', 'error')
            return
          }
          get().toast('Passage surligné et ajouté à la note de la page.')
          set({ notesOpen: true, agentOpen: false })
        })
      return
    }
    const text = payload.text.trim().slice(0, 4000)
    if (!text) {
      get().toast('Rien de sélectionné.', 'error')
      return
    }
    const prompts: Record<'summarize' | 'explain' | 'translate' | 'simplify', string> = {
      summarize: `Résume ce passage en trois points, puis dis ce qu’il faut retenir :\n\n"""${text}"""`,
      explain: `Explique ce passage simplement, à quelqu’un qui découvre le sujet :\n\n"""${text}"""`,
      translate: `Traduis ce passage en français s’il est en anglais, sinon en anglais. Garde le ton :\n\n"""${text}"""`,
      simplify: `Réécris ce passage plus simplement, sans rien perdre du sens :\n\n"""${text}"""`
    }
    set({
      agentDraft: prompts[payload.action],
      agentOpen: true,
      notesOpen: false,
      agentSourceTab: payload.tabId,
      workMode: 'browse',
      overlay: null
    })
  },

  handleAgentEvent(event) {
    if (event.type === 'delta') {
      const current = get().agent
      if (current.runId && event.runId !== current.runId) return
      deltaBuffer += event.text
      deltaRunId = event.runId
      if (!deltaTimer) deltaTimer = setTimeout(() => flushAgentDelta(set), DELTA_FLUSH_MS)
      return
    }
    // Toute autre étape (fin, erreur, arrêt) doit voir le texte déjà reçu.
    flushAgentDelta(set)
    set((state) => {
      const agent = state.agent
      if (event.type !== 'plan' && agent.runId && event.runId !== agent.runId) return {}
      switch (event.type) {
        case 'plan':
          return {
            agent: {
              ...agent,
              runId: event.runId,
              title: event.title,
              steps: event.steps.map((label) => ({ label, state: 'pending' as const })),
              markdown: '',
              status: 'running',
              error: null,
              mode: event.mode,
              sources: event.sources ?? [],
              journal: []
            }
          }
        case 'action':
          return {
            agent: {
              ...agent,
              journal: agent.journal.some((entry) => entry.id === event.entry.id)
                ? agent.journal
                : [...agent.journal, event.entry]
            }
          }
        case 'step':
          return {
            agent: {
              ...agent,
              steps: agent.steps.map((step, index) =>
                index === event.index ? { ...step, state: event.state } : step
              )
            }
          }
        case 'done':
          return {
            agent: {
              ...agent,
              status: 'done',
              steps: agent.steps.map((step) => ({ ...step, state: 'done' as const }))
            }
          }
        case 'cancelled':
          return { agent: { ...agent, status: 'cancelled' } }
        case 'error':
          return { agent: { ...agent, status: 'error', error: event.message } }
        default:
          return {}
      }
    })
  }
})
