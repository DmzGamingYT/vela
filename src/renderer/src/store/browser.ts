import { create } from 'zustand'
import type { AgentEvent, AgentMode, AppView, Note, ProviderId, ShortcutEvent, TabGroup } from '@shared/types'
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
}

const EMPTY_AGENT: AgentUi = {
  runId: null,
  title: '',
  steps: [],
  markdown: '',
  status: 'idle',
  error: null,
  mode: 'demo',
  prompt: ''
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
  openAgent(prompt?: string): void
  startAgent(prompt: string, tabIds: string[]): Promise<void>
  cancelAgent(): void
  resetAgent(): void
  saveAgentNote(): Promise<void>
  handleShortcut(event: ShortcutEvent): void
  handleAgentEvent(event: AgentEvent): void
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
  toasts: [],
  splitRatioLive: null,

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
    set({ workMode: mode })
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
    const clean = urls.filter((u) => /^https?:/i.test(u)).slice(0, 20)
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
      agent: {
        ...EMPTY_AGENT,
        status: 'running',
        mode: view.settings.agent.mode,
        prompt
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
    window.vela.agent.cancel(runId)
    set((state) => ({ agent: { ...state.agent, status: 'cancelled' } }))
  },

  resetAgent() {
    set({ agent: EMPTY_AGENT })
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
      case 'tab-select': {
        const target = spaceTabs[(event.digit ?? 1) - 1]
        if (target) state.selectTab(target.id)
        break
      }
      case 'escape':
        if (state.overlay) state.setOverlay(null)
        else if (state.notesOpen) state.toggleNotes(false)
        break
      default:
        break
    }
  },

  handleAgentEvent(event) {
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
              mode: event.mode
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
        case 'delta':
          return { agent: { ...agent, markdown: agent.markdown + event.text } }
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
