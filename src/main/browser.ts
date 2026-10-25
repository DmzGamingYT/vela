import { app, BrowserWindow, ipcMain, nativeTheme, session, shell } from 'electron'
import type {
  CreateGroupInput,
  CreateSpaceInput,
  CreateTabInput,
  ReorderTabsInput,
  SaveNoteInput,
  SettingsPatch,
  UpdateGroupInput
} from '@shared/api'
import { buildBrief } from '@shared/brief'
import {
  createGroup as createGroupState,
  createSpace as createSpaceState,
  createTab as createTabState,
  newId,
  SPACE_COLORS
} from '@shared/defaults'
import { moveTab } from '@shared/ordering'
import { buildTestRequest, isProviderId, providerById } from '@shared/providers'
import {
  HOME_URL,
  type AppView,
  type DownloadItem,
  type LayoutRequest,
  type NoteMeta,
  type PaneRect,
  type ProcessInfo,
  type ProviderId,
  type Settings,
  type ShortcutAction,
  type ShortcutEvent,
  type TabGroup,
  type TabState,
  type TabView
} from '@shared/types'
import { isHomeUrl, titleFromUrl } from '@shared/url'
import { AgentRunner } from './agent'
import { NotesStore } from './notes'
import { Store } from './store'
import { TabManager, type TabHost } from './tabs'

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asId(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Identifiant invalide.')
  return value
}

function isPane(value: unknown): value is PaneRect {
  const pane = value as PaneRect
  return Boolean(
    pane &&
      typeof pane.tabId === 'string' &&
      Number.isFinite(pane.x) &&
      Number.isFinite(pane.y) &&
      Number.isFinite(pane.width) &&
      Number.isFinite(pane.height)
  )
}

export class Browser {
  readonly store: Store
  readonly notes: NotesStore
  readonly tabs: TabManager
  readonly agent: AgentRunner

  private win: BrowserWindow | null = null
  private noteCache: NoteMeta[]
  private downloads: DownloadItem[] = []
  private trackedSessions = new Set<string>()
  private broadcastTimer: NodeJS.Timeout | null = null
  private sweepTimer: NodeJS.Timeout | null = null
  private briefCacheKey = ''
  private briefCache: ReturnType<typeof buildBrief> | null = null
  private overlay = false
  private registered = false

  private readonly host: TabHost = {
    tab: (id) => this.store.get().tabs.find((tab) => tab.id === id),
    trackSession: (ses) => this.trackDownloads(ses),
    space: (id) => this.store.get().spaces.find((space) => space.id === id),
    patchTab: (id, patch) => {
      const tab = this.store.get().tabs.find((item) => item.id === id)
      if (!tab) return
      Object.assign(tab, patch)
      this.store.schedule()
    },
    changed: () => this.broadcast(),
    createTab: (spaceId, url) => this.createTab({ spaceId, url, activate: true }).id,
    tabsOfSpace: (spaceId) => this.store.get().tabs.filter((tab) => tab.spaceId === spaceId),
    shortcut: (event) => this.send('shortcut', event),
    settings: () => this.store.get().settings,
    visited: (spaceId, url, title) => {
      this.store.pushHistory({ id: newId(), spaceId, url, title, visitedAt: Date.now() })
    }
  }

  constructor(dir: string) {
    this.store = new Store(dir)
    this.notes = new NotesStore(dir)
    this.notes.prune()
    this.noteCache = this.notes.list()
    this.tabs = new TabManager(() => this.win, this.host)
    this.startSweeper()
    this.agent = new AgentRunner(
      () => this.win,
      () => this.store.get().settings,
      (provider: ProviderId) => this.store.getSecret(provider),
      (tabId) => this.tabs.excerpt(tabId)
    )
  }

  attach(win: BrowserWindow): void {
    this.win = win
    nativeTheme.themeSource = this.store.get().settings.theme
    win.webContents.on('before-input-event', (event, input) => this.tabs.handleInput(event, input))
    win.on('closed', () => {
      if (this.win === win) this.win = null
    })
  }

  private send(channel: string, payload: unknown): void {
    const win = this.win
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return
    win.webContents.send(channel, payload)
  }

