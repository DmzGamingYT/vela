import { create } from 'zustand'
import type { UpdateInfo } from '@shared/api'
import type {
  AgentEvent,
  AgentMode,
  AppView,
  Note,
  ProviderId,
  SelectionPayload,
  ShortcutEvent,
  TabGroup,
  WorkSummary
} from '@shared/types'
import { HOME_URL } from '@shared/types'
import { hostOf, isHomeUrl } from '@shared/url'
import type { CreateSpaceInput, SaveNoteInput, SettingsPatch, UpdateSpaceInput } from '@shared/api'

/**
 * Références stables entre deux diffusions d'état.
 *
 * L'état traverse l'IPC : chaque diffusion recrée tous les objets, donc un
 * composant abonné à `settings`, `bookmarks` ou `spaces` se redessinait même
 * quand rien de ce qu'il affiche n'avait changé (une page qui charge produit
 * plusieurs diffusions par seconde). On garde la référence précédente des
 * parties identiques, et React s'arrête là.
 */
let previousView: AppView | null = null
let previousPrints = new Map<string, string>()

function stableView(next: AppView): AppView {
  if (!previousView) {
    previousView = next
    previousPrints = new Map(Object.keys(next).map((key) => [key, JSON.stringify(next[key as keyof AppView])]))
    return next
  }
  const merged: Record<string, unknown> = { ...next }
  const prints = new Map<string, string>()
  for (const key of Object.keys(next)) {
    const print = JSON.stringify(next[key as keyof AppView])
    prints.set(key, print)
    if (previousPrints.get(key) === print) merged[key] = previousView[key as keyof AppView]
  }
  previousView = merged as unknown as AppView
  previousPrints = prints
  return previousView
}

export type Overlay =
  | 'command'
  | 'brief'
  | 'settings'
  | 'space'
  | 'processes'
  | 'downloads'
  | 'history'
  | 'bookmarks'
  | 'protection'
  | null

export type WorkMode = 'browse' | 'work'

