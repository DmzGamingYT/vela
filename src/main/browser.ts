import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  nativeTheme,
  session,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type Session,
  type WebContents
} from 'electron'
import type {
  CreateGroupInput,
  CreateSpaceInput,
  CreateTabInput,
  ReorderTabsInput,
  SaveNoteInput,
  SettingsPatch,
  UpdateGroupInput,
  UpdateSpaceInput
} from '@shared/api'
import { TunnelService } from './tunnel'
import {
  createGroup as createGroupState,
  createSpace as createSpaceState,
  createTab as createTabState,
  newId,
  SPACE_COLORS
} from '@shared/defaults'
import { moveTab } from '@shared/ordering'
import {
  buildTestRequest,
  endpointHost,
  isLoopbackEndpoint,
  isProviderId,
  providerById
} from '@shared/providers'
import { engineHost, SEARCH_ENGINES } from '@shared/url'
import {
  acceptLanguage,
  isWebLanguage,
  resolveEngine,
  sanitizeCustomEngines,
  sanitizeDefaultZoom,
  sanitizeKeywords,
  sanitizeStartupUrl,
  startupAddress
} from '@shared/navigation'
import { isAmbienceId, isThemeId, parseHex, sanitizeGlassBlur, sanitizeHour } from '@shared/theme'
import {
  normalizeLetterboxd,
  partitionFor,
  sanitizeSpaceAvatar,
  sanitizeSpaceBackground,
  sanitizeSpaceShortcuts,
  sanitizeWatchlist,
  suggestSpaceName
} from '@shared/space'
import {
  HOME_URL,
  type AppView,
  type DownloadItem,
  type HistoryEntry,
  type NoteMeta,
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
import { previewOf } from '@shared/work'
import { AgentRunner, type FinishedWork } from './agent'
import { ComicBridge } from './comic'
import { pruneAvatars, saveAvatarDataUrl } from './avatars'
import { Thumbnails } from './thumbnails'
import { NoteAudioStore } from './noteAudio'
import { HighlightsStore, NotesStore } from './notes'
import { MiniWindow } from './mini'
import { Store } from './store'
import { canUseChannel, senderKindOf } from './ipcPolicy'
import { TabManager, type TabHost } from './tabs'
import { preparedPartitions } from './privacy'
import { registerAgentIpc } from './ipc/agent'
import { registerAppIpc } from './ipc/app'
import type { IpcHost } from './ipc/host'
import { registerLibraryIpc } from './ipc/library'
import { registerNotesIpc } from './ipc/notes'
import { registerPrivacyIpc } from './ipc/privacy'
import { registerSpacesIpc } from './ipc/spaces'
import { registerTabsIpc } from './ipc/tabs'
import { registerTunnelIpc } from './ipc/tunnel'
import type { Handle, On } from './ipc/types'

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asId(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Identifiant invalide.')
  return value
}

/** Raccourcis qui ouvrent une surface de l'interface et attendent le clavier. */
const UI_SHORTCUTS: ReadonlySet<ShortcutAction> = new Set<ShortcutAction>([
  'command',
  'address',
  'settings',
  'history',
  'bookmarks',
  'sessions'
])

export class Browser {
  readonly store: Store
  readonly notes: NotesStore
  readonly noteAudio: NoteAudioStore
  readonly highlights: HighlightsStore
  readonly tabs: TabManager
  readonly agent: AgentRunner
  readonly comic: ComicBridge
  readonly tunnel: TunnelService
  readonly thumbs: Thumbnails
  readonly mini: MiniWindow

  private win: BrowserWindow | null = null
  private noteCache: NoteMeta[]
  private downloads: DownloadItem[] = []
  private trackedSessions = new Set<string>()
  private agentSentTabIds = new Set<string>()
  private agentSentTimer: NodeJS.Timeout | null = null
  private broadcastTimer: NodeJS.Timeout | null = null
  private sweepTimer: NodeJS.Timeout | null = null
  private workPreviews = new Map<string, { updatedAt: number; preview: string }>()
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
    createTab: (spaceId, url, background) =>
      this.createTab({ spaceId, url, activate: background !== true }).id,
    tabsOfSpace: (spaceId) => this.store.get().tabs.filter((tab) => tab.spaceId === spaceId),
    shortcut: (event) => this.send('shortcut', event),
    settings: () => this.store.get().settings,
    visited: (spaceId, url, title) => {
      this.store.pushHistory({ id: newId(), spaceId, url, title, visitedAt: Date.now() })
    },
    selection: (payload) => this.send('selection', payload),
    isExempted: (host) => this.store.isExempted(host),
    openMini: (url, spaceId) => this.openMini({ url, ...(spaceId ? { spaceId } : {}) }),
    highlightsFor: (url) => this.highlights.list(url).map((entry) => entry.text)
  }

  /** Construit le service et ouvre les clés avant la première fenêtre. */
  static async create(dir: string): Promise<Browser> {
    const browser = new Browser(dir)
    await browser.store.loadSecrets()
    browser.broadcast()
    return browser
  }

  constructor(dir: string) {
    this.store = new Store(dir)
    this.dedupeHomeTabs()
    this.thumbs = new Thumbnails(dir, () => this.store.get().settings.thumbnails)
    this.notes = new NotesStore(dir)
    this.noteAudio = new NoteAudioStore(dir)
    this.highlights = new HighlightsStore(dir)
    this.notes.prune()
    // Un index illisible ne permet pas de déterminer les références audio.
    if (!this.notes.canReadIndex) {
      throw new Error(
        'Index ou fichier de note illisible : notes et enregistrements conservés. Restaurez les fichiers avant de relancer Vela.'
      )
    }
    this.noteAudio.prune(this.notes.audioNames())
    this.noteCache = this.notes.list()
    this.tabs = new TabManager(() => this.win, this.host)
    this.mini = new MiniWindow({
      parent: () => this.win,
      space: (id) => this.store.get().spaces.find((space) => space.id === id),
      sessionFor: (space) => this.tabs.sessionFor(space),
      pageBackground: () => this.tabs.backgroundForPages(),
      visited: (spaceId, url, title) => this.host.visited(spaceId, url, title),
      openTab: (spaceId, url, background) => {
        this.createTab({ spaceId, url, activate: background !== true })
      },
      focusMain: () => {
        const win = this.win
        if (!win || win.isDestroyed()) return
        win.show()
        win.focus()
      },
      settings: () => this.store.get().settings
    })
    this.tunnel = new TunnelService({
      saveMap: (map) => this.store.saveTunnelMap(map),
      getMap: (id) => this.store.getTunnelMap(id)
    })
    this.startSweeper()
    this.agent = new AgentRunner(
      () => this.win,
      () => this.store.get().settings,
      (provider: ProviderId) => this.store.getSecret(provider),
      (tabId) => this.tabs.excerpt(tabId),
      (work) => this.recordWork(work),
      {
        // L'agent agit dans un onglet neuf de l'espace : il ne prend jamais la
        // page que l'utilisateur est en train de lire.
        open: (spaceId, url) => this.openAgentTab(spaceId, url),
        go: async (tabId, url) => {
          this.tabs.navigate(tabId, url)
          await this.waitForLoad(tabId)
        },
        contents: (tabId) => this.tabs.contentOf(tabId)
      }
    )
    this.comic = new ComicBridge(
      this.tabs,
      () => this.store.get().settings,
      (provider: ProviderId) => this.store.getSecret(provider),
      (event, channel) => this.allowIpc(event, channel),
      async (host) => {
        const win = this.win
        if (!win || win.isDestroyed()) return false
        const decision = await dialog.showMessageBox(win, {
          type: 'warning',
          title: 'Traduction vers un service distant',
          message: 'Le texte de la planche va quitter cet appareil',
          detail: `Vela enverra à ${host} les répliques repérées sur la planche, et l’image des bulles que la lecture locale n’a pas su déchiffrer. Vela ne contrôle pas ce que cet hôte en fait.`,
          buttons: ['Annuler', 'Traduire via cet hôte'],
          defaultId: 0,
          cancelId: 0,
          noLink: true
        })
        return decision.response === 1
      }
    )
  }

  /**
   * Un seul onglet d'accueil par espace. Les anciennes sessions pouvaient en
   * laisser plusieurs : on garde l'actif, sinon le premier, et on recolle les
   * références d'onglet actif et de vue scindée.
   */
  private dedupeHomeTabs(): void {
    const state = this.store.get()
    const homeTabs = state.tabs.filter((tab) => !tab.pinned && isHomeUrl(tab.url))
    if (homeTabs.length < 2) return
    const keep = new Map<string, string>()
    for (const tab of homeTabs) {
      const active = state.activeTabBySpace[tab.spaceId] === tab.id
      const current = keep.get(tab.spaceId)
      if (!current || active) keep.set(tab.spaceId, tab.id)
    }
    const kept = new Set(keep.values())
    const dropped = new Set(homeTabs.filter((tab) => !kept.has(tab.id)).map((tab) => tab.id))
    if (dropped.size === 0) return
    this.store.update((next) => {
      next.tabs = next.tabs.filter((tab) => !dropped.has(tab.id))
      for (const [spaceId, id] of keep) {
        if (dropped.has(next.activeTabBySpace[spaceId] ?? '')) next.activeTabBySpace[spaceId] = id
        if (dropped.has(next.secondTabBySpace[spaceId] ?? '')) next.secondTabBySpace[spaceId] = null
      }
    })
  }

  /** Chaque travail de l'atelier entre dans la liste consultable, sans doublon. */
  private recordWork(work: FinishedWork): void {
    const now = Date.now()
    const stamp = `${work.prompt}\u0000${work.spaceId}`
    this.store.update((state) => {
      const previous = state.works.find(
        (item) =>
          !item.archived &&
          `${item.prompt}\u0000${item.spaceId}` === stamp &&
          now - item.createdAt < 60_000
      )
      if (previous) {
        previous.title = work.title || previous.title
        previous.markdown = work.markdown
        previous.preview = previewOf(work.markdown)
        previous.mode = work.mode
        previous.sources = work.sources
        previous.updatedAt = now
      } else {
        state.works = [
          {
            id: newId(),
            title: work.title.slice(0, 160) || 'Rapport Vela',
            prompt: work.prompt.slice(0, 2000),
            markdown: work.markdown,
            preview: previewOf(work.markdown),
            mode: work.mode,
            sources: work.sources,
            spaceId: work.spaceId,
            createdAt: now,
            updatedAt: now,
            archived: false
          },
          ...state.works
        ].slice(0, 120)
      }
    })
    this.broadcast()
  }

  /** Pré-connecte le moteur de recherche (DNS + TLS + sockets) : 1re recherche instantanée. */
  private preconnectSearch(): void {
    try {
      const state = this.store.get()
      const space = state.spaces.find((item) => item.id === state.activeSpaceId) ?? state.spaces[0]
      if (!space) return
      const ses = session.fromPartition(partitionFor(space))
      const preconnect = (
        ses as Session & { preconnect?: (options: { url: string; numSockets?: number }) => unknown }
      ).preconnect
      if (typeof preconnect !== 'function') return
      const result = preconnect.call(ses, {
        url: `https://${engineHost(
          resolveEngine(state.settings).engine,
          state.settings.searxInstance,
          resolveEngine(state.settings).template
        )}`,
        numSockets: 3
      })
      if (result && typeof (result as Promise<unknown>).catch === 'function') {
        void (result as Promise<unknown>).catch(() => {})
      }
    } catch {
      /* la pré-connexion ne doit jamais casser le démarrage */
    }
  }

  attach(win: BrowserWindow): void {
    this.win = win
    nativeTheme.themeSource = this.store.get().settings.theme
    this.preconnectSearch()
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
    // Les surfaces de l'interface (palette, barre d'adresse, réglages…) ont
    // besoin du clavier. Quand une page a le focus, elle le garde sinon : la
    // palette s'ouvrait sans recevoir les frappes.
    if (UI_SHORTCUTS.has(action)) {
      const win = this.win
      if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
        // Une vue de page garde le focus : sans ce retrait, la palette s'ouvre
        // mais les frappes partent dans la page.
        this.tabs.releaseFocus()
        if (!win.isFocused()) win.focus()
        win.webContents.focus()
      }
    }
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

  /** Effacement d'historique encore annulable pendant huit secondes. */
  private pendingHistory: { entries: HistoryEntry[]; timer: NodeJS.Timeout } | null = null

  private commitPendingHistory(): void {
    if (!this.pendingHistory) return
    clearTimeout(this.pendingHistory.timer)
    this.pendingHistory = null
  }

  /**
   * Démarrage : reprise de session par défaut, sinon un seul onglet sur
   * l'accueil ou sur la page choisie. La conservation de l'historique
   * s'applique au même moment.
   */
  applyStartup(): void {
    const settings = this.store.get().settings
    const address = startupAddress(settings.startupBehavior, settings.startupUrl)
    if (address) {
      const state = this.store.get()
      const spaceId = state.activeSpaceId
      this.store.update((next) => {
        next.tabs = next.tabs.filter((tab) => tab.spaceId !== spaceId || tab.pinned)
        const tab = createTabState(spaceId, Date.now(), {
          url: address,
          title: isHomeUrl(address) ? 'Nouvel onglet' : titleFromUrl(address)
        })
        next.tabs.push(tab)
        next.activeTabBySpace[spaceId] = tab.id
        next.secondTabBySpace[spaceId] = null
        next.split = false
      })
    }
    this.store.pruneHistory()
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
      // Toutes les dix minutes : un vidage chaque minute forçait le
      // retéléchargement des pages au retour d'un espace.
    }, 10 * 60_000)
    if (typeof this.sweepTimer.unref === 'function') this.sweepTimer.unref()
  }

  private trackDownloads(ses: Electron.Session, partition = 'default'): void {
    const key = partition
    if (this.trackedSessions.has(key)) return
    this.trackedSessions.add(key)
    // Langue des pages : un en-tête, aucune requête de plus. Le bloqueur écoute
    // `onBeforeRequest`, un autre événement : les deux coexistent.
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      details.requestHeaders['Accept-Language'] = acceptLanguage(
        this.store.get().settings.webLanguage
      )
      callback({ requestHeaders: details.requestHeaders })
    })
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
      const settings = this.store.get().settings
      const folder = settings.downloadDir ?? app.getPath('downloads')
      if (settings.askDownloadLocation) {
        item.setSaveDialogOptions({
          title: 'Enregistrer le fichier',
          defaultPath: join(folder, name)
        })
      } else {
        item.setSavePath(join(folder, name))
      }
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
          if (found.state === 'done' && found.path && this.store.get().settings.openAfterDownload) {
            void shell.openPath(found.path)
          }
        }
        this.broadcast()
      })
    })
  }

  /**
   * Vide le cache HTTP des espaces laissés de côté. On ne touche qu'aux
   * partitions déjà ouvertes : créer la session d'un espace jamais visité
   * coûtait plus cher que le nettoyage lui-même, et le vidage trop fréquent
   * obligeait à retélécharger les pages au premier retour.
   */
  private async clearIdleCaches(): Promise<void> {
    try {
      const state = this.store.get()
      const known = preparedPartitions()
      const activePartition = partitionFor(state.spaces.find((s) => s.id === state.activeSpaceId))
      const live = this.tabs.liveIds()
      const busySpaces = new Set(
        state.tabs.filter((tab) => live.has(tab.id)).map((tab) => tab.spaceId)
      )
      for (const space of state.spaces) {
        const partition = partitionFor(space)
        if (partition === activePartition || !known.has(partition) || busySpaces.has(space.id))
          continue
        try {
          await session.fromPartition(partition).clearCache()
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
    const secondTabId =
      candidate && state.tabs.some((tab) => tab.id === candidate) ? candidate : null
    const tabs: TabView[] = state.tabs.map((tab) => ({
      ...tab,
      ...this.tabs.runtimeOf(tab.id),
      agentSent: this.agentSentTabIds.has(tab.id)
    }))
    const blockedTotal = this.tabs.blockedTotal()

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
      bookmarks: state.bookmarks,
      privacyExemptions: state.privacyExemptions,
      memoryFreed: this.tabs.memoryFreedMb(),
      canReopen: state.closed.length > 0,
      tunnelMaps: this.store.listTunnelMaps(),
      notes: this.noteCache,
      tasks: state.tasks.slice(0, 200),
      // Les rapports restent sur le disque : l'état ne transporte que leur résumé.
      works: state.works.slice(0, 120).map((work) => {
        const cached = this.workPreviews.get(work.id)
        const preview =
          cached && cached.updatedAt === work.updatedAt ? cached.preview : previewOf(work.markdown)
        if (!cached || cached.updatedAt !== work.updatedAt) {
          this.workPreviews.set(work.id, { updatedAt: work.updatedAt, preview })
        }
        return {
          id: work.id,
          title: work.title,
          preview,
          mode: work.mode,
          sourceCount: work.sources.length,
          spaceId: work.spaceId,
          createdAt: work.createdAt,
          updatedAt: work.updatedAt,
          archived: work.archived
        }
      }),
      downloads: this.downloads.slice(0, 30),
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

  /**
   * Ouvre la petite fenêtre jetable. Sans adresse, elle prend la page courante ;
   * l'espace qui prête sa session est l'espace actif, sauf précision contraire.
   */
  openMini(input: { url?: string; spaceId?: string } = {}): boolean {
    const state = this.store.get()
    const spaceId =
      input.spaceId && state.spaces.some((space) => space.id === input.spaceId)
        ? input.spaceId
        : state.activeSpaceId
    let url = (input.url ?? '').trim()
    if (!url) {
      const activeId = state.activeTabBySpace[spaceId] ?? ''
      const tab = state.tabs.find((item) => item.id === activeId)
      if (tab && !isHomeUrl(tab.url)) url = tab.url
    }
    return this.mini.open({ url, spaceId })
  }

  createTab(input: CreateTabInput = {}): TabState {
    const state = this.store.get()
    const spaceId =
      typeof input.spaceId === 'string' && state.spaces.some((space) => space.id === input.spaceId)
        ? input.spaceId
        : state.activeSpaceId
    const url =
      typeof input.url === 'string' && input.url
        ? input.url
        : this.store.get().settings.newTabBlank
          ? 'about:blank'
          : HOME_URL
    const pinned = Boolean(input.pinned)
    // Une seule page d'accueil par espace : ⌘T ramène à celle qui existe.
    // Le « + » d'un dossier la réclame ailleurs : elle le rejoint plutôt que
    // d'en créer une seconde, sinon le bouton semblerait sans effet.
    if (isHomeUrl(url) && !pinned) {
      const home = state.tabs.find(
        (tab) => tab.spaceId === spaceId && !tab.pinned && isHomeUrl(tab.url)
      )
      if (home) {
        const target =
          typeof input.groupId === 'string'
            ? state.groups.find((item) => item.id === input.groupId && item.spaceId === spaceId)
            : undefined
        if (target && home.groupId !== target.id) {
          home.groupId = target.id
          if (target.collapsed) target.collapsed = false
          this.store.schedule()
          this.broadcast()
        }
        if (input.activate !== false) this.activateTab(home.id)
        else this.broadcast()
        return home
      }
    }
    let groupId: string | null = null
    if (!pinned && typeof input.groupId === 'string') {
      const group = state.groups.find(
        (item) => item.id === input.groupId && item.spaceId === spaceId
      )
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
      if (state.split && state.secondTabBySpace[spaceId] === tab.id)
        state.secondTabBySpace[spaceId] = previous ?? null
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

  private async closeTab(id: string): Promise<void> {
    const state = this.store.get()
    const tab = state.tabs.find((item) => item.id === id)
    if (!tab) return
    const spaceId = tab.spaceId
    const before = state.tabs.filter((item) => item.spaceId === spaceId)
    const index = before.findIndex((item) => item.id === id)

    // L'identifiant d'un onglet fermé ne doit pas rester dans la trace de l'agent.
    this.agentSentTabIds.delete(id)
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

    await this.captureThumbnail(id, tab)
    this.tabs.destroy(id)
    this.store.schedule()
    this.broadcast()
    this.focusActive()
  }

  /**
   * Vignette de la page qui se ferme. Rien pour un espace privé, une page en
   * erreur ou une adresse interne, et rien du tout si le réglage est coupé.
   */
  private async captureThumbnail(tabId: string, tab: TabState): Promise<void> {
    const state = this.store.get()
    if (!state.settings.thumbnails) return
    const space = state.spaces.find((item) => item.id === tab.spaceId)
    if (!space || space.private === true) return
    if (!/^https?:/i.test(tab.url)) return
    const contents = this.tabs.captureSource(tabId)
    if (!contents) return
    // La capture est attendue : la vue meurt juste après la fermeture.
    await this.thumbs.capture(contents, tab.url)
  }

  private reopenTab(): void {
    const state = this.store.get()
    const entry = state.closed.shift()
    if (!entry) return
    const spaceId = state.spaces.some((space) => space.id === entry.spaceId)
      ? entry.spaceId
      : state.activeSpaceId
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
      const fallback = state.tabs.find(
        (item) => item.spaceId === tab.spaceId && item.id !== activeId
      )
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
    space.avatar = this.storedAvatar(sanitizeSpaceAvatar(payload.avatar))
    space.background = sanitizeSpaceBackground(payload.background)
    space.shortcuts = sanitizeSpaceShortcuts(payload.shortcuts)
    space.blockTrackers = payload.blockTrackers !== false
    space.watchlist = payload.watchlist === true
    space.letterboxd = normalizeLetterboxd(payload.letterboxd)
    space.watchItems = sanitizeWatchlist(payload.watchItems)
    space.letterboxdLog = []
    space.letterboxdLogAt = null
    if (isThemeId(payload.theme)) space.theme = payload.theme
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
    const payload = (input ?? {}) as UpdateSpaceInput & { id?: unknown }
    const id = asId(payload.id)
    const state = this.store.get()
    const space = state.spaces.find((item) => item.id === id)
    if (!space) return
    if (typeof payload.name === 'string' && payload.name.trim())
      space.name = payload.name.trim().slice(0, 40)
    if (typeof payload.color === 'string' && /^#[0-9a-f]{6}$/i.test(payload.color))
      space.color = payload.color
    if ('theme' in payload) space.theme = isThemeId(payload.theme) ? payload.theme : null
    if ('avatar' in payload) space.avatar = this.storedAvatar(sanitizeSpaceAvatar(payload.avatar))
    if ('background' in payload) space.background = sanitizeSpaceBackground(payload.background)
    if ('shortcuts' in payload) space.shortcuts = sanitizeSpaceShortcuts(payload.shortcuts)
    if ('watchlist' in payload) space.watchlist = payload.watchlist === true
    if ('letterboxd' in payload) space.letterboxd = normalizeLetterboxd(payload.letterboxd)
    if ('watchItems' in payload) space.watchItems = sanitizeWatchlist(payload.watchItems)
    if (typeof payload.blockTrackers === 'boolean') space.blockTrackers = payload.blockTrackers
    this.store.schedule()
    this.pruneAvatars()
    this.broadcast()
  }

  /**
   * Une photo choisie dans la fenêtre arrive en data URL : elle part sur le
   * disque et vela.json ne garde qu'un nom de fichier. En cas d'échec, la
   * data URL est conservée pour ne rien perdre.
   */
  private storedAvatar(value: string | null): string | null {
    if (!value || !value.startsWith('image:data:')) return value
    const saved = saveAvatarDataUrl(this.store.dir, value)
    return saved ?? value
  }

  /** Les photos remplacées ne restent pas sur le disque. */
  private pruneAvatars(): void {
    pruneAvatars(this.store.dir, this.store.referencedAvatars())
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
    this.pruneAvatars()
    this.broadcast()
    this.focusActive()
  }

  /**
   * Duplique la configuration d'un espace — nom, apparence, sites, gadgets et
   * compte public — sans copier ses cookies, son historique ni sa partition.
   * Le nouvel espace reçoit donc une session Chromium neuve.
   */
  private duplicateSpace(id: string): void {
    const state = this.store.get()
    const source = state.spaces.find((item) => item.id === id)
    if (!source) return
    const now = Date.now()
    const name = suggestSpaceName(state.spaces.map((item) => item.name))
    const copy = createSpaceState(name, source.color, now)
    copy.theme = source.theme ?? null
    copy.avatar = source.avatar ?? null
    copy.background = source.background ?? 'none'
    copy.shortcuts = sanitizeSpaceShortcuts(source.shortcuts)
    copy.blockTrackers = source.blockTrackers !== false
    copy.watchlist = source.watchlist === true
    copy.letterboxd = normalizeLetterboxd(source.letterboxd)
    copy.watchItems = sanitizeWatchlist(source.watchItems)
    // Le journal importé est un historique de lecture : il reste à la source.
    copy.letterboxdLog = []
    copy.letterboxdLogAt = null
    const tab = createTabState(copy.id, now)
    state.spaces.push(copy)
    state.tabs.push(tab)
    state.activeSpaceId = copy.id
    state.activeTabBySpace[copy.id] = tab.id
    state.secondTabBySpace[copy.id] = null
    this.store.schedule()
    this.broadcast()
    this.focusActive()
  }

  /**
   * Vide les données de navigation d'un espace : cookies, stockage, cache et
   * historique de sa partition. Les autres espaces, qui ont chacun la leur,
   * ne sont pas touchés. L'espace et ses réglages restent en place.
   */
  private async clearSpaceData(id: string): Promise<void> {
    const state = this.store.get()
    const space = state.spaces.find((item) => item.id === id)
    if (!space) return
    try {
      const ses = session.fromPartition(partitionFor(space))
      await ses.clearStorageData()
      await ses.clearCache()
    } catch {
      /* partition déjà libérée : l'historique local part quand même */
    }
    state.history = state.history.filter((entry) => entry.spaceId !== id)
    state.closed = state.closed.filter((tab) => tab.spaceId !== id)
    this.tabs.destroySpace(id)
    state.tabs = state.tabs.filter((tab) => tab.spaceId !== id)
    const tab = createTabState(id)
    state.tabs.push(tab)
    state.activeTabBySpace[id] = tab.id
    state.secondTabBySpace[id] = null
    if (state.activeSpaceId === id) state.split = false
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
      groupId,
      ...(typeof payload.pinned === 'boolean' ? { pinned: payload.pinned } : {})
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
    if (typeof payload.name === 'string' && payload.name.trim())
      group.name = payload.name.trim().slice(0, 40)
    if (typeof payload.color === 'string' && /^#[0-9a-f]{6}$/i.test(payload.color))
      group.color = payload.color
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
    const beforeEngine = this.store.get().settings.searchEngine
    this.store.update((state) => {
      const settings: Settings = state.settings
      if (input.theme === 'light' || input.theme === 'dark' || input.theme === 'system')
        settings.theme = input.theme
      if (
        input.searchEngine === 'custom' ||
        (input.searchEngine && input.searchEngine in SEARCH_ENGINES)
      ) {
        settings.searchEngine = input.searchEngine
      }
      if (Array.isArray(input.customEngines)) {
        settings.customEngines = sanitizeCustomEngines(input.customEngines)
        if (settings.searchEngine === 'custom' && settings.customEngines.length === 0) {
          settings.searchEngine = 'duckduckgo'
        }
        if (!settings.customEngines.some((engine) => engine.id === settings.customEngineId)) {
          settings.customEngineId = settings.customEngines[0]?.id ?? ''
        }
      }
      if (
        typeof input.customEngineId === 'string' &&
        settings.customEngines.some((engine) => engine.id === input.customEngineId)
      ) {
        settings.customEngineId = input.customEngineId
      }
      if (Array.isArray(input.searchKeywords)) {
        settings.searchKeywords = sanitizeKeywords(input.searchKeywords, settings.customEngines)
      }
      if (typeof input.searxInstance === 'string')
        settings.searxInstance = input.searxInstance.trim().slice(0, 200)
      if (typeof input.startupUrl === 'string')
        settings.startupUrl = sanitizeStartupUrl(input.startupUrl)
      if (
        input.startupBehavior === 'restore' ||
        input.startupBehavior === 'home' ||
        input.startupBehavior === 'url'
      ) {
        settings.startupBehavior = input.startupBehavior
      }
      if (typeof input.newTabBlank === 'boolean') settings.newTabBlank = input.newTabBlank
      if (
        input.historyRetention === 'forever' ||
        input.historyRetention === '90' ||
        input.historyRetention === '30' ||
        input.historyRetention === '7' ||
        input.historyRetention === 'never'
      ) {
        settings.historyRetention = input.historyRetention
      }
      if (input.downloadDir === null) settings.downloadDir = null
      else if (typeof input.downloadDir === 'string' && input.downloadDir.trim()) {
        settings.downloadDir = input.downloadDir.trim().slice(0, 1000)
      }
      if (typeof input.askDownloadLocation === 'boolean')
        settings.askDownloadLocation = input.askDownloadLocation
      if (typeof input.openAfterDownload === 'boolean')
        settings.openAfterDownload = input.openAfterDownload
      if (typeof input.webLanguage === 'string' && isWebLanguage(input.webLanguage)) {
        settings.webLanguage = input.webLanguage
      }
      if (typeof input.defaultZoom === 'number')
        settings.defaultZoom = sanitizeDefaultZoom(input.defaultZoom)
      if (isThemeId(input.themeId)) settings.themeId = input.themeId
      if (typeof input.customAccent === 'string') {
        settings.customAccent = parseHex(input.customAccent) ?? settings.customAccent
      }
      if (input.glass === 'light' || input.glass === 'normal' || input.glass === 'strong') {
        settings.glass = input.glass
      }
      if (typeof input.glassBlur === 'number') {
        settings.glassBlur = sanitizeGlassBlur(input.glassBlur, settings.glassBlur)
      }
      if (isAmbienceId(input.ambience)) settings.ambience = input.ambience
      if (
        input.homeBackground === 'gradient' ||
        input.homeBackground === 'sky' ||
        input.homeBackground === 'plain' ||
        input.homeBackground === 'image'
      ) {
        settings.homeBackground = input.homeBackground
      }
      if (input.homeImage === null) settings.homeImage = null
      else if (typeof input.homeImage === 'string' && input.homeImage.length < 2000) {
        settings.homeImage = input.homeImage
      }
      if (typeof input.homeBlur === 'number' && input.homeBlur >= 0 && input.homeBlur <= 40) {
        settings.homeBlur = Math.round(input.homeBlur)
      }
      if (typeof input.highContrast === 'boolean') settings.highContrast = input.highContrast
      if (typeof input.hourTheme === 'boolean') settings.hourTheme = input.hourTheme
      if (typeof input.perSpaceThemes === 'boolean') settings.perSpaceThemes = input.perSpaceThemes
      if (input.skyVariant === 'braise' || input.skyVariant === 'nuit-etoilee') {
        settings.skyVariant = input.skyVariant
      }
      if (input.density === 'compact' || input.density === 'normal' || input.density === 'airy') {
        settings.density = input.density
      }
      if (input.textSize === 'small' || input.textSize === 'normal' || input.textSize === 'large') {
        settings.textSize = input.textSize
      }
      if (input.sidebarSide === 'left' || input.sidebarSide === 'right') {
        settings.sidebarSide = input.sidebarSide
      }
      if (
        input.reduceMotion === 'system' ||
        input.reduceMotion === 'reduce' ||
        input.reduceMotion === 'full'
      ) {
        settings.reduceMotion = input.reduceMotion
      }
      if (typeof input.hourStart === 'number') {
        settings.hourStart = sanitizeHour(input.hourStart, settings.hourStart)
      }
      if (typeof input.hourEnd === 'number') {
        settings.hourEnd = sanitizeHour(input.hourEnd, settings.hourEnd)
      }
      // Deux heures égales figeraient le mode : on garde l'écart précédent.
      if (settings.hourStart === settings.hourEnd) settings.hourEnd = (settings.hourStart + 12) % 24
      if (typeof input.blockTrackers === 'boolean') settings.blockTrackers = input.blockTrackers
      if (input.blockLevel === 'trackers' || input.blockLevel === 'strict') {
        settings.blockLevel = input.blockLevel
      }
      if (typeof input.thumbnails === 'boolean') settings.thumbnails = input.thumbnails
      if (typeof input.sidebarCollapsed === 'boolean')
        settings.sidebarCollapsed = input.sidebarCollapsed
      if (typeof (input as { onboarded?: unknown }).onboarded === 'boolean') {
        settings.onboarded = (input as { onboarded: boolean }).onboarded
      }
      if (input.agent) {
        if (input.agent.mode === 'demo' || input.agent.mode === 'api')
          settings.agent.mode = input.agent.mode
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
    if (this.store.get().settings.searchEngine !== beforeEngine) this.preconnectSearch()
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

    const request = buildTestRequest(
      definition,
      { baseUrl: state.baseUrl, model: state.model },
      key
    )
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

  /**
   * Glisser-déposer d'un extrait : appelé de façon synchrone pendant le
   * `dragstart` de la page (Electron l'exige), avec un fichier temporaire qui
   * porte la source dans son en-tête. La page ne choisit que le texte
   * sélectionné ; l'URL et le titre viennent de l'onglet réel.
   */
  private startSelectionDrag(sender: WebContents, selected: string): void {
    const text = selected
      .replaceAll('\u0000', '')
      .trim()
      .slice(0, 8000)
    if (!text) return
    const tabId = this.tabs.tabIdForWebContents(sender.id)
    if (!tabId) return
    const tab = this.store.get().tabs.find((item) => item.id === tabId)
    if (!tab || isHomeUrl(tab.url)) return
    const file = join(app.getPath('temp'), `vela-extrait-${Date.now().toString(36)}.md`)
    const quoted = text
      .split(/\n+/)
      .map((line) => `> ${line.trim()}`)
      .join('\n')
    writeFileSync(
      file,
      [
        '---',
        `source: ${tab.url}`,
        `titre: ${(tab.title || tab.url).replace(/\s+/g, ' ')}`,
        '---',
        '',
        quoted,
        ''
      ].join('\n'),
      'utf8'
    )
    const iconPath = join(app.getAppPath(), 'build', 'icon-512.png')
    const icon = existsSync(iconPath)
      ? nativeImage.createFromPath(iconPath).resize({ width: 64, height: 64 })
      : nativeImage.createFromBuffer(
          Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAwAI/AL+4d7cAAAAAElFTkSuQmCC',
            'base64'
          )
        )
    sender.startDrag({ file, icon })
  }

  private saveNote(input: unknown): ReturnType<NotesStore['save']> {
    const payload = (input ?? {}) as SaveNoteInput
    const state = this.store.get()
    const note = this.notes.save({
      id: typeof payload.id === 'string' ? payload.id : undefined,
      title: asString(payload.title).slice(0, 160),
      body: asString(payload.body).slice(0, 200_000),
      spaceId:
        typeof payload.spaceId === 'string' &&
        state.spaces.some((space) => space.id === payload.spaceId)
          ? payload.spaceId
          : state.activeSpaceId,
      url: typeof payload.url === 'string' ? payload.url : undefined,
      tags: payload.tags,
      pinned: payload.pinned
    })
    this.noteCache = this.notes.list()
    this.broadcast()
    return note
  }

  private runAgent(input: unknown): { runId: string } {
    const payload = (input ?? {}) as {
      prompt?: unknown
      sources?: unknown
      spaceId?: unknown
      mode?: unknown
    }
    const prompt = asString(payload.prompt).slice(0, 8000)
    this.tabs.markAgentSent(this.agentSentTabIds, false)
    this.agentSentTabIds.clear()
    if (this.agentSentTimer) clearTimeout(this.agentSentTimer)
    const sources = Array.isArray(payload.sources)
      ? payload.sources
          .filter((source): source is { tabId?: string; title: string; url: string } =>
            Boolean(source && typeof source.title === 'string' && typeof source.url === 'string')
          )
          .slice(0, 8)
          .map((source) => ({
            tabId: typeof source.tabId === 'string' ? source.tabId : undefined,
            title: source.title.slice(0, 200),
            url: source.url.slice(0, 2000)
          }))
      : []
    const settings = this.store.get().settings.agent
    const provider = providerById(settings.provider)
    const endpoint = this.store.get().settings.agent.providers[provider.id].baseUrl
    const localEndpoint = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(endpoint)
    const usesRemoteProvider =
      settings.mode === 'api' && Boolean(this.store.getSecret(provider.id) || !localEndpoint)
    if (usesRemoteProvider) {
      for (const source of sources) if (source.tabId) this.agentSentTabIds.add(source.tabId)
      this.tabs.markAgentSent(this.agentSentTabIds, true)
      this.broadcast()
      this.agentSentTimer = setTimeout(() => {
        this.tabs.markAgentSent(this.agentSentTabIds, false)
        this.agentSentTabIds.clear()
        this.agentSentTimer = null
        this.broadcast()
      }, 60_000)
      this.agentSentTimer.unref()
    }
    return this.agent.start({
      prompt,
      sources,
      spaceId: asString(payload.spaceId) || this.store.get().activeSpaceId,
      mode: payload.mode === 'act' ? 'act' : 'answer'
    })
  }

  /** Onglet de travail de l'agent : neuf, au premier plan, chargé. */
  private async openAgentTab(spaceId: string, url: string): Promise<string> {
    const tab = this.createTab({ spaceId, url })
    this.focusActive()
    const deadline = Date.now() + 8000
    while (Date.now() < deadline) {
      if (this.tabs.contentOf(tab.id)) break
      await new Promise((resolve) => setTimeout(resolve, 60))
    }
    await this.waitForLoad(tab.id)
    return tab.id
  }

  /** Attend la fin du chargement, sans bloquer indéfiniment sur une page morte. */
  private async waitForLoad(tabId: string): Promise<void> {
    const deadline = Date.now() + 20_000
    let calm = 0
    while (Date.now() < deadline) {
      const wc = this.tabs.contentOf(tabId)
      if (!wc) return
      if (wc.isLoading()) calm = 0
      else calm += 1
      // Deux mesures calmes d'affilée : la navigation a eu le temps de démarrer.
      if (calm >= 2 && /^https?:/i.test(wc.getURL())) return
      await new Promise((resolve) => setTimeout(resolve, 120))
    }
  }

  /**
   * Un canal n'est ouvert qu'à la fenêtre concernée et à son cadre principal.
   * Une page web, un cadre imbriqué ou un renderer inconnu n'obtient rien.
   */
  private allowIpc(event: IpcMainEvent | IpcMainInvokeEvent, channel: string): boolean {
    try {
      if (event.senderFrame !== event.sender.mainFrame) return false
    } catch {
      return false
    }
    const shellId = this.win && !this.win.isDestroyed() ? this.win.webContents.id : null
    const kind = senderKindOf(event.sender.id, {
      shell: shellId,
      mini: this.mini.chromeContentsId()
    })
    return canUseChannel(kind, channel)
  }

  /**
   * Un endpoint dit « local » peut viser un hôte distant. Dans ce cas, on
   * demande un accord explicite avant d'enregistrer la destination.
   */
  private async confirmRemoteEndpoint(payload: unknown): Promise<boolean> {
    const input = (payload ?? {}) as SettingsPatch
    const switching = input.agent?.provider === 'local'
    const patched = input.providers?.local?.baseUrl
    if (!switching && typeof patched !== 'string') return true
    const current = this.store.get().settings.agent.providers.local.baseUrl
    const url = typeof patched === 'string' ? patched.trim() : current
    if (!/^https?:\/\//i.test(url) || isLoopbackEndpoint(url)) return true
    const win = this.win
    if (!win || win.isDestroyed()) return false
    const decision = await dialog.showMessageBox(win, {
      type: 'warning',
      title: 'Endpoint distant',
      message: 'Cet endpoint n’est pas sur votre machine',
      detail: `Les textes confiés à l’agent et les notes vocales transcrites partiront vers ${endpointHost(url) ?? url}. Vela ne contrôle pas ce que cet hôte en fait.`,
      buttons: ['Annuler', 'Utiliser cet endpoint'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    })
    return decision.response === 1
  }

  registerIpc(): void {
    if (this.registered) return
    this.registered = true

    const handle: Handle = (channel, handler) => {
      ipcMain.handle(channel, (event, payload: unknown) => {
        if (!this.allowIpc(event, channel)) throw new Error(`Canal IPC refusé : ${channel}`)
        return handler(payload)
      })
    }
    const on: On = (channel, handler) => {
      ipcMain.on(channel, (event, payload: unknown) => {
        if (!this.allowIpc(event, channel)) return
        handler(event, payload)
      })
    }

    this.comic.registerIpc()

    // Le contexte est bâti ici : les champs et méthodes restés privés le
    // demeurent, seuls ceux décrits par IpcHost sortent de la classe.
    const host: IpcHost = {
      store: this.store,
      notes: this.notes,
      noteAudio: this.noteAudio,
      highlights: this.highlights,
      tabs: this.tabs,
      agent: this.agent,
      tunnel: this.tunnel,
      thumbs: this.thumbs,
      mini: this.mini,
      view: () => this.view(),
      broadcast: () => this.broadcast(),
      send: (channel, payload) => this.send(channel, payload),
      metrics: () => this.metrics(),
      win: () => this.win,
      setOverlay: (value) => {
        this.overlay = value
      },
      createTab: (input) => this.createTab(input),
      closeTab: (id) => this.closeTab(id),
      activateTab: (id) => this.activateTab(id),
      pinTab: (input) => this.pinTab(input),
      reopenTab: () => this.reopenTab(),
      toggleSplit: () => this.toggleSplit(),
      setSplitTab: (id) => this.setSplitTab(id),
      reorderTab: (input) => this.reorderTab(input),
      createGroup: (input) => this.createGroup(input),
      updateGroup: (input) => this.updateGroup(input),
      removeGroup: (id) => this.removeGroup(id),
      addSpace: (input) => this.addSpace(input),
      updateSpace: (input) => this.updateSpace(input),
      removeSpace: (id) => {
        this.removeSpace(id)
      },
      duplicateSpace: (id) => this.duplicateSpace(id),
      clearSpaceData: (id) => this.clearSpaceData(id),
      activateSpace: (id) => this.activateSpace(id),
      saveNote: (input) => this.saveNote(input),
      setNoteCache: (list) => {
        this.noteCache = list
      },
      runAgent: (input) => this.runAgent(input),
      updateSettings: (patch) => this.updateSettings(patch),
      testKey: (input) => this.testKey(input),
      confirmRemoteEndpoint: (payload) => this.confirmRemoteEndpoint(payload),
      downloads: () => this.downloads,
      setDownloads: (list) => {
        this.downloads = list
      },
      pendingHistory: () => this.pendingHistory,
      setPendingHistory: (value) => {
        this.pendingHistory = value
      },
      commitPendingHistory: () => this.commitPendingHistory(),
      openMini: (input) => this.openMini(input),
      startSelectionDrag: (sender, selected) => this.startSelectionDrag(sender, selected)
    }

    registerAppIpc(host, handle, on)
    registerTabsIpc(host, handle, on)
    registerSpacesIpc(host, handle)
    registerNotesIpc(host, handle, on)
    registerLibraryIpc(host, handle)
    registerPrivacyIpc(host, handle)
    registerTunnelIpc(host, handle, on)
    registerAgentIpc(host, handle, on)
  }

}