  sendShortcut(action: ShortcutAction): void {
    const event: ShortcutEvent = { action }
    this.send('shortcut', event)
  }

  broadcast(): void {
    if (this.broadcastTimer) return
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null
      this.send('state:changed', this.view())
    }, 120)
  }

  private keepAliveIds(): Set<string> {
    const state = this.store.get()
    const keep = new Set<string>()
    for (const spaceId of Object.keys(state.activeTabBySpace)) {
      const active = state.activeTabBySpace[spaceId]
      if (active) keep.add(active)
      const second = state.secondTabBySpace[spaceId]
      if (state.split && second) keep.add(second)
    }
    return keep
  }

  private startSweeper(): void {
    if (this.sweepTimer) return
    this.sweepTimer = setInterval(() => {
      try {
        this.tabs.sweepInactive(this.keepAliveIds())
        void this.clearIdleCaches()
      } catch {
        /* le balayage ne doit jamais casser la boucle principale */
      }
    }, 60_000)
    if (typeof this.sweepTimer.unref === 'function') this.sweepTimer.unref()
  }

  private trackDownloads(ses: Electron.Session, partition = 'default'): void {
    const key = partition
    if (this.trackedSessions.has(key)) return
    this.trackedSessions.add(key)
    ses.on('will-download', (_event, item) => {
      const id = newId()
      const name = item.getFilename() || 'Téléchargement'
      const url = item.getURL()
      const entry: DownloadItem = {
        id,
        name: name.slice(0, 120),
        url: url.slice(0, 2000),
        state: 'progress',
        received: 0,
        total: item.getTotalBytes() || 0,
        path: null,
        startedAt: Date.now()
      }
      this.downloads = [entry, ...this.downloads].slice(0, 30)
      this.broadcast()
      item.on('updated', (_e, state) => {
        const found = this.downloads.find((d) => d.id === id)
        if (!found) return
        found.received = item.getReceivedBytes()
        found.total = item.getTotalBytes() || found.total
        if (state === 'interrupted') found.state = 'cancelled'
        this.broadcast()
      })
      item.once('done', (_e, state) => {
        const found = this.downloads.find((d) => d.id === id)
        if (found) {
          found.state = state === 'completed' ? 'done' : 'cancelled'
          found.received = item.getReceivedBytes()
          found.path = state === 'completed' ? item.getSavePath() : null
        }
        this.broadcast()
      })
    })
  }

  private async clearIdleCaches(): Promise<void> {
    try {
      const state = this.store.get()
      const activePartition = state.spaces.find((s) => s.id === state.activeSpaceId)?.partition
      for (const space of state.spaces) {
        if (space.partition === activePartition) continue
        const hasLive = state.tabs.some((t) => t.spaceId === space.id && this.tabs.liveIds().has(t.id))
        if (hasLive) continue
        try {
          await session.fromPartition(space.partition).clearCache()
        } catch {
          /* partition déjà libérée */
        }
      }
    } catch {
      /* jamais bloquant */
    }
  }

  metrics(): { live: number; processes: ProcessInfo[] } {
    const state = this.store.get()
    const live = this.tabs.liveIds()
    const processes: ProcessInfo[] = state.tabs.map((tab) => ({
      tabId: tab.id,
      title: tab.title,
      url: tab.url,
      live: live.has(tab.id),
      blocked: this.tabs.runtimeOf(tab.id).blocked,
      type: 'tab'
    }))
    try {
      const metrics = app.getAppMetrics()
      const mem = metrics.find((m) => m.type === 'Browser')
      if (mem) {
        processes.unshift({
          tabId: null,
          title: `Vela — ${(mem.memory.workingSetSize / 1024).toFixed(0)} Mo`,
          url: '',
          live: true,
          blocked: this.tabs.blockedTotal(),
          type: 'app'
        })
      }
    } catch {
      /* métriques indisponibles en dev */
    }
    return { live: live.size, processes: processes.slice(0, 60) }
  }

  view(): AppView {
    const state = this.store.get()
    const activeTabId = state.activeTabBySpace[state.activeSpaceId] ?? ''
    const candidate = state.split ? (state.secondTabBySpace[state.activeSpaceId] ?? null) : null
    const secondTabId = candidate && state.tabs.some((tab) => tab.id === candidate) ? candidate : null
    const tabs: TabView[] = state.tabs.map((tab) => ({ ...tab, ...this.tabs.runtimeOf(tab.id) }))
    const blockedTotal = this.tabs.blockedTotal()
    const briefKey = `${state.history.length}:${state.history[0]?.visitedAt ?? 0}:${state.tabs.length}:${state.tabs.map((tab) => tab.lastActiveAt).join(',')}:${blockedTotal}`
    let brief = this.briefCache
    if (!brief || this.briefCacheKey !== briefKey) {
      brief = buildBrief({ tabs: state.tabs, history: state.history, now: Date.now(), blocked: blockedTotal })
      this.briefCache = brief
      this.briefCacheKey = briefKey
    }

    return {
      spaces: state.spaces,
      tabs,
      groups: state.groups,
      activeSpaceId: state.activeSpaceId,
      activeTabId,
      secondTabId,
      split: Boolean(secondTabId),
      splitRatio: state.splitRatio,
      settings: state.settings,
      history: state.history.slice(0, 80),
      notes: this.noteCache,
      tasks: state.tasks.slice(0, 200),
      downloads: this.downloads.slice(0, 30),
      brief,
      blockedTotal
    }
  }

  private focusActive(): void {
    setTimeout(() => {
      const state = this.store.get()
      const tab = state.tabs.find((item) => item.id === state.activeTabBySpace[state.activeSpaceId])
      if (!tab || isHomeUrl(tab.url) || this.overlay) this.win?.webContents.focus()
      else this.tabs.focus(tab.id)
    }, 40)
  }

  createTab(input: CreateTabInput = {}): TabState {
    const state = this.store.get()
    const spaceId =
      typeof input.spaceId === 'string' && state.spaces.some((space) => space.id === input.spaceId)
        ? input.spaceId
        : state.activeSpaceId
    const url = typeof input.url === 'string' && input.url ? input.url : HOME_URL
    const pinned = Boolean(input.pinned)
    let groupId: string | null = null
    if (!pinned && typeof input.groupId === 'string') {
      const group = state.groups.find((item) => item.id === input.groupId && item.spaceId === spaceId)
      if (group) {
        groupId = group.id
        if (group.collapsed) group.collapsed = false
      }
    }
    const tab = createTabState(spaceId, Date.now(), {
      url,
      title: isHomeUrl(url) ? 'Nouvel onglet' : titleFromUrl(url),
      pinned,
      groupId
    })
    state.tabs.push(tab)

    if (input.activate !== false) {
      const previous = state.activeTabBySpace[spaceId]
      state.activeSpaceId = spaceId
      state.activeTabBySpace[spaceId] = tab.id
      if (state.split && state.secondTabBySpace[spaceId] === tab.id) state.secondTabBySpace[spaceId] = previous ?? null
      tab.lastActiveAt = Date.now()
      this.focusActive()
    }

    this.store.schedule()
    this.broadcast()
    return tab
  }

  private activateTab(id: string): void {
    const state = this.store.get()
    const tab = state.tabs.find((item) => item.id === id)
    if (!tab) return
    const previous = state.activeTabBySpace[tab.spaceId]
    if (state.split && state.secondTabBySpace[tab.spaceId] === tab.id) {
      state.secondTabBySpace[tab.spaceId] = previous && previous !== tab.id ? previous : null
    }
    state.activeSpaceId = tab.spaceId
    state.activeTabBySpace[tab.spaceId] = tab.id
    tab.lastActiveAt = Date.now()
    if (tab.groupId) {
      const group = state.groups.find((item) => item.id === tab.groupId)
      if (group?.collapsed) group.collapsed = false
    }
    this.store.schedule()
    this.broadcast()
    this.focusActive()
  }

  private closeTab(id: string): void {
    const state = this.store.get()
    const tab = state.tabs.find((item) => item.id === id)
    if (!tab) return
    const spaceId = tab.spaceId
    const before = state.tabs.filter((item) => item.spaceId === spaceId)
    const index = before.findIndex((item) => item.id === id)

    state.tabs = state.tabs.filter((item) => item.id !== id)
    state.closed = [
      { spaceId, url: tab.url, title: tab.title, pinned: tab.pinned, groupId: tab.groupId ?? null },
      ...state.closed
    ].slice(0, 25)

    if (state.secondTabBySpace[spaceId] === id) state.secondTabBySpace[spaceId] = null

    if (state.activeTabBySpace[spaceId] === id) {
      const remaining = state.tabs.filter((item) => item.spaceId === spaceId)
      let next = remaining[Math.min(index, remaining.length - 1)]
      if (!next) {
        next = createTabState(spaceId)
        state.tabs.push(next)
      }
      state.activeTabBySpace[spaceId] = next.id
      next.lastActiveAt = Date.now()
      if (state.secondTabBySpace[spaceId] === next.id) state.secondTabBySpace[spaceId] = null
    }

    this.tabs.destroy(id)
    this.store.schedule()
    this.broadcast()
    this.focusActive()
  }

  private reopenTab(): void {
    const state = this.store.get()
    const entry = state.closed.shift()
    if (!entry) return
    const spaceId = state.spaces.some((space) => space.id === entry.spaceId) ? entry.spaceId : state.activeSpaceId
    const group = entry.groupId
      ? state.groups.find((item) => item.id === entry.groupId && item.spaceId === spaceId)
      : undefined
    const tab = createTabState(spaceId, Date.now(), {
      url: entry.url || HOME_URL,
      title: entry.title || (isHomeUrl(entry.url) ? 'Nouvel onglet' : titleFromUrl(entry.url)),
      pinned: entry.pinned,
      groupId: group?.id ?? null
    })
    state.tabs.push(tab)
    state.activeSpaceId = spaceId
    state.activeTabBySpace[spaceId] = tab.id
    tab.lastActiveAt = Date.now()
    this.store.schedule()
    this.broadcast()
    this.focusActive()
  }

  private toggleSplit(): void {
    const state = this.store.get()
    const spaceId = state.activeSpaceId
    const activeId = state.activeTabBySpace[spaceId]
    const existing = state.secondTabBySpace[spaceId]
    if (state.split && existing) {
      state.split = false
    } else if (existing && existing !== activeId && state.tabs.some((tab) => tab.id === existing)) {
      state.split = true
    } else {
      let second = state.tabs.find((tab) => tab.spaceId === spaceId && tab.id !== activeId)
      if (!second) {
        second = createTabState(spaceId)
        state.tabs.push(second)
      }
      state.secondTabBySpace[spaceId] = second.id
      state.split = true
    }
    this.store.schedule()
    this.broadcast()
  }

  private setSplitTab(id: string): void {
    const state = this.store.get()
    const tab = state.tabs.find((item) => item.id === id)
    if (!tab) return
    const activeId = state.activeTabBySpace[tab.spaceId]
    if (tab.id === activeId) {
      const fallback = state.tabs.find((item) => item.spaceId === tab.spaceId && item.id !== activeId)
      state.secondTabBySpace[tab.spaceId] = fallback?.id ?? null
      state.split = Boolean(fallback)
    } else {
      state.secondTabBySpace[tab.spaceId] = tab.id
      state.activeSpaceId = tab.spaceId
      state.split = true
    }
    this.store.schedule()
    this.broadcast()
  }

  private addSpace(input: unknown): void {
    const payload = (input ?? {}) as CreateSpaceInput
    const state = this.store.get()
    const name = asString(payload.name).trim().slice(0, 40) || `Espace ${state.spaces.length + 1}`
    const color = /^#[0-9a-f]{6}$/i.test(asString(payload.color))
      ? asString(payload.color)
      : SPACE_COLORS[state.spaces.length % SPACE_COLORS.length]
    const now = Date.now()
    const space = createSpaceState(name, color, now)
    const tab = createTabState(space.id, now)
    state.spaces.push(space)
    state.tabs.push(tab)
    state.activeSpaceId = space.id
    state.activeTabBySpace[space.id] = tab.id
    state.secondTabBySpace[space.id] = null
    this.store.schedule()
    this.broadcast()
    this.focusActive()
  }

  private updateSpace(input: unknown): void {
    const payload = (input ?? {}) as { id?: unknown; name?: unknown; color?: unknown }
    const id = asId(payload.id)
    const state = this.store.get()
    const space = state.spaces.find((item) => item.id === id)
    if (!space) return
    if (typeof payload.name === 'string' && payload.name.trim()) space.name = payload.name.trim().slice(0, 40)
    if (typeof payload.color === 'string' && /^#[0-9a-f]{6}$/i.test(payload.color)) space.color = payload.color
    this.store.schedule()
    this.broadcast()
  }

  private removeSpace(id: string): void {
    const state = this.store.get()
    if (state.spaces.length <= 1) throw new Error('Vela garde toujours au moins un espace.')
    const space = state.spaces.find((item) => item.id === id)
    if (!space) return
    this.tabs.destroySpace(id)
    state.spaces = state.spaces.filter((item) => item.id !== id)
    state.tabs = state.tabs.filter((tab) => tab.spaceId !== id)
    delete state.activeTabBySpace[id]
    delete state.secondTabBySpace[id]
    if (state.activeSpaceId === id) {
      state.activeSpaceId = state.spaces[0].id
      const next = state.tabs.find((tab) => tab.spaceId === state.activeSpaceId)
      if (next) state.activeTabBySpace[state.activeSpaceId] = next.id
    }
    this.store.schedule()
    this.broadcast()
    this.focusActive()
  }

  private activateSpace(id: string): void {
    const state = this.store.get()
    if (!state.spaces.some((space) => space.id === id)) return
    state.activeSpaceId = id
    const tab = state.tabs.find((item) => item.id === state.activeTabBySpace[id])
    if (tab) tab.lastActiveAt = Date.now()
    this.store.schedule()
    this.broadcast()
    this.focusActive()
  }

  private pinTab(input: unknown): void {
    const payload = (input ?? {}) as { id?: unknown; pinned?: unknown }
    const id = asId(payload.id)
    const state = this.store.get()
    const tab = state.tabs.find((item) => item.id === id)
    if (!tab) return
    tab.pinned = Boolean(payload.pinned)
    if (tab.pinned) tab.groupId = null
    this.store.schedule()
    this.broadcast()
  }

  private reorderTab(input: unknown): void {
    const payload = (input ?? {}) as ReorderTabsInput
    const id = asId(payload.id)
    const state = this.store.get()
    const tab = state.tabs.find((item) => item.id === id)
    if (!tab) return

    let groupId: string | null | undefined
    if (payload.groupId !== undefined) {
      groupId = null
      if (typeof payload.groupId === 'string') {
        const group = state.groups.find(
          (item) => item.id === payload.groupId && item.spaceId === tab.spaceId
        )
        if (group) groupId = group.id
      }
    }

    const next = moveTab(state.tabs, {
      id,
      targetId: typeof payload.targetId === 'string' ? payload.targetId : null,
      position: payload.position === 'after' ? 'after' : 'before',
      groupId
    })
    if (next === state.tabs) return
    state.tabs = next

    if (tab.groupId) {
      const group = state.groups.find((item) => item.id === tab.groupId)
      if (group?.collapsed) group.collapsed = false
    }
    this.store.schedule()
    this.broadcast()
  }

  private createGroup(input: unknown): TabGroup {
    const payload = (input ?? {}) as CreateGroupInput
    const state = this.store.get()
    const count = state.groups.filter((group) => group.spaceId === state.activeSpaceId).length
    const name = asString(payload.name).trim().slice(0, 40) || `Dossier ${count + 1}`
    const color = /^#[0-9a-f]{6}$/i.test(asString(payload.color))
      ? asString(payload.color)
      : SPACE_COLORS[(count + 1) % SPACE_COLORS.length]
    const group = createGroupState(state.activeSpaceId, name, color, Date.now())
    state.groups.push(group)

    if (typeof payload.tabId === 'string') {
      const tab = state.tabs.find(
        (item) => item.id === payload.tabId && item.spaceId === group.spaceId && !item.pinned
      )
      if (tab) tab.groupId = group.id
    }

    this.store.schedule()
    this.broadcast()
    return group
  }

  private updateGroup(input: unknown): void {
    const payload = (input ?? {}) as UpdateGroupInput
    const id = asId(payload.id)
    const state = this.store.get()
    const group = state.groups.find((item) => item.id === id)
    if (!group) return
    if (typeof payload.name === 'string' && payload.name.trim()) group.name = payload.name.trim().slice(0, 40)
    if (typeof payload.color === 'string' && /^#[0-9a-f]{6}$/i.test(payload.color)) group.color = payload.color
    if (typeof payload.collapsed === 'boolean') group.collapsed = payload.collapsed
    this.store.schedule()
    this.broadcast()
  }

  private removeGroup(id: string): void {
    const state = this.store.get()
    if (!state.groups.some((group) => group.id === id)) return
    for (const tab of state.tabs) {
      if (tab.groupId === id) tab.groupId = null
    }
    state.groups = state.groups.filter((group) => group.id !== id)
    this.store.schedule()
    this.broadcast()
  }

  private updateSettings(patch: unknown): void {
    const input = (patch ?? {}) as SettingsPatch
    this.store.update((state) => {
      const settings: Settings = state.settings
      if (input.theme === 'light' || input.theme === 'dark' || input.theme === 'system') settings.theme = input.theme
      if (input.searchEngine === 'duckduckgo' || input.searchEngine === 'google' || input.searchEngine === 'brave') {
        settings.searchEngine = input.searchEngine
      }
      if (typeof input.blockTrackers === 'boolean') settings.blockTrackers = input.blockTrackers
      if (typeof input.sidebarCollapsed === 'boolean') settings.sidebarCollapsed = input.sidebarCollapsed
      if (typeof (input as { onboarded?: unknown }).onboarded === 'boolean') {
        settings.onboarded = (input as { onboarded: boolean }).onboarded
      }
      if (input.agent) {
        if (input.agent.mode === 'demo' || input.agent.mode === 'api') settings.agent.mode = input.agent.mode
        if (isProviderId(input.agent.provider)) settings.agent.provider = input.agent.provider
      }
      for (const [id, patch] of Object.entries(input.providers ?? {})) {
        if (!isProviderId(id) || !patch) continue
        const target = settings.agent.providers[id]
        if (!target) continue
        let touched = false
        if (typeof patch.model === 'string' && patch.model.trim()) {
          target.model = patch.model.trim().slice(0, 120)
          touched = true
        }
        if (typeof patch.baseUrl === 'string') {
          const url = patch.baseUrl.trim().slice(0, 300)
          if (/^https?:\/\//i.test(url)) {
            target.baseUrl = url
            touched = true
          }
        }
        if (touched) {
          target.status = target.hasKey ? 'stored' : 'none'
          target.detail = undefined
        }
      }
    })
    nativeTheme.themeSource = this.store.get().settings.theme
    this.broadcast()
  }

  /** Vérifie une clé en interrogeant la liste des modèles du fournisseur. */
  private async testKey(input: unknown): Promise<{ ok: boolean; message: string }> {
    const payload = (input ?? {}) as { provider?: unknown }
    if (!isProviderId(payload.provider)) return { ok: false, message: 'Fournisseur inconnu.' }
    const id = payload.provider
    const definition = providerById(id)
    const state = this.store.get().settings.agent.providers[id]
    const key = this.store.getSecret(id)
    if (!key && !definition.local) {
      this.store.setKeyStatus(id, 'none', 'Aucune clé enregistrée.')
      this.broadcast()
      return { ok: false, message: 'Ajoutez d’abord une clé.' }
    }

    const request = buildTestRequest(definition, { baseUrl: state.baseUrl, model: state.model }, key)
    try {
      const response = await fetch(request.url, {
        headers: request.headers,
        signal: AbortSignal.timeout(9000)
      })
      if (response.ok) {
        const message = definition.local ? 'Serveur local joignable.' : 'Clé acceptée.'
        this.store.setKeyStatus(id, 'ok', message)
        this.broadcast()
        return { ok: true, message }
      }
      const detail = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 120)
      const message =
        response.status === 401 || response.status === 403
          ? 'Clé refusée par le fournisseur.'
          : `Réponse ${response.status}${detail ? ` · ${detail}` : ''}`
      this.store.setKeyStatus(id, 'error', message)
      this.broadcast()
      return { ok: false, message }
    } catch {
      const message = definition.local
        ? 'Serveur local injoignable. Lancez-le, puis réessayez.'
        : 'Connexion impossible. Vérifiez l’endpoint et le réseau.'
      this.store.setKeyStatus(id, 'error', message)
      this.broadcast()
      return { ok: false, message }
    }
  }

  private saveNote(input: unknown): ReturnType<NotesStore['save']> {
    const payload = (input ?? {}) as SaveNoteInput
    const state = this.store.get()
    const note = this.notes.save({
      id: typeof payload.id === 'string' ? payload.id : undefined,
      title: asString(payload.title).slice(0, 160),
      body: asString(payload.body).slice(0, 200_000),
      spaceId:
        typeof payload.spaceId === 'string' && state.spaces.some((space) => space.id === payload.spaceId)
          ? payload.spaceId
          : state.activeSpaceId,
      url: typeof payload.url === 'string' ? payload.url : undefined
    })
    this.noteCache = this.notes.list()
    this.broadcast()
    return note
  }

  private runAgent(input: unknown): { runId: string } {
    const payload = (input ?? {}) as { prompt?: unknown; sources?: unknown; spaceId?: unknown }
    const prompt = asString(payload.prompt).slice(0, 8000)
    const sources = Array.isArray(payload.sources)
      ? payload.sources
          .filter(
            (source): source is { tabId?: string; title: string; url: string } =>
              Boolean(source && typeof source.title === 'string' && typeof source.url === 'string')
          )
          .slice(0, 8)
          .map((source) => ({
            tabId: typeof source.tabId === 'string' ? source.tabId : undefined,
            title: source.title.slice(0, 200),
            url: source.url.slice(0, 2000)
          }))
      : []
    return this.agent.start({
      prompt,
      sources,
      spaceId: asString(payload.spaceId) || this.store.get().activeSpaceId
    })
  }

  registerIpc(): void {
    if (this.registered) return
    this.registered = true

    const handle = (channel: string, handler: (payload: unknown) => unknown): void => {
      ipcMain.handle(channel, (_event, payload: unknown) => handler(payload))
    }

    handle('app:view', () => this.view())
    handle('app:platform', () => process.platform)

    handle('space:create', (payload) => {
      this.addSpace(payload)
      return this.view()
    })
    handle('space:update', (payload) => {
      this.updateSpace(payload)
      return this.view()
    })
    handle('space:remove', (payload) => {
      this.removeSpace(asId(payload))
      return this.view()
    })
    handle('space:activate', (payload) => {
      this.activateSpace(asId(payload))
      return this.view()
    })

    handle('tab:create', (payload) => this.createTab((payload ?? {}) as CreateTabInput))
    handle('tab:close', (payload) => {
      this.closeTab(asId(payload))
    })
    handle('tab:activate', (payload) => {
      this.activateTab(asId(payload))
    })
    handle('tab:navigate', (payload) => {
      const input = (payload ?? {}) as { id?: unknown; input?: unknown }
      this.tabs.navigate(asId(input.id), asString(input.input))
    })
    handle('tab:home', (payload) => {
      this.tabs.goHome(asId(payload))
    })
    handle('tab:back', (payload) => {
      this.tabs.back(asId(payload))
    })
    handle('tab:forward', (payload) => {
      this.tabs.forward(asId(payload))
    })
    handle('tab:reload', (payload) => {
      this.tabs.reload(asId(payload))
    })
    handle('tab:stop', (payload) => {
      this.tabs.stop(asId(payload))
    })
    handle('tab:pin', (payload) => {
      this.pinTab(payload)
    })
    handle('tab:reopen', () => {
      this.reopenTab()
    })
    handle('tab:split-toggle', () => {
      this.toggleSplit()
    })
    handle('tab:split-set', (payload) => {
      this.setSplitTab(asId(payload))
    })
    handle('tab:split-ratio', (payload) => {
      const ratio = typeof payload === 'number' ? payload : Number.NaN
      if (!Number.isFinite(ratio)) return
      this.store.update((state) => {
        state.splitRatio = Math.min(0.75, Math.max(0.25, ratio))
      })
      this.broadcast()
    })
    handle('tab:focus', (payload) => {
      this.tabs.focus(asId(payload))
    })
    handle('tab:discard', (payload) => {
      this.tabs.suspend(asId(payload))
      this.broadcast()
    })
    handle('tab:reorder', (payload) => {
      this.reorderTab(payload)
    })

    handle('group:create', (payload) => this.createGroup(payload))
    handle('group:update', (payload) => {
      this.updateGroup(payload)
    })
    handle('group:remove', (payload) => {
      this.removeGroup(asId(payload))
    })

    handle('history:clear', () => {
      this.store.clearHistory()
      this.broadcast()
    })

    handle('downloads:list', () => this.downloads.slice(0, 30))
    handle('downloads:open', async (payload) => {
      const item = this.downloads.find((d) => d.id === asId(payload))
      if (item?.path) await shell.showItemInFolder(item.path)
      else await shell.openPath(app.getPath('downloads'))
    })
    handle('downloads:clear', () => {
      this.downloads = this.downloads.filter((d) => d.state === 'progress')
      this.broadcast()
    })
    handle('app:metrics', () => this.metrics())

    handle('notes:get', (payload) => this.notes.get(asId(payload)))
    handle('notes:save', (payload) => this.saveNote(payload))
    handle('notes:remove', (payload) => {
      this.notes.remove(asId(payload))
      this.noteCache = this.notes.list()
      this.broadcast()
    })
    handle('notes:open-folder', async () => {
      await shell.openPath(this.notes.dir)
    })

    handle('tasks:create', (payload) => {
      const input = (payload ?? {}) as { title?: unknown; dueAt?: unknown }
      const title = typeof input.title === 'string' ? input.title.trim().slice(0, 200) : ''
      if (!title) throw new Error('Titre de tâche vide.')
      const task = {
        id: newId(),
        title,
        done: false,
        createdAt: Date.now(),
        dueAt: typeof input.dueAt === 'number' ? input.dueAt : null
      }
      this.store.update((state) => {
        state.tasks = [task, ...state.tasks].slice(0, 200)
      })
      this.broadcast()
      return task
    })
    handle('tasks:toggle', (payload) => {
      const id = asId(payload)
      this.store.update((state) => {
        const task = state.tasks.find((item) => item.id === id)
        if (task) task.done = !task.done
      })
      this.broadcast()
    })
    handle('tasks:remove', (payload) => {
      const id = asId(payload)
      this.store.update((state) => {
        state.tasks = state.tasks.filter((item) => item.id !== id)
      })
      this.broadcast()
    })

    handle('agent:run', (payload) => this.runAgent(payload))
    handle('settings:update', (payload) => {
      this.updateSettings(payload)
    })
    handle('settings:set-key', (payload) => {
      const input = (payload ?? {}) as { provider?: unknown; key?: unknown }
      if (!isProviderId(input.provider)) return false
      const ok = this.store.setSecret(input.provider, typeof input.key === 'string' ? input.key : null)
      if (ok) this.broadcast()
      return ok
    })
    handle('settings:test-key', (payload) => this.testKey(payload))

    ipcMain.on('views:layout', (event, payload: LayoutRequest) => {
      if (!this.win || event.sender !== this.win.webContents) return
      const panes = Array.isArray(payload?.panes) ? payload.panes.filter(isPane).slice(0, 4) : []
      this.overlay = Boolean(payload?.overlay)
      this.tabs.layout({ panes, overlay: this.overlay })
    })

    ipcMain.on('agent:cancel', (_event, runId: unknown) => {
      this.agent.cancel(typeof runId === 'string' ? runId : undefined)
    })
  }
}
