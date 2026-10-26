import { create } from 'zustand'
import type { UpdateInfo } from '@shared/api'
import type {
  AgentEvent,
  AgentMode,
  AppView,
  Note,
  ProviderId,
  ShortcutEvent,
  TabGroup,
  WorkSummary
} from '@shared/types'
import { HOME_URL } from '@shared/types'
import { isHomeUrl } from '@shared/url'
import type { SaveNoteInput, SettingsPatch } from '@shared/api'

export type Overlay = 'command' | 'brief' | 'agent' | 'settings' | 'space' | 'processes' | 'downloads' | null

export type WorkMode = 'browse' | 'work'

export interface Toast {
  id: string
  text: string
  tone: 'info' | 'error'
}

export interface AgentStep {
  label: string
  state: 'pending' | 'active' | 'done'
}

export interface AgentUi {
  runId: string | null
  title: string
  steps: AgentStep[]
  markdown: string
  status: 'idle' | 'running' | 'done' | 'error' | 'cancelled'
  error: string | null
  mode: AgentMode
  prompt: string
  sources: { title: string; url: string; anchor?: string }[]
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
  sources: []
}

interface BrowserState {
  initialized: boolean
  ready: boolean
  view: AppView | null
  overlay: Overlay
  notesOpen: boolean
  spaceEditId: string | null
  agent: AgentUi
  agentDraft: string
  workMode: WorkMode
  approved: boolean
  agentSentTabIds: string[]
  findOpen: boolean
  findQuery: string
  findResult: { matches: number; activeMatchOrdinal: number }
  toasts: Toast[]
  splitRatioLive: number | null
  init(): Promise<void>
  call<T>(task: () => Promise<T>, fallback: string): Promise<T | null>
  toast(text: string, tone?: Toast['tone']): void
  setOverlay(overlay: Overlay): void
  openSpaceDialog(id?: string): void
  focusAddress(): void
  newTab(url?: string, groupId?: string): void
  closeTab(id: string): void
  selectTab(id: string): void
  navigate(id: string, input: string): void
  back(id: string): void
  forward(id: string): void
  reload(id: string): void
  stop(id: string): void
  pin(id: string, pinned: boolean): void
  reorderTab(id: string, targetId: string, position: 'before' | 'after'): void
  moveTabToGroup(id: string, groupId: string | null): void
  createGroup(tabId?: string): Promise<TabGroup | null>
  updateGroup(id: string, patch: { name?: string; color?: string; collapsed?: boolean }): Promise<void>
  removeGroup(id: string): Promise<void>
  reopen(): void
  splitToggle(): void
  splitWith(id: string): void
  setSplitRatio(ratio: number): void
  commitSplitRatio(ratio: number): void
  activateSpace(id: string): void
  createSpace(name: string, color: string): Promise<void>
  updateSpace(id: string, patch: { name?: string; color?: string }): Promise<void>
  removeSpace(id: string): Promise<void>
  toggleNotes(open?: boolean): void
  saveNote(input: SaveNoteInput): Promise<Note | null>
  deleteNote(id: string): Promise<void>
  createTask(title: string, dueToday?: boolean): Promise<void>
  toggleTask(id: string): Promise<void>
  deleteTask(id: string): Promise<void>
  completeOnboarding(): Promise<void>
  setWorkMode(mode: WorkMode): void
  setApproved(value: boolean): void
  pinEssentials(): Promise<void>
  importBookmarks(urls: string[]): Promise<void>
  updateSettings(patch: SettingsPatch): Promise<void>
  setKey(provider: ProviderId, key: string | null): Promise<boolean>
  testKey(provider: ProviderId): Promise<{ ok: boolean; message: string }>
  update: UpdateInfo | null
  refreshUpdate(): Promise<void>
  checkUpdate(): Promise<void>
  downloadUpdate(): Promise<void>
  installUpdate(): Promise<void>
  openReleases(): Promise<void>
  openAgent(prompt?: string): void
  startAgent(prompt: string, tabIds: string[]): Promise<void>
  cancelAgent(): void
  resetAgent(): void
  saveAgentNote(): Promise<void>
  openWork(work: WorkSummary): Promise<boolean>
  renameWork(id: string, title: string): Promise<void>
  archiveWork(id: string, archived: boolean): Promise<void>
  findInPage(query: string, forward?: boolean): Promise<void>
  closeFind(): void
  handleShortcut(event: ShortcutEvent): void
  handleAgentEvent(event: AgentEvent): void
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

function flushAgentDelta(): void {
  if (deltaTimer) {
    clearTimeout(deltaTimer)
    deltaTimer = null
  }
  const chunk = deltaBuffer
  const runId = deltaRunId
  deltaBuffer = ''
  deltaRunId = ''
  if (!chunk) return
  useBrowser.setState((state) =>
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

function cleanError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback
  return (
    error.message
      .replace(/^Error invoking remote method '[^']+':\s*/, '')
      .replace(/^Error:\s*/, '')
      .trim() || fallback
  )
}

export const useBrowser = create<BrowserState>((set, get) => ({
  initialized: false,
  ready: false,
  view: null,
  overlay: null,
  notesOpen: false,
  spaceEditId: null,
  agent: EMPTY_AGENT,
  agentDraft: '',
  workMode: 'browse',
  approved: false,
  agentSentTabIds: [],
  findOpen: false,
  findQuery: '',
  findResult: { matches: 0, activeMatchOrdinal: 0 },
  toasts: [],
  splitRatioLive: null,
  update: null,

  async init() {
    if (get().initialized) return
    set({ initialized: true })
    if (!window.vela) {
      get().toast('Le pont Vela est indisponible.', 'error')
      return
    }
    try {
      const view = await window.vela.view()
      set({ view, ready: true })
    } catch (error) {
      get().toast(cleanError(error, 'Impossible de charger Vela.'), 'error')
    }
    window.vela.onState((view) =>
      set((state) => ({
        view,
        splitRatioLive:
          state.splitRatioLive !== null && Math.abs(view.splitRatio - state.splitRatioLive) < 0.002
            ? null
            : state.splitRatioLive
      }))
    )
    window.vela.onShortcut((event) => get().handleShortcut(event))
    window.vela.agent.onEvent((event) => get().handleAgentEvent(event))
    try {
      const status = await window.vela.updates.status()
      set({ update: status })
    } catch {
      /* mises à jour indisponibles en dev */
    }
    window.vela.updates.onEvent((info) => {
      set({ update: info })
      if (info.state === 'available') {
        get().toast(`Vela ${info.version ?? ''} : téléchargement en arrière-plan.`.trim())
      } else if (info.state === 'downloaded') {
        get().toast('Mise à jour prête — elle s’installera quand vous quitterez Vela.')
      } else if (info.state === 'error' && info.message) {
        get().toast(info.message, 'error')
      }
    })
  },

  async call(task, fallback) {
    try {
      return await task()
    } catch (error) {
      get().toast(cleanError(error, fallback), 'error')
      return null
    }
  },

  toast(text, tone = 'info') {
    const id = crypto.randomUUID()
    set((state) => ({ toasts: [...state.toasts, { id, text, tone }].slice(-3) }))
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }))
    }, 4200)
  },

  setOverlay(overlay) {
    set({ overlay, spaceEditId: overlay === 'space' ? get().spaceEditId : null })
  },

  openSpaceDialog(id) {
    set({ overlay: 'space', spaceEditId: id ?? null })
  },

  focusAddress() {
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('.pane-primary .address-input')
      input?.focus()
      input?.select()
    }, 20)
  },

  newTab(url = HOME_URL, groupId?: string) {
    void get().call(() => window.vela.tabs.create({ url, groupId }), 'Impossible d’ouvrir un onglet.')
    if (url === HOME_URL) {
      set({ overlay: null })
      get().focusAddress()
    }
  },

  closeTab(id) {
    void get().call(() => window.vela.tabs.close(id), 'Impossible de fermer l’onglet.')
  },

  selectTab(id) {
    void get().call(() => window.vela.tabs.activate(id), 'Onglet introuvable.')
  },

  navigate(id, input) {
    void get().call(() => window.vela.tabs.navigate(id, input), 'Navigation impossible.')
  },

  back(id) {
    void get().call(() => window.vela.tabs.back(id), 'Navigation impossible.')
  },

  forward(id) {
    void get().call(() => window.vela.tabs.forward(id), 'Navigation impossible.')
  },

  reload(id) {
    void get().call(() => window.vela.tabs.reload(id), 'Rechargement impossible.')
  },

  stop(id) {
    void get().call(() => window.vela.tabs.stop(id), 'Impossible d’arrêter la page.')
  },

  pin(id, pinned) {
    void get().call(() => window.vela.tabs.pin(id, pinned), 'Impossible d’épingler l’onglet.')
  },

  reorderTab(id, targetId, position) {
    void get().call(() => window.vela.tabs.reorder({ id, targetId, position }), 'Onglet non déplacé.')
  },

  moveTabToGroup(id, groupId) {
    void get().call(() => window.vela.tabs.reorder({ id, groupId }), 'Onglet non déplacé.')
  },

  async createGroup(tabId) {
    return get().call(
      () => window.vela.groups.create(tabId ? { tabId } : {}),
      'Impossible de créer le dossier.'
    )
  },

  async updateGroup(id, patch) {
    await get().call(() => window.vela.groups.update({ id, ...patch }), 'Dossier non modifié.')
  },

  async removeGroup(id) {
    const result = await get().call(() => window.vela.groups.remove(id), 'Dossier non supprimé.')
    if (result !== null) get().toast('Dossier supprimé, onglets conservés.')
  },

  reopen() {
    void get().call(() => window.vela.tabs.reopen(), 'Aucun onglet à rouvrir.')
  },

  splitToggle() {
    void get().call(() => window.vela.tabs.splitToggle(), 'Vue scindée indisponible.')
  },

  splitWith(id) {
    void get().call(() => window.vela.tabs.splitSet(id), 'Vue scindée indisponible.')
  },

  setSplitRatio(ratio) {
    set({ splitRatioLive: ratio })
  },

  commitSplitRatio(ratio) {
    set({ splitRatioLive: ratio })
    void get().call(() => window.vela.tabs.splitRatio(ratio), 'Impossible d’enregistrer la largeur.')
  },

  activateSpace(id) {
    void get().call(() => window.vela.spaces.activate(id), 'Espace introuvable.')
  },

  async createSpace(name, color) {
    await get().call(() => window.vela.spaces.create({ name, color }), 'Impossible de créer l’espace.')
    set({ overlay: null })
    get().toast('Nouvel espace prêt.')
  },

  async updateSpace(id, patch) {
    await get().call(() => window.vela.spaces.update({ id, ...patch }), 'Impossible de modifier l’espace.')
    set({ overlay: null })
  },

  async removeSpace(id) {
    const result = await get().call(() => window.vela.spaces.remove(id), 'Impossible de supprimer l’espace.')
    if (result !== null) {
      set({ overlay: null })
      get().toast('Espace supprimé.')
    }
  },

  toggleNotes(open) {
    set({ notesOpen: open ?? !get().notesOpen })
  },

  async saveNote(input) {
    return get().call(() => window.vela.notes.save(input), 'La note n’a pas été enregistrée.')
  },

  async deleteNote(id) {
    await get().call(() => window.vela.notes.remove(id), 'La note n’a pas été supprimée.')
    get().toast('Note supprimée.')
  },

  async createTask(title, dueToday = true) {
    const trimmed = title.trim().slice(0, 200)
    if (!trimmed) return
    let dueAt: number | null = null
    if (dueToday) {
      const end = new Date()
      end.setHours(23, 59, 59, 999)
      dueAt = end.getTime()
    }
    await get().call(() => window.vela.tasks.create({ title: trimmed, dueAt }), 'Tâche non créée.')
  },

  async toggleTask(id) {
    await get().call(() => window.vela.tasks.toggle(id), 'Tâche non mise à jour.')
  },

  async deleteTask(id) {
    await get().call(() => window.vela.tasks.remove(id), 'Tâche non supprimée.')
  },

  async completeOnboarding() {
    await get().call(() => window.vela.settings.update({ onboarded: true }), 'Onboarding non enregistré.')
  },

  setWorkMode(mode) {
    // Entrer dans l’atelier referme le panneau agent : c’est la même surface.
    set((state) => ({ workMode: mode, overlay: mode === 'work' && state.overlay === 'agent' ? null : state.overlay }))
  },

  setApproved(value) {
    set({ approved: value })
  },

  async pinEssentials() {
    const view = get().view
    if (!view) return
    const existing = new Set(view.tabs.map((t) => t.url))
    const essentials = ['https://github.com', 'https://mail.google.com', 'https://www.notion.so']
    for (const url of essentials) {
      if (existing.has(url)) continue
      await get().call(() => window.vela.tabs.create({ url, pinned: true, activate: false }), 'Épinglage impossible.')
    }
    get().toast('Essentiels épinglés.')
  },

  async importBookmarks(urls) {
    const clean = Array.from(new Set(urls.filter((u) => /^https?:\/\//i.test(u)))).slice(0, 200)
    if (clean.length === 0) {
      get().toast('Aucune URL valide trouvée.', 'error')
      return
    }
    for (const url of clean) {
      await get().call(() => window.vela.tabs.create({ url, activate: false }), 'Import impossible.')
    }
    get().toast(`${clean.length} pages importées.`)
  },

  async updateSettings(patch) {
    await get().call(() => window.vela.settings.update(patch), 'Réglages non enregistrés.')
  },

  async setKey(provider, key) {
    const result = await get().call(
      () => window.vela.settings.setKey({ provider, key }),
      'Clé non enregistrée.'
    )
    if (result) get().toast(key ? 'Clé chiffrée dans le trousseau système.' : 'Clé supprimée.')
    return Boolean(result)
  },

  async testKey(provider) {
    const result = await get().call(
      () => window.vela.settings.testKey(provider),
      'Test impossible pour le moment.'
    )
    return result ?? { ok: false, message: 'Test impossible pour le moment.' }
  },

  async refreshUpdate() {
    const info = await get().call(() => window.vela.updates.status(), 'État de mise à jour indisponible.')
    if (info) set({ update: info })
  },

  async checkUpdate() {
    set((state) => ({
      update: state.update
        ? { ...state.update, state: 'checking', message: null }
        : {
            state: 'checking',
            version: null,
            currentVersion: '',
            progress: 0,
            message: null,
            releaseUrl: 'https://github.com/DmzGamingYT/vela/releases'
          }
    }))
    const info = await get().call(() => window.vela.updates.check(), 'Vérification impossible.')
    if (info) {
      set({ update: info })
      if (info.state === 'not-available') get().toast('Vela est à jour.')
      else if (info.state === 'error' && info.message) get().toast(info.message, 'error')
    }
  },

  async downloadUpdate() {
    const info = await get().call(() => window.vela.updates.download(), 'Téléchargement impossible.')
    if (info) set({ update: info })
  },

  async installUpdate() {
    await get().call(() => window.vela.updates.install(), 'Redémarrage impossible.')
  },

  async openReleases() {
    await get().call(() => window.vela.updates.releases(), 'Ouverture impossible.')
  },

  openAgent(prompt = '') {
    set({ overlay: 'agent', agentDraft: prompt })
  },

  async startAgent(prompt, tabIds) {
    const view = get().view
    if (!view) return
    if (!prompt.trim()) {
      get().toast('Dites à l’agent quoi chercher.', 'error')
      return
    }
    const sources = view.tabs
      .filter((tab) => tabIds.includes(tab.id) && !isHomeUrl(tab.url))
      .map((tab) => ({ tabId: tab.id, title: tab.title, url: tab.url }))
    set({
      overlay: 'agent',
      agentDraft: prompt,
      agentSentTabIds: view.settings.agent.mode === 'api' ? sources.map((source) => source.tabId!).filter(Boolean) : [],
      agent: {
        ...EMPTY_AGENT,
        status: 'running',
        mode: view.settings.agent.mode,
        prompt,
        sources: []
      }
    })
    const result = await get().call(
      () => window.vela.agent.run({ prompt, sources, spaceId: view.activeSpaceId }),
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
    flushAgentDelta()
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
      overlay: get().workMode === 'work' ? null : 'agent',
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
        sources: full.sources
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

  async findInPage(query, forward = true) {
    const view = get().view
    const tabId = view?.activeTabId
    if (!tabId) return
    set({ findQuery: query })
    const result = await get().call(
      () => window.vela.tabs.find(tabId, query, forward),
      'Recherche dans la page impossible.'
    )
    if (result && get().view?.activeTabId === tabId && get().findQuery === query) set({ findResult: result })
  },

  closeFind() {
    const tabId = get().view?.activeTabId
    if (tabId) void window.vela.tabs.findStop(tabId)
    set({ findOpen: false, findQuery: '', findResult: { matches: 0, activeMatchOrdinal: 0 } })
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
      set((state) => ({ notesOpen: true, overlay: state.overlay === 'agent' ? null : state.overlay }))
    }
  },

  handleShortcut(event) {
    const state = get()
    const view = state.view
    if (!view) return
    const active = view.tabs.find((tab) => tab.id === view.activeTabId)
    const spaceTabs = view.tabs.filter((tab) => tab.spaceId === view.activeSpaceId)

    switch (event.action) {
      case 'command':
        state.setOverlay(state.overlay === 'command' ? null : 'command')
        break
      case 'address':
        state.setOverlay(null)
        setTimeout(() => state.focusAddress(), 20)
        break
      case 'new-tab':
        state.newTab()
        break
      case 'close-tab':
        if (active) state.closeTab(active.id)
        break
      case 'reopen-tab':
        state.reopen()
        break
      case 'split':
        state.splitToggle()
        break
      case 'notes':
        state.toggleNotes()
        break
      case 'agent':
        state.setOverlay(state.overlay === 'agent' ? null : 'agent')
        break
      case 'work':
        state.setWorkMode(state.workMode === 'work' ? 'browse' : 'work')
        break
      case 'brief':
        state.setOverlay(state.overlay === 'brief' ? null : 'brief')
        break
      case 'settings':
        state.setOverlay(state.overlay === 'settings' ? null : 'settings')
        break
      case 'sidebar':
        void state.updateSettings({ sidebarCollapsed: !view.settings.sidebarCollapsed })
        break
      case 'reload':
        if (active) state.reload(active.id)
        break
      case 'back':
        if (active) state.back(active.id)
        break
      case 'forward':
        if (active) state.forward(active.id)
        break
      case 'find':
        set({ findOpen: true })
        break
      case 'find-next':
        if (state.findQuery) void state.findInPage(state.findQuery, true)
        break
      case 'find-prev':
        if (state.findQuery) void state.findInPage(state.findQuery, false)
        break
      case 'tab-select': {
        const target = spaceTabs[(event.digit ?? 1) - 1]
        if (target) state.selectTab(target.id)
        break
      }
      case 'escape':
        if (state.findOpen) state.closeFind()
        else if (state.overlay) state.setOverlay(null)
        else if (state.notesOpen) state.toggleNotes(false)
        break
      default:
        break
    }
  },

  handleAgentEvent(event) {
    if (event.type === 'delta') {
      const current = get().agent
      if (current.runId && event.runId !== current.runId) return
      deltaBuffer += event.text
      deltaRunId = event.runId
      if (!deltaTimer) deltaTimer = setTimeout(flushAgentDelta, DELTA_FLUSH_MS)
      return
    }
    // Toute autre étape (fin, erreur, arrêt) doit voir le texte déjà reçu.
    flushAgentDelta()
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
              sources: event.sources ?? []
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
}))
