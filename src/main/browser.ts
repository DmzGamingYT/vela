import { asString } from './coerce'
import { createGroup, removeGroup, updateGroup } from './tabGroups'
import {
  activateTab,
  closeTab,
  createTab,
  pinTab,
  reopenTab,
  reorderTab,
  setSplitTab,
  toggleSplit
} from './tabsOps'
import {
  activateSpace,
  addSpace,
  clearSpaceData,
  duplicateSpace,
  removeSpace,
  updateSpace
} from './spaces'
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
  AppStatePayload,
  CreateTabInput,
  SaveNoteInput,
  SettingsPatch,
} from '@shared/api'
import { TunnelService } from './tunnel'
import {
  createTab as createTabState,
  dayKey,
  newId,
  weekKey
} from '@shared/defaults'
import { SPLIT_MIN_WIDTH } from '@shared/layout'
import { endpointHost, isLoopbackEndpoint, isProviderId, providerById } from '@shared/providers'
import { chatModel } from '@shared/agentModel'
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
import { partitionFor } from '@shared/space'
import {
  type AppView,
  type DownloadItem,
  type HistoryEntry,
  type NoteMeta,
  type PersistedState,
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
import { setSessionLanguage } from './identity'
import { Thumbnails } from './thumbnails'
import { NoteAudioStore } from './noteAudio'
import { HighlightsStore, NotesStore } from './notes'
import { Peek } from './peek'
import { Store } from './store'
import { canUseChannel, senderKindOf } from './ipc/ipcPolicy'
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

/** Raccourcis qui ouvrent une surface de l'interface et attendent le clavier. */
const UI_SHORTCUTS: ReadonlySet<ShortcutAction> = new Set<ShortcutAction>([
  'command',
  'address',
  'settings',
  'history',
  'bookmarks',
  'sessions',
  'notes-search'
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
  readonly peek: Peek

  private win: BrowserWindow | null = null
  private noteCache: NoteMeta[]
  private downloads: DownloadItem[] = []
  private trackedSessions = new Set<string>()
  private agentSentTabIds = new Set<string>()
  /**
   * Dernière vue émise par onglet. La coque la reçoit à chaque diffusion ;
   * rendre le même objet quand rien n'a bougé lui permet de comparer par
   * identité au lieu de resérialiser et de redessiner chaque ligne.
   */
  private tabViews = new Map<string, TabView>()
  private agentSentTimer: NodeJS.Timeout | null = null
  private broadcastTimer: NodeJS.Timeout | null = null
  private sweepTimer: NodeJS.Timeout | null = null
  private workPreviews = new Map<string, { updatedAt: number; preview: string }>()
  /**
   * Dernier état diffusé. Sert à deux choses : ne pas renvoyer une tranche qui
   * n'a pas bougé, et rendre la même liste au renderer quand son contenu est
   * identique — il compare par identité avant de resérialiser.
   */
  private lastSent: AppView | null = null
  /**
   * Empreinte du contenu de chaque tranche au dernier envoi. Le store mute son
   * état en place (`update(mutator)`), donc la même référence ne prouve pas le
   * même contenu : seul `JSON.stringify` le dit.
   */
  private lastPrints = new Map<string, string>()
  private lastHistorySource: HistoryEntry[] | null = null
  private lastHistory: AppView['history'] | null = null
  private lastWorksSource: unknown = null
  private lastWorks: AppView['works'] | null = null
  private overlay = false
  private registered = false
  /** Split mis en veille (fenêtre trop étroite ou tiroir ouvert), à restaurer dès que la place revient. */
  private splitSuspended = false
  /** Deux volets tiennent-ils dans la largeur mesurée par la coque ? */
  private splitPanesFit = true

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
    noteBlocked: () => this.noteBlocked(),
    freezeNotice: (shots) => this.send('views:frozen', shots),
    scrollDirection: (direction) => this.send('scroll:direction', direction),
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
    zoomFor: (host) => {
      const value = this.store.get().settings.zoomByHost[host]
      return typeof value === 'number' ? value : null
    },
    rememberZoom: (host, level) => {
      this.store.setHostZoom(host, level)
      // La liste des réglages lit la vue diffusée : sans cela, un site
      // nouvellement mémorisé n'y apparaît qu'au prochain changement d'état.
      this.broadcast()
    },
    openPeek: (url, spaceId) => this.openPeek({ url, ...(spaceId ? { spaceId } : {}) }),
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
    this.peek = new Peek({
      parent: () => this.win,
      // Sans espace demandé, la carte emprunte celui qui est ouvert.
      space: (id) => {
        const state = this.store.get()
        return state.spaces.find((space) => space.id === (id ?? state.activeSpaceId))
      },
      sessionFor: (space) => this.tabs.sessionFor(space),
      pageBackground: () => this.tabs.backgroundForPages(),
      visited: (spaceId, url, title) => this.host.visited(spaceId, url, title),
      openTab: (spaceId, url, background) =>
        this.createTab({ spaceId, url, activate: background !== true }).id,
      splitTab: (id) => this.setSplitTab(id),
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
    // Deux panneaux de 320 px ne tiennent pas dans une fenêtre étroite — ni
    // quand un tiroir ouvert mange la place disponible. Le split est suspendu
    // (jamais supprimé) puis restauré dès que la place revient.
    win.on('resize', () => this.syncSplit())
    this.syncSplit()
    win.on('closed', () => {
      if (this.win === win) this.win = null
    })
  }

  /** Largeur utile de la fenêtre ; 0 quand aucune fenêtre n'est attachée. */
  private windowWidth(): number {
    const win = this.win
    if (!win || win.isDestroyed()) return 0
    try {
      return win.getContentBounds().width
    } catch {
      return 0
    }
  }

  /** Vrai quand la fenêtre ou le conteneur des volets est trop étroit. */
  private splitBlocked(): boolean {
    const width = this.windowWidth()
    return (width > 0 && width < SPLIT_MIN_WIDTH) || !this.splitPanesFit
  }

  /**
   * La coque mesure la place réellement disponible : un tiroir (Notes/Agent)
   * retire ~340 px au workspace sans que la fenêtre bouge, donc sans `resize`.
   * On applique la même suspension que pour une fenêtre étroite, afin que la
   * barre latérale et l'Atelier ne croient pas le split encore actif.
   */
  setSplitPanesFit(fits: boolean): void {
    if (this.splitPanesFit === fits) return
    this.splitPanesFit = fits
    this.syncSplit()
  }

  /**
   * Range la vue scindée quand la place manque et la remet exactement là où
   * elle était dès que la place revient. L'état `split` reste la source de
   * vérité unique pour la coque, la barre latérale et l'Atelier.
   */
  private syncSplit(): void {
    const state = this.store.get()
    if (this.splitBlocked()) {
      if (!state.split) return
      this.splitSuspended = true
      state.split = false
    } else {
      if (!this.splitSuspended) return
      this.splitSuspended = false
      const second = state.secondTabBySpace[state.activeSpaceId]
      if (!second || !state.tabs.some((tab) => tab.id === second)) return
      state.split = true
    }
    this.store.schedule()
    this.broadcast()
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
      this.send('state:changed', this.statePayload())
    }, 120)
  }

  /**
   * Compare deux listes par identité d'élément : les objets d'onglet sont
   * stables (`stableTabView`), donc la même référence veut dire « rien n'a
   * bougé » sans resérialiser quoi que ce soit.
   */
  private sameList<T>(previous: readonly T[] | undefined, next: readonly T[]): boolean {
    if (!previous || previous.length !== next.length) return false
    for (let i = 0; i < next.length; i += 1) if (previous[i] !== next[i]) return false
    return true
  }

  /**
   * Charge de `state:changed` : l'état complet au premier envoi, puis seulement
   * les tranches dont la référence a changé. Le renderer fusionne et garde, lui
   * aussi, les tranches inchangées.
   */
  private statePayload(): AppStatePayload {
    const view = this.view()
    const premier = !this.lastSent
    this.lastSent = view
    const patch: Partial<AppView> = {}
    for (const key of Object.keys(view) as (keyof AppView)[]) {
      const empreinte = JSON.stringify(view[key])
      if (this.lastPrints.get(key) !== empreinte) {
        this.lastPrints.set(key, empreinte)
        if (!premier) (patch as Record<string, unknown>)[key] = view[key]
      }
    }
    return premier ? { full: view } : { patch }
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
    // Langue des pages : un en-tête, aucune requête de plus. Elle est appliquée
    // par le listener d'identité : Chromium ne garde qu'un seul
    // `onBeforeSendHeaders` par session, et le second remplacerait le premier —
    // l'UA et les client hints Chrome étaient alors perdus sans un bruit.
    setSessionLanguage(ses, () => acceptLanguage(this.store.get().settings.webLanguage))
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
    // Une seule lecture des métriques : chaque renderer est ensuite rattaché à
    // son onglet par son PID système, et l'application a la sienne.
    const byPid = new Map<number, number>()
    let appMb: number | null = null
    try {
      for (const metric of app.getAppMetrics()) {
        const mb = metric.memory.workingSetSize / 1024
        byPid.set(metric.pid, mb)
        if (metric.type === 'Browser') appMb = mb
      }
    } catch {
      /* métriques indisponibles en dev */
    }
    const processes: ProcessInfo[] = state.tabs.map((tab) => {
      const alive = live.has(tab.id)
      const pid = alive ? this.tabs.pidOf(tab.id) : null
      return {
        tabId: tab.id,
        title: tab.title,
        url: tab.url,
        live: alive,
        blocked: this.tabs.runtimeOf(tab.id).blocked,
        type: 'tab',
        memoryMb: pid === null ? null : (byPid.get(pid) ?? null)
      }
    })
    if (appMb !== null) {
      processes.unshift({
        tabId: null,
        title: 'Vela',
        url: '',
        live: true,
        blocked: this.tabs.blockedTotal(),
        type: 'app',
        memoryMb: appMb
      })
    }
    return { live: live.size, processes: processes.slice(0, 60) }
  }

  /**
   * Même référence tant que la vue d'un onglet est identique champ par champ
   * (tous scalaires) : `stableView` cesse de la sérialiser à chaque diffusion,
   * et `memo(TabRow)` peut retenir la ligne.
   */
  private stableTabView(next: TabView): TabView {
    const known = this.tabViews.get(next.id)
    if (known) {
      const keys = Object.keys(next) as (keyof TabView)[]
      if (keys.length === Object.keys(known).length) {
        let same = true
        for (const key of keys) {
          if (known[key] === next[key]) continue
          // Les hôtes bloqués sont une liste : deux tableaux de même contenu
          // valent la même vue, sans quoi chaque diffusion les renverrait.
          if (key === 'blockedHosts') {
            const a = known.blockedHosts
            const b = next.blockedHosts
            if (
              a.length === b.length &&
              a.every((entry, index) => entry.host === b[index].host && entry.count === b[index].count)
            ) {
              continue
            }
          }
          same = false
          break
        }
        if (same) return known
      }
    }
    this.tabViews.set(next.id, next)
    return next
  }

  view(): AppView {
    const state = this.store.get()
    const activeTabId = state.activeTabBySpace[state.activeSpaceId] ?? ''
    const candidate = state.split ? (state.secondTabBySpace[state.activeSpaceId] ?? null) : null
    const secondTabId =
      candidate && state.tabs.some((tab) => tab.id === candidate) ? candidate : null
    const construits: TabView[] = state.tabs.map((tab) =>
      this.stableTabView({
        ...tab,
        ...this.tabs.runtimeOf(tab.id),
        agentSent: this.agentSentTabIds.has(tab.id)
      })
    )
    // Même contenu, même tableau : la coque s'en sert pour ne rien redessiner et
    // la diffusion pour ne pas renvoyer la tranche.
    const tabs = this.sameList(this.lastSent?.tabs, construits)
      ? (this.lastSent as AppView).tabs
      : construits
    // Un onglet fermé ne doit pas garder sa vue en mémoire.
    if (this.tabViews.size > tabs.length) {
      const live = new Set(tabs.map((tab) => tab.id))
      for (const id of this.tabViews.keys()) if (!live.has(id)) this.tabViews.delete(id)
    }
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
      history: this.memoHistory(state.history),
      bookmarks: state.bookmarks,
      privacyExemptions: state.privacyExemptions,
      memoryFreed: this.tabs.memoryFreedMb(),
      canReopen: state.closed.length > 0,
      tunnelMaps: this.store.listTunnelMaps(),
      notes: this.noteCache,
      tasks: state.tasks.slice(0, 200),
      // Les rapports restent sur le disque : l'état ne transporte que leur résumé.
      works: this.memoWorks(state.works),
      downloads: this.downloads.slice(0, 30),
      blockedTotal,
      blockedToday: state.privacyStats.today,
      blockedWeek: state.privacyStats.week
    }
  }

  /** Les 80 dernières visites, reconstruites seulement quand l'historique bouge. */
  private memoHistory(source: HistoryEntry[]): AppView['history'] {
    if (this.lastHistorySource === source && this.lastHistory) return this.lastHistory
    this.lastHistorySource = source
    this.lastHistory = source.slice(0, 80)
    return this.lastHistory
  }

  /** Résumés des rapports, recalculés seulement quand la liste des rapports change. */
  private memoWorks(source: AppView['works'] | { id: string }[]): AppView['works'] {
    if (this.lastWorksSource === source && this.lastWorks) return this.lastWorks
    this.lastWorksSource = source
    this.lastWorks = source.slice(0, 120).map((brut) => {
      const work = brut as AppView['works'][number] & { markdown: string; sources: unknown[] }
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
    })
    return this.lastWorks
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
   * Ouvre le coup d'œil dans la fenêtre principale. Sans adresse, la carte
   * s'ouvre sur son champ d'adresse ; l'espace qui prête sa session est
   * l'espace actif, sauf précision contraire.
   */
  openPeek(input: { url?: string; spaceId?: string } = {}): boolean {
    return this.peek.open(input)
  }

  // Les gestes d'onglet vivent dans `tabsOps.ts`.
  createTab(input: CreateTabInput = {}): TabState {
    return createTab(this, input)
  }

  private activateTab(id: string): void {
    activateTab(this, id)
  }

  private async closeTab(id: string): Promise<void> {
    await closeTab(this, id)
  }

  private reopenTab(): void {
    reopenTab(this)
  }

  private toggleSplit(): void {
    toggleSplit(this)
  }

  private setSplitTab(id: string): void {
    setSplitTab(this, id)
  }

  // Les mutations d'espace vivent dans `spaces.ts` (voir ce module) : `Browser`
  // ne garde que la délégation et l'hôte qui expose état, sauvegarde et vues.
  private addSpace(input: unknown): void {
    addSpace(this, input)
  }

  private updateSpace(input: unknown): void {
    updateSpace(this, input)
  }

  private async clearSpaceData(id: string): Promise<void> {
    await clearSpaceData(this, id)
  }

  private removeSpace(id: string): void {
    removeSpace(this, id)
  }

  private duplicateSpace(id: string): void {
    duplicateSpace(this, id)
  }

  private activateSpace(id: string): void {
    activateSpace(this, id)
  }

  // ── Hôte des mutations d'espace ──────────────────────────────────────
  get profileDir(): string {
    return this.store.dir
  }

  state(): PersistedState {
    return this.store.get()
  }

  persist(): void {
    this.store.schedule()
  }

  focusWindow(): void {
    this.focusActive()
  }

  destroySpaceViews(spaceId: string): void {
    this.tabs.destroySpace(spaceId)
  }

  referencedAvatars(): Set<string> {
    return this.store.referencedAvatars()
  }

  // ── Hôte des gestes d'onglet ─────────────────────────────────────────
  splitAllowed(): boolean {
    return !this.splitBlocked()
  }

  forgetAgentTab(tabId: string): void {
    this.agentSentTabIds.delete(tabId)
  }

  destroyView(tabId: string): void {
    this.tabs.destroy(tabId)
  }

  captureSource(tabId: string): WebContents | null {
    return this.tabs.captureSource(tabId)
  }

  storeThumbnail(contents: WebContents, url: string): Promise<boolean> {
    return this.thumbs.capture(contents, url)
  }

  private pinTab(input: unknown): void {
    pinTab(this, input)
  }

  private reorderTab(input: unknown): void {
    reorderTab(this, input)
  }

  // Les dossiers d'onglets vivent dans `tabGroups.ts`.
  private createGroup(input: unknown): TabGroup {
    return createGroup(this, input)
  }

  private updateGroup(input: unknown): void {
    updateGroup(this, input)
  }

  private removeGroup(id: string): void {
    removeGroup(this, id)
  }

  /** Une requête arrêtée : compteurs du jour et de la semaine, persistés. */
  private noteBlocked(): void {
    const now = Date.now()
    const day = dayKey(now)
    const week = weekKey(now)
    this.store.update((state) => {
      const stats = state.privacyStats
      if (stats.day !== day) {
        stats.day = day
        stats.today = 0
      }
      if (stats.weekStart !== week) {
        stats.weekStart = week
        stats.week = 0
      }
      stats.today += 1
      stats.week += 1
    })
    this.store.schedule()
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
      if (typeof input.accentOverride === 'boolean') {
        settings.accentOverride = input.accentOverride
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
      if (
        input.homeIntensity === 'discreet' ||
        input.homeIntensity === 'normal' ||
        input.homeIntensity === 'marked'
      ) {
        settings.homeIntensity = input.homeIntensity
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
      if (
        input.updateChecks === 'auto' ||
        input.updateChecks === 'weekly' ||
        input.updateChecks === 'off'
      ) {
        settings.updateChecks = input.updateChecks
      }
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

    const probe = await chatModel({
      definition,
      config: { baseUrl: state.baseUrl, model: state.model },
      key
    }).probe()
    if (probe.availability === 'available') {
      // Une clé valide ne suffit pas : le modèle doit répondre. Un aller-retour
      // d'un mot vérifie d'un coup la clé, l'endpoint et le nom du modèle —
      // c'est exactement ce que l'agent demandera ensuite.
      try {
        const session = await chatModel({
          definition,
          config: { baseUrl: state.baseUrl, model: state.model },
          key,
          timeoutMs: 20_000
        }).create({ system: 'Réponds uniquement par le mot : ok' })
        try {
          await session.prompt('Réponds par le mot : ok')
        } finally {
          session.destroy()
        }
        const message = definition.local
          ? 'Serveur local joignable, le modèle répond.'
          : 'Clé acceptée, le modèle répond.'
        this.store.setKeyStatus(id, 'ok', message)
        this.broadcast()
        return { ok: true, message }
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Rien reçu.'
        const message = `Clé acceptée, mais le modèle n’a pas répondu. ${detail}`.slice(0, 180)
        this.store.setKeyStatus(id, 'error', message)
        this.broadcast()
        return { ok: false, message }
      }
    }
    const message =
      probe.status === 401 || probe.status === 403
        ? 'Clé refusée par le fournisseur.'
        : probe.status
          ? `Réponse ${probe.status}${probe.detail ? ` · ${probe.detail}` : ''}`
          : definition.local
            ? 'Serveur local injoignable. Lancez-le, puis réessayez.'
            : 'Connexion impossible. Vérifiez l’endpoint et le réseau.'
    this.store.setKeyStatus(id, 'error', message)
    this.broadcast()
    return { ok: false, message }
  }

  /**
   * Glisser-déposer d'un extrait : appelé de façon synchrone pendant le
   * `dragstart` de la page (Electron l'exige), avec un fichier temporaire qui
   * porte la source dans son en-tête. La page ne choisit que le texte
   * sélectionné ; l'URL et le titre viennent de l'onglet réel.
   */
  private startSelectionDrag(sender: WebContents, selected: string): void {
    const text = selected.replaceAll('\u0000', '').trim().slice(0, 8000)
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
      history?: unknown
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
    const history = Array.isArray(payload.history)
      ? payload.history
          .filter((turn): turn is { role: 'user' | 'assistant'; content: string } =>
            Boolean(
              turn &&
              typeof turn === 'object' &&
              (turn as { role?: unknown }).role !== undefined &&
              ((turn as { role?: unknown }).role === 'user' ||
                (turn as { role?: unknown }).role === 'assistant') &&
              typeof (turn as { content?: unknown }).content === 'string'
            )
          )
          .slice(-10)
          .map((turn) => ({ role: turn.role, content: turn.content.slice(0, 4000) }))
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
      mode: payload.mode === 'act' ? 'act' : 'answer',
      history
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
    const kind = senderKindOf(event.sender.id, { shell: shellId })
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
        return handler(payload, event)
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
      peek: this.peek,
      view: () => this.view(),
      broadcast: () => this.broadcast(),
      send: (channel, payload) => this.send(channel, payload),
      metrics: () => this.metrics(),
      win: () => this.win,
      setOverlay: (value) => {
        this.overlay = value
      },
      setSplitPanesFit: (fits) => this.setSplitPanesFit(fits),
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
      openPeek: (input) => this.openPeek(input),
      startSelectionDrag: (sender, selected) => this.startSelectionDrag(sender, selected)
    }

    registerAppIpc(host, handle, on)
    registerTabsIpc(host, handle, on)
    registerSpacesIpc(host, handle, on)
    registerNotesIpc(host, handle, on)
    registerLibraryIpc(host, handle, on)
    registerPrivacyIpc(host, handle, on)
    registerTunnelIpc(host, handle, on)
    registerAgentIpc(host, handle, on)
  }
}