export interface Toast {
  id: string
  text: string
  tone: 'info' | 'error'
  action?: { label: string; run: () => void }
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
  /** Panneau agent ancré à droite : la page reste visible à côté. */
  agentOpen: boolean
  spaceEditId: string | null
  agent: AgentUi
  agentDraft: string
  workMode: WorkMode
  approved: boolean
  agentSentTabIds: string[]
  /** Onglet à joindre automatiquement quand l'agent s'ouvre depuis une sélection. */
  agentSourceTab: string | null
  /** Dernier rangement par site, pour l'annulation en un clic. */
  lastGrouping: { groupIds: string[]; tabIds: string[] } | null
  findOpen: boolean
  findQuery: string
  findResult: { matches: number; activeMatchOrdinal: number }
  toasts: Toast[]
  splitRatioLive: number | null
  init(): Promise<void>
  call<T>(task: () => Promise<T>, fallback: string): Promise<T | null>
  toast(text: string, tone?: Toast['tone'], action?: Toast['action']): void
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
  reorderTab(id: string, targetId: string | null, position: 'before' | 'after', pinned?: boolean): void
  moveTabToGroup(id: string, groupId: string | null): void
  createGroup(tabId?: string): Promise<TabGroup | null>
  updateGroup(id: string, patch: { name?: string; color?: string; collapsed?: boolean }): Promise<void>
  removeGroup(id: string): Promise<void>
  reopen(): void
  splitToggle(): void
  splitWith(id: string): void
  openSplit(url: string): void
  setSplitRatio(ratio: number): void
  commitSplitRatio(ratio: number): void
  activateSpace(id: string): void
  createSpace(input: CreateSpaceInput): Promise<void>
  updateSpace(id: string, patch: Omit<UpdateSpaceInput, 'id'>): Promise<void>
  saveSpaceShortcuts(id: string, shortcuts: import('@shared/space').SpaceShortcut[]): Promise<void>
  removeSpace(id: string): Promise<void>
  toggleNotes(open?: boolean): void
  toggleAgent(open?: boolean): void
  saveNote(input: SaveNoteInput): Promise<Note | null>
  deleteNote(id: string): Promise<void>
  createTask(title: string, dueToday?: boolean): Promise<void>
  toggleTask(id: string): Promise<void>
  deleteTask(id: string): Promise<void>
  completeOnboarding(): Promise<void>
  setWorkMode(mode: WorkMode): void
  setApproved(value: boolean): void
  pinEssentials(selection?: string[]): Promise<void>
  importBookmarks(urls: string[], entries?: { title: string; url: string }[]): Promise<void>
  printPage(): Promise<void>
  toggleBookmark(tabId?: string): Promise<void>
  removeBookmark(id: string): Promise<void>
  moveBookmark(id: string, position: number): Promise<boolean>
  reorderBookmarks(ids: string[]): Promise<boolean>
  removeHistory(url: string): Promise<void>
  captureSelection(): Promise<void>
  toggleSiteProtection(host: string): Promise<void>
  handleSelection(payload: SelectionPayload): void
  groupTabsBySite(): Promise<void>
  undoGrouping(): Promise<void>
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
  agentOpen: false,
  spaceEditId: null,
  agent: EMPTY_AGENT,
  agentDraft: '',
  workMode: 'browse',
  approved: false,
  agentSentTabIds: [],
  agentSourceTab: null,
  lastGrouping: null,
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
      set({ view: stableView(view), ready: true })
    } catch (error) {
      get().toast(cleanError(error, 'Impossible de charger Vela.'), 'error')
    }
    window.vela.onState((incoming) =>
      set((state) => ({
        view: stableView(incoming),
        splitRatioLive:
          state.splitRatioLive !== null &&
          Math.abs(incoming.splitRatio - state.splitRatioLive) < 0.002
            ? null
            : state.splitRatioLive
      }))
    )
    window.vela.onShortcut((event) => get().handleShortcut(event))
    window.vela.agent.onEvent((event) => get().handleAgentEvent(event))
    window.vela.selection.onSelect((payload) => get().handleSelection(payload))
    try {
      const status = await window.vela.updates.status()
      set({ update: status })
    } catch {
      /* mises à jour indisponibles en dev */
    }
    window.vela.updates.onEvent((info) => {
      set({ update: info })
      // Silencieux pendant la préparation : la barre d'état suit la progression.
      if (info.state === 'downloaded') {
        const version = info.version ? `${info.version} ` : ''
        get().toast(
          window.vela.platform === 'darwin'
            ? `Mise à jour ${version}prête — « Installer » vous attend.`
            : `Mise à jour ${version}prête — elle s’installera quand vous quitterez Vela.`
        )
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

  toast(text, tone = 'info', action) {
    const id = crypto.randomUUID()
    set((state) => ({ toasts: [...state.toasts, { id, text, tone, action }].slice(-3) }))
    setTimeout(
      () => {
        set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }))
      },
      action ? 7000 : 4200
    )
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

  reorderTab(id, targetId, position, pinned) {
    void get().call(
      () => window.vela.tabs.reorder({ id, targetId, position, ...(pinned === undefined ? {} : { pinned }) }),
      'Onglet non déplacé.'
    )
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

  /** Ouvre une adresse dans un nouvel onglet, puis la place en vue scindée. */
  openSplit(url) {
    void (async () => {
      const created = await get().call(() => window.vela.tabs.create({ url }), 'Onglet non ouvert.')
      if (created) get().splitWith(created.id)
    })()
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

  async createSpace(input) {
    await get().call(() => window.vela.spaces.create(input), 'Impossible de créer l’espace.')
    set({ overlay: null })
    get().toast('Nouvel espace prêt.')
  },

  async updateSpace(id, patch) {
    await get().call(() => window.vela.spaces.update({ id, ...patch }), 'Impossible de modifier l’espace.')
    set({ overlay: null })
  },

  // Barre de sites épinglés : l'affichage bouge tout de suite, le disque suit.
  // Le prochain `view` reçu du processus principal fait foi.
  async saveSpaceShortcuts(id, shortcuts) {
    set((state) =>
      state.view
        ? {
            view: {
              ...state.view,
              spaces: state.view.spaces.map((space) =>
                space.id === id ? { ...space, shortcuts } : space
              )
            }
          }
        : {}
    )
    await get().call(
      () => window.vela.spaces.update({ id, shortcuts }),
      'Impossible d’enregistrer les sites de cet espace.'
    )
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

  toggleAgent(open) {
    // Le panneau vit à côté de la page : ouvrir l’agent ne masque plus rien.
    set({ agentOpen: open ?? !get().agentOpen, overlay: null })
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
    set((state) => ({ workMode: mode, agentOpen: mode === 'work' ? false : state.agentOpen }))
  },

  setApproved(value) {
    set({ approved: value })
  },

  async pinEssentials(selection) {
    const view = get().view
    if (!view) return
    const existing = new Set(view.tabs.map((t) => t.url))
    const essentials = selection && selection.length > 0 ? selection : ['https://github.com', 'https://www.notion.so']
    let pinned = 0
    for (const url of essentials) {
      if (existing.has(url)) continue
      const created = await get().call(
        () => window.vela.tabs.create({ url, pinned: true, activate: false }),
        'Épinglage impossible.'
      )
      if (created) pinned += 1
    }
    get().toast(pinned > 0 ? `${pinned} page${pinned > 1 ? 's' : ''} épinglée${pinned > 1 ? 's' : ''}.` : 'Déjà épinglé.')
  },

  async toggleBookmark(tabId) {
    const view = get().view
    if (!view) return
    const tab = view.tabs.find((item) => item.id === (tabId ?? view.activeTabId))
    if (!tab || isHomeUrl(tab.url)) {
      get().toast('Ouvrez une page pour la mettre en marque-page.', 'error')
      return
    }
    const added = await get().call(
      () => window.vela.bookmarks.toggle({ url: tab.url, title: tab.title, favicon: tab.favicon }),
      'Marque-page non enregistré.'
    )
    if (added === null) return
    get().toast(added ? 'Page ajoutée aux marque-pages.' : 'Page retirée des marque-pages.')
  },

  async removeBookmark(id) {
    await get().call(() => window.vela.bookmarks.remove(id), 'Marque-page non supprimé.')
  },

  async moveBookmark(id, position) {
    const moved = await get().call(
      () => window.vela.bookmarks.move(id, position),
      'Favori non déplacé.'
    )
    return moved === true
  },

  async reorderBookmarks(ids) {
    const applied = await get().call(
      () => window.vela.bookmarks.reorder(ids),
      'Favoris non réordonnés.'
    )
    return applied === true
  },

  async removeHistory(url) {
    await get().call(() => window.vela.history.remove(url), 'Entrée non supprimée.')
  },

  async captureSelection() {
    const note = await get().call(() => window.vela.notes.captureSelection(), 'Capture impossible.')
    if (note === null) {
      get().toast('Sélectionnez du texte dans la page pour le capturer.', 'error')
      return
    }
    get().toast('Extrait enregistré dans les notes.')
    set({ notesOpen: true })
  },

  async toggleSiteProtection(host) {
    if (!host) return
    const exempted = await get().call(() => window.vela.privacy.toggleSite(host), 'Réglage non enregistré.')
    if (exempted === null) return
    get().toast(
      exempted ? `Bloqueur désactivé pour ${host}.` : `Bloqueur réactivé pour ${host}.`
    )
    const view = get().view
    const active = view?.tabs.find((tab) => tab.id === view.activeTabId)
    if (active && !isHomeUrl(active.url)) get().reload(active.id)
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
          set({ notesOpen: true })
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
      agentSourceTab: payload.tabId,
      workMode: 'browse',
      overlay: null
    })
  },

  async groupTabsBySite() {
    const view = get().view
    if (!view) return
    const candidates = view.tabs.filter(
      (tab) =>
        !tab.pinned &&
        !tab.groupId &&
        tab.spaceId === view.activeSpaceId &&
        /^https?:/i.test(tab.url)
    )
    const byHost = new Map<string, typeof candidates>()
    for (const tab of candidates) {
      const host = hostOf(tab.url)
      if (!host) continue
      const bucket = byHost.get(host)
      if (bucket) bucket.push(tab)
      else byHost.set(host, [tab])
    }
    const targets = Array.from(byHost).filter(([, list]) => list.length >= 2).slice(0, 6)
    if (targets.length === 0) {
      get().toast('Aucun groupe de deux onglets ou plus à ranger.')
      return
    }
    const groupIds: string[] = []
    for (const [host, list] of targets) {
      const group = await get().call(
        () => window.vela.groups.create({ name: host, tabId: list[0].id }),
        'Rangement impossible.'
      )
      if (!group) continue
      groupIds.push(group.id)
      for (const tab of list.slice(1)) {
        await get().call(() => window.vela.tabs.reorder({ id: tab.id, groupId: group.id }), 'Onglet non rangé.')
      }
    }
    if (groupIds.length === 0) return
    set({ lastGrouping: { groupIds, tabIds: targets.flatMap(([, list]) => list.map((tab) => tab.id)) } })
    get().toast(
      `${groupIds.length} dossier${groupIds.length > 1 ? 's' : ''} créé${groupIds.length > 1 ? 's' : ''} par site.`,
      'info',
      { label: 'Annuler', run: () => void get().undoGrouping() }
    )
  },

  async undoGrouping() {
    const last = get().lastGrouping
    if (!last) {
      get().toast('Rien à annuler.')
      return
    }
    for (const id of last.groupIds) {
      await get().call(() => window.vela.groups.remove(id), 'Annulation impossible.')
    }
    set({ lastGrouping: null })
    get().toast('Rangement annulé, onglets conservés.')
  },

  async printPage() {
    const view = get().view
    const active = view?.tabs.find((tab) => tab.id === view.activeTabId)
    if (!active || isHomeUrl(active.url)) {
      get().toast('Ouvrez une page à imprimer.', 'error')
      return
    }
    const ok = await get().call(() => window.vela.tabs.print(active.id), 'Impression impossible.')
    if (ok === false) get().toast('Impression impossible.', 'error')
  },

  async importBookmarks(urls, entries) {
    const clean = Array.from(new Set(urls.filter((u) => /^https?:\/\//i.test(u)))).slice(0, 500)
    if (clean.length === 0) {
      get().toast('Aucune URL valide trouvée.', 'error')
      return
    }
    const titles = new Map((entries ?? []).map((entry) => [entry.url, entry.title]))
    const payload = clean.map((url) => ({ url, title: titles.get(url) ?? '' }))
    const added = await get().call(
      () => window.vela.bookmarks.addMany(payload),
      'Import des favoris impossible.'
    )
    if (added === null) return
    if (added === 0) get().toast('Ces favoris sont déjà enregistrés.')
    else get().toast(`${added} marque-page${added > 1 ? 's' : ''} importé${added > 1 ? 's' : ''}.`)
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
    set({ agentOpen: true, overlay: null, agentDraft: prompt })
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
      agentOpen: get().workMode !== 'work',
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
      set({ notesOpen: true, agentOpen: false })
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
      case 'mini':
        // Petite fenêtre jetable : la page courante, sans nouvel onglet.
        void window.vela.mini.open({})
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
        state.toggleAgent()
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
      case 'zoom-in':
        if (active) void window.vela.tabs.zoom(active.id, 'in')
        break
      case 'zoom-out':
        if (active) void window.vela.tabs.zoom(active.id, 'out')
        break
      case 'zoom-reset':
        if (active) void window.vela.tabs.zoom(active.id, 'reset')
        break
      case 'back':
        if (active) state.back(active.id)
        break
      case 'forward':
        if (active) state.forward(active.id)
        break
      case 'bookmark':
        void state.toggleBookmark(active?.id)
        break
      case 'bookmarks':
        state.setOverlay(state.overlay === 'bookmarks' ? null : 'bookmarks')
        break
      case 'history':
        state.setOverlay(state.overlay === 'history' ? null : 'history')
        break
      case 'print':
        void state.printPage()
        break
      case 'home':
        if (active) void window.vela.tabs.home(active.id)
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
        else if (state.agentOpen) state.toggleAgent(false)
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
