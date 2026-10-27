import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  Menu,
  nativeTheme,
  WebContentsView,
  type Event as ElectronEvent,
  type Input,
  type MenuItemConstructorOptions,
  type Session
} from 'electron'
import { HOME_URL } from '@shared/types'
import type {
  LayoutRequest,
  PaneRect,
  SelectionPayload,
  Settings,
  ShortcutAction,
  ShortcutEvent,
  Space,
  TabState
} from '@shared/types'
import { opensMiniWindow, shouldOpenAsPopup } from '@shared/navigation'
import { partitionFor } from '@shared/space'
import { isHomeUrl, normalizeInput, titleFromUrl } from '@shared/url'
import { attachPrivacy, prepareSession } from './privacy'
import { applyBrowserIdentity } from './identity'

/**
 * Preload des pages web : complète `window.chrome` (cf. `src/preload/page.ts`).
 * Distinct de celui de l'interface, qui seul expose `window.vela`.
 */
const PAGE_PRELOAD = join(__dirname, '../preload/page.js')

export interface TabHost {
  tab(id: string): TabState | undefined
  trackSession?(ses: Session, partition: string): void
  space(id: string): Space | undefined
  patchTab(id: string, patch: Partial<TabState>): void
  changed(): void
  /** `background` ouvre l'onglet sans lui donner le focus (⌘ + clic). */
  createTab(spaceId: string, url: string, background?: boolean): string
  tabsOfSpace(spaceId: string): TabState[]
  shortcut(event: ShortcutEvent): void
  settings(): Settings
  visited(spaceId: string, url: string, title: string): void
  selection(payload: SelectionPayload): void
  isExempted(host: string): boolean
  /** Ouvre une page dans la petite fenêtre jetable, sans créer d'onglet. */
  openMini?(url: string, spaceId?: string): void
  /** Surlignages déjà enregistrés pour cette URL, repeints au chargement. */
  highlightsFor?(url: string): string[]
}

interface Runtime {
  loading: boolean
  error: string | null
  agentSent?: boolean
}

export interface TabRuntime {
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  blocked: number
  agentSent: boolean
  error: string | null
  asleep: boolean
  blockedHosts: { host: string; count: number }[]
}

const MAX_LIVE_VIEWS = 5
const IDLE_DISCARD_MS = 5 * 60_000

export class TabManager {
  private views = new Map<string, WebContentsView>()
  private runtimes = new Map<string, Runtime>()
  private blocked = new Map<string, number>()
  private blockedHosts = new Map<string, Map<string, number>>()
  private freedMb = 0
  private byWebContents = new Map<number, string>()
  private lastUsed = new Map<string, number>()
  private visible = new Set<string>()
  private panes: PaneRect[] = []
  private overlay = false

  constructor(
    private getWindow: () => BrowserWindow | null,
    private host: TabHost
  ) {}

  markAgentSent(tabIds: Iterable<string>, sent: boolean): void {
    for (const tabId of tabIds) {
      const runtime = this.runtimes.get(tabId)
      if (runtime) runtime.agentSent = sent
    }
  }

  runtimeOf(tabId: string): TabRuntime {
    const view = this.views.get(tabId)
    const runtime = this.runtimes.get(tabId)
    const alive = Boolean(view && !view.webContents.isDestroyed())
    const hosts = this.blockedHosts.get(tabId)
    return {
      loading: runtime?.loading ?? false,
      canGoBack: alive ? view!.webContents.navigationHistory.canGoBack() : false,
      canGoForward: alive ? view!.webContents.navigationHistory.canGoForward() : false,
      blocked: this.blocked.get(tabId) ?? 0,
      agentSent: Boolean(runtime?.agentSent),
      error: runtime?.error ?? null,
      // Une vue déchargée par le balayeur : la page reste dans la liste, sa
      // mémoire est rendue au système.
      asleep: !alive && !isHomeUrl(this.host.tab(tabId)?.url),
      blockedHosts: hosts
        ? Array.from(hosts, ([host, count]) => ({ host, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 12)
        : []
    }
  }

  /** Mémoire approximative rendue par les onglets mis en veille (Mo). */
  memoryFreedMb(): number {
    return Math.round(this.freedMb)
  }

  private countBlocked(webContentsId: number, host: string): void {
    const tabId = this.byWebContents.get(webContentsId)
    if (!tabId) return
    this.blocked.set(tabId, (this.blocked.get(tabId) ?? 0) + 1)
    if (host) {
      const hosts = this.blockedHosts.get(tabId) ?? new Map<string, number>()
      hosts.set(host, (hosts.get(host) ?? 0) + 1)
      this.blockedHosts.set(tabId, hosts)
    }
    this.host.changed()
  }

  blockedTotal(): number {
    let total = 0
    for (const count of this.blocked.values()) total += count
    return total
  }

  private scrolls = new Map<string, number>()

  /** Fond des pages natives : la petite fenêtre peint le même. */
  backgroundForPages(): string {
    const theme = this.host.settings().theme
    const dark = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors)
    return dark ? '#09090b' : '#ffffff'
  }

  /** Session d'un espace (cookies, filtre de traqueurs, identité). */
  sessionFor(space: Space) {
    // Une partition absente arrive en `undefined` jusqu'à Chromium, qui refuse
    // alors l'argument et tue le processus principal : on la calcule ici.
    const partition = partitionFor(space)
    const ses = prepareSession(partition)
    try {
      this.host.trackSession?.(ses, partition)
    } catch {
      /* suivi téléchargements optionnel */
    }
    attachPrivacy(
      ses,
      // Le réglage global peut être retiré espace par espace (la session, elle,
      // reste la même : le filtre lit la valeur courante à chaque requête).
      () => this.host.settings().blockTrackers && space.blockTrackers !== false,
      (webContentsId, host) => this.countBlocked(webContentsId, host),
      (pageUrl) => {
        try {
          return this.host.isExempted(new URL(pageUrl).hostname)
        } catch {
          return false
        }
      }
    )
    return ses
  }

  /**
   * Crée la vue native si nécessaire. Les onglets d'accueil n'en ont pas.
   * `autoLoad = false` laisse l'appelant lancer lui-même l'unique navigation
   * (sinon `navigate` chargeait l'URL une première fois ici, puis une seconde
   * fois juste après : deux requêtes pour une seule entrée).
   */
  ensure(tabId: string, autoLoad = true): WebContentsView | null {
    const tab = this.host.tab(tabId)
    if (!tab || isHomeUrl(tab.url)) return null
    const existing = this.views.get(tabId)
    if (existing && !existing.webContents.isDestroyed()) {
      this.touch(tabId)
      return existing
    }

    const space = this.host.space(tab.spaceId)
    if (!space) return null

    const view = new WebContentsView({
      webPreferences: {
        session: this.sessionFor(space),
        preload: PAGE_PRELOAD,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false,
        backgroundThrottling: true
      }
    })
    const win = this.getWindow()
    if (!win) return null
    view.setBackgroundColor(this.backgroundForPages())
    view.setVisible(false)
    this.views.set(tabId, view)
    this.runtimes.set(tabId, { loading: true, error: null })
    this.lastUsed.set(tabId, Date.now())
    win.contentView.addChildView(view)
    this.wire(tabId, view)
    this.evictExcess(new Set(this.visible))
    if (autoLoad) {
      void view.webContents.loadURL(tab.url).catch(() => {
        /* did-fail-load remonte déjà l'erreur */
      })
    }
    this.host.changed()
    return view
  }

  private wire(tabId: string, view: WebContentsView): void {
    const wc = view.webContents
    this.byWebContents.set(wc.id, tabId)
    applyBrowserIdentity(wc)
    const patch = (patchValue: Partial<TabState>): void => this.host.patchTab(tabId, patchValue)

    wc.setWindowOpenHandler((details) => {
      if (!/^https?:/i.test(details.url)) return { action: 'deny' }
      const tab = this.host.tab(tabId)
      if (!tab) return { action: 'deny' }
      // Geste de lien (⌘⌥ + clic, ⇧ + clic) : la petite fenêtre jetable, comme
      // Little Arc — aucun onglet créé, la carte du travail reste en place.
      if (opensMiniWindow(details.disposition, details.features)) {
        this.host.openMini?.(details.url, tab.spaceId)
        return { action: 'deny' }
      }
      // Popups (window.open, OAuth « Se connecter avec Google »…) : vraie
      // fenêtre avec opener intact, héritant la session de l'espace.
      if (shouldOpenAsPopup(details.disposition, details.features)) {
        const parent = this.getWindow()
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            parent: parent ?? undefined,
            modal: false,
            show: true,
            width: 540,
            height: 680,
            minWidth: 360,
            minHeight: 480,
            autoHideMenuBar: true,
            webPreferences: {
              preload: PAGE_PRELOAD,
              sandbox: true,
              contextIsolation: true,
              nodeIntegration: false
            },
            title: 'Vela',
            backgroundColor: this.backgroundForPages()
          }
        }
      }
      // ⌘ + clic garde sa promesse : l'onglet s'ouvre sans voler le focus.
      this.host.createTab(tab.spaceId, details.url, details.disposition === 'background-tab')
      return { action: 'deny' }
    })

    wc.on('did-start-loading', () => {
      const previous = this.runtimes.get(tabId)
      this.runtimes.set(tabId, { loading: true, error: null, agentSent: previous?.agentSent ?? false })
      this.host.changed()
    })

    wc.on('did-stop-loading', () => {
      const current = this.runtimes.get(tabId)
      this.runtimes.set(tabId, { loading: false, error: current?.error ?? null, agentSent: current?.agentSent ?? false })
      this.restoreScroll(tabId, view)
      this.host.changed()
    })

    wc.on('page-title-updated', (_event, title) => {
      const clean = title.trim()
      if (clean) patch({ title: clean })
      this.host.changed()
    })

    wc.on('page-favicon-updated', (_event, favicons) => {
      const favicon = favicons.find((icon) => /^https?:/i.test(icon)) ?? favicons[0]
      if (favicon) patch({ favicon })
      this.host.changed()
    })

    // Nouvelle page : le décompte du bouclier repart de zéro pour cette URL.
    wc.on('did-start-navigation', (details, _url, _inPlace, isMainFrame) => {
      const mainFrame = details.isMainFrame ?? isMainFrame
      if (!mainFrame) return
      this.blocked.delete(tabId)
      this.blockedHosts.delete(tabId)
    })

    wc.on('did-navigate', (_event, url) => {
      this.record(tabId, url)
      this.host.changed()
    })

    wc.on('did-finish-load', () => {
      const tab = this.host.tab(tabId)
      const saved = tab ? this.host.highlightsFor?.(tab.url) ?? [] : []
      if (saved.length > 0) void this.paintHighlights(tabId, saved)
    })

    wc.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (!isMainFrame) return
      this.record(tabId, url)
      this.host.changed()
    })

    wc.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
      if (!isMainFrame || code === -3 || url === HOME_URL) return
      const current = this.runtimes.get(tabId)
      this.runtimes.set(tabId, { loading: false, error: description || 'Chargement impossible', agentSent: current?.agentSent ?? false })
      this.host.changed()
    })

    wc.on('render-process-gone', (_event, details) => {
      this.runtimes.set(tabId, {
        loading: false,
        error: details.reason === 'clean-exit' ? null : 'La page a cessé de répondre.',
        agentSent: this.runtimes.get(tabId)?.agentSent ?? false
      })
      this.host.changed()
    })

    wc.on('before-input-event', (event, input) => this.handleInput(event, input))

    // Menu contextuel : les actions sur la sélection sont le cœur de l’agent
    // « à côté de la page ». Les rôles natifs gardent le copier/coller habituel.
    wc.on('context-menu', (_event, params) => {
      const tab = this.host.tab(tabId)
      if (!tab) return
      const selection = params.selectionText.trim().slice(0, 4000)
      const items: MenuItemConstructorOptions[] = []
      if (selection) {
        const send = (action: SelectionPayload['action']): void =>
          this.host.selection({ action, text: selection, url: tab.url, title: tab.title, tabId })
        items.push(
          { label: 'Résumer la sélection', click: () => send('summarize') },
          { label: 'Expliquer', click: () => send('explain') },
          { label: 'Traduire', click: () => send('translate') },
          { label: 'Simplifier', click: () => send('simplify') },
          { type: 'separator' },
          { label: 'Surligner et annoter', click: () => send('highlight') },
          { label: 'Ajouter à une note', click: () => send('note') },
          { type: 'separator' },
          { role: 'copy', label: 'Copier' }
        )
        if (params.isEditable) {
          items.push({ role: 'cut', label: 'Couper' }, { role: 'paste', label: 'Coller' })
        }
      } else if (params.isEditable) {
        items.push(
          { role: 'cut', label: 'Couper' },
          { role: 'copy', label: 'Copier' },
          { role: 'paste', label: 'Coller' },
          { role: 'selectAll', label: 'Tout sélectionner' }
        )
      }
      if (params.linkURL && /^https?:/i.test(params.linkURL)) {
        if (items.length > 0) items.push({ type: 'separator' })
        items.push(
          {
            label: 'Ouvrir le lien dans un nouvel onglet',
            click: () => this.host.createTab(tab.spaceId, params.linkURL)
          },
          {
            label: 'Ouvrir le lien dans le mini navigateur',
            click: () => this.host.openMini?.(params.linkURL, tab.spaceId)
          }
        )
      }
      if (items.length === 0) return
      Menu.buildFromTemplate(items).popup({ window: this.getWindow() ?? undefined })
    })

    wc.on('destroyed', () => {
      this.byWebContents.delete(wc.id)
      if (this.views.get(tabId)?.webContents === wc) this.views.delete(tabId)
    })
  }

  private record(tabId: string, url: string): void {
    const tab = this.host.tab(tabId)
    if (!tab || !/^https?:/i.test(url)) return
    const title = this.views.get(tabId)?.webContents.getTitle() || titleFromUrl(url)
    this.host.patchTab(tabId, { url, title: title || tab.title })
    const space = this.host.space(tab.spaceId)
    if (space) this.host.visited(tab.spaceId, url, title)
  }

  navigate(tabId: string, input: string): void {
    const tab = this.host.tab(tabId)
    if (!tab) return
    this.touch(tabId)
    const settings = this.host.settings()
    const target = normalizeInput(input, settings.searchEngine, settings.searxInstance)
    if (isHomeUrl(target.url)) {
      this.goHome(tabId)
      return
    }
    this.runtimes.set(tabId, { loading: true, error: null })
    this.host.patchTab(tabId, { url: target.url, title: titleFromUrl(target.url), favicon: undefined })
    const view = this.ensure(tabId, false)
    if (view) {
      void view.webContents.loadURL(target.url).catch(() => {})
      view.webContents.focus()
    }
    this.applyLayout()
    this.host.changed()
  }

  goHome(tabId: string): void {
    const view = this.views.get(tabId)
    this.views.delete(tabId)
    if (view) {
      this.getWindow()?.contentView.removeChildView(view)
      if (!view.webContents.isDestroyed()) view.webContents.close()
    }
    this.runtimes.set(tabId, { loading: false, error: null })
    this.host.patchTab(tabId, { url: HOME_URL, title: 'Nouvel onglet', favicon: undefined })
    this.applyLayout()
    this.host.changed()
  }

  find(
    tabId: string,
    query: string,
    forward = true
  ): Promise<{ matches: number; activeMatchOrdinal: number }> {
    const view = this.ensure(tabId)
    if (!view || view.webContents.isDestroyed()) return Promise.resolve({ matches: 0, activeMatchOrdinal: 0 })
    const clean = query.slice(0, 300)
    if (!clean) {
      view.webContents.stopFindInPage('clearSelection')
      return Promise.resolve({ matches: 0, activeMatchOrdinal: 0 })
    }
    return new Promise((resolve) => {
      let requestId = -1
      const listener = (_event: ElectronEvent, result: unknown): void => {
        const detail = result as { requestId?: number; matches?: number; activeMatchOrdinal?: number; finalUpdate?: boolean }
        if (detail.requestId !== requestId || !detail.finalUpdate) return
        view.webContents.removeListener('found-in-page', listener)
        resolve({ matches: detail.matches ?? 0, activeMatchOrdinal: detail.activeMatchOrdinal ?? 0 })
      }
      view.webContents.on('found-in-page', listener)
      requestId = view.webContents.findInPage(clean, { findNext: true, forward })
    })
  }

  findStop(tabId: string, action: 'clearSelection' | 'keepSelection' = 'clearSelection'): void {
    const view = this.views.get(tabId)
    if (view && !view.webContents.isDestroyed()) view.webContents.stopFindInPage(action)
  }

  back(tabId: string): void {
    this.touch(tabId)
    const wc = this.views.get(tabId)?.webContents
    if (wc && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
  }

  forward(tabId: string): void {
    this.touch(tabId)
    const wc = this.views.get(tabId)?.webContents
    if (wc && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
  }

  /** Zoom du texte de la page, par paliers, comme un navigateur classique. */
  zoom(tabId: string, direction: 'in' | 'out' | 'reset'): void {
    const view = this.views.get(tabId)
    if (!view || view.webContents.isDestroyed()) return
    const current = view.webContents.getZoomLevel()
    const next = direction === 'reset' ? 0 : Math.min(4, Math.max(-3, current + (direction === 'in' ? 0.5 : -0.5)))
    view.webContents.setZoomLevel(next)
  }

  /**
   * Vue encore vivante d'un onglet, pour en prendre une capture avant de le
   * fermer. `null` si l'onglet est en veille ou si sa page a échoué.
   */
  captureSource(tabId: string): Electron.WebContents | null {
    if (this.runtimes.get(tabId)?.error) return null
    const view = this.views.get(tabId)
    if (!view || view.webContents.isDestroyed()) return null
    return view.webContents
  }

  /** Impression de la page : boîte de dialogue système, PDF possible. */
  print(tabId: string): boolean {
    const view = this.views.get(tabId)
    if (!view || view.webContents.isDestroyed()) return false
    view.webContents.print({ printBackground: true, silent: false })
    return true
  }

  reload(tabId: string): void {
    this.touch(tabId)
    const view = this.views.get(tabId)
    if (view && !view.webContents.isDestroyed()) {
      this.runtimes.set(tabId, { loading: true, error: null })
      view.webContents.reload()
      this.host.changed()
      return
    }
    const tab = this.host.tab(tabId)
    if (tab && !isHomeUrl(tab.url)) {
      this.ensure(tabId)
      this.applyLayout()
    }
  }

  stop(tabId: string): void {
    const view = this.views.get(tabId)
    if (view && !view.webContents.isDestroyed()) view.webContents.stop()
  }

  focus(tabId: string): void {
    this.lastUsed.set(tabId, Date.now())
    const existing = this.views.get(tabId)
    if (existing && !existing.webContents.isDestroyed()) {
      existing.webContents.focus()
      return
    }
    const tab = this.host.tab(tabId)
    if (tab && !isHomeUrl(tab.url)) {
      const view = this.ensure(tabId)
      if (view) {
        this.applyLayout()
        view.webContents.focus()
      }
    }
  }

  async captureScroll(tabId: string): Promise<void> {
    const view = this.views.get(tabId)
    if (!view || view.webContents.isDestroyed()) return
    try {
      const y: unknown = await view.webContents.executeJavaScript('window.scrollY || 0', true)
      if (typeof y === 'number' && Number.isFinite(y) && y > 0) this.scrolls.set(tabId, y)
    } catch {
      /* page déjà partie */
    }
  }

  private restoreScroll(tabId: string, view: WebContentsView): void {
    const y = this.scrolls.get(tabId)
    if (!y) return
    this.scrolls.delete(tabId)
    void view.webContents.executeJavaScript(`window.scrollTo(0, ${Math.round(y)})`, true).catch(() => {})
  }

  /** Libère le processus d'un onglet sans perdre son url/titre (façon Zephium : charge au focus). */
  suspend(tabId: string): void {
    void this.captureScroll(tabId).finally(() => {
      const view = this.views.get(tabId)
      this.views.delete(tabId)
      this.visible.delete(tabId)
      const release = (): void => {
        if (!view) return
        this.byWebContents.delete(view.webContents.id)
        this.getWindow()?.contentView.removeChildView(view)
        if (!view.webContents.isDestroyed()) view.webContents.close()
        const runtime = this.runtimes.get(tabId)
        this.runtimes.set(tabId, { loading: false, error: runtime?.error ?? null })
        this.host.changed()
      }
      // La mémoire du processus est relevée juste avant de le fermer : c’est
      // l’estimation honnête du gain affiché dans l’interface.
      if (view && !view.webContents.isDestroyed()) {
        try {
          const pid = view.webContents.getOSProcessId()
          const metric = app.getAppMetrics().find((entry) => entry.pid === pid)
          this.freedMb += (metric?.memory?.workingSetSize ?? 0) / 1024
        } catch {
          /* métriques indisponibles : le gain reste inconnu, la veille s’applique */
        }
      }
      release()
    })
  }

  liveCount(): number {
    return this.views.size
  }

  liveIds(): Set<string> {
    const ids = new Set<string>()
    for (const [tabId, view] of this.views) {
      if (view && !view.webContents.isDestroyed()) ids.add(tabId)
    }
    return ids
  }

  scrollOf(_tabId: string): number | null {
    return null
  }

  private touch(tabId: string): void {
    this.lastUsed.set(tabId, Date.now())
  }

  private evictExcess(keep: Set<string>): void {
    while (this.views.size > MAX_LIVE_VIEWS) {
      let oldest: string | null = null
      let oldestAt = Number.POSITIVE_INFINITY
      for (const [tabId] of this.views) {
        if (keep.has(tabId)) continue
        const at = this.lastUsed.get(tabId) ?? 0
        if (at < oldestAt) {
          oldestAt = at
          oldest = tabId
        }
      }
      if (!oldest) break
      this.suspend(oldest)
    }
  }

  /** Décharge les vues invisibles inutilisées depuis plus de `maxAgeMs`. Appelé sur intervalle depuis Browser. */
  sweepInactive(keep: Set<string>, maxAgeMs: number = IDLE_DISCARD_MS): void {
    const now = Date.now()
    for (const [tabId] of this.views) {
      if (keep.has(tabId) || this.visible.has(tabId)) continue
      const at = this.lastUsed.get(tabId) ?? 0
      if (now - at > maxAgeMs) this.suspend(tabId)
    }
  }

  destroy(tabId: string): void {
    const view = this.views.get(tabId)
    this.views.delete(tabId)
    this.runtimes.delete(tabId)
    this.blocked.delete(tabId)
    this.lastUsed.delete(tabId)
    this.visible.delete(tabId)
    if (view) {
      this.byWebContents.delete(view.webContents.id)
      this.getWindow()?.contentView.removeChildView(view)
      if (!view.webContents.isDestroyed()) view.webContents.close()
    }
  }

  destroySpace(spaceId: string): void {
    for (const tab of this.host.tabsOfSpace(spaceId)) this.destroy(tab.id)
  }

  layout(request: LayoutRequest): void {
    this.panes = request.panes
    this.overlay = request.overlay
    this.applyLayout()
  }

  private applyLayout(): void {
    const visible = new Set<string>()
    if (!this.overlay) {
      for (const pane of this.panes) {
        if (pane.width < 8 || pane.height < 8) continue
        if (this.runtimeOf(pane.tabId).error) continue
        const view = this.ensure(pane.tabId)
        if (!view) continue
        view.setBounds({
          x: Math.round(pane.x),
          y: Math.round(pane.y),
          width: Math.round(pane.width),
          height: Math.round(pane.height)
        })
        view.setVisible(true)
        visible.add(pane.tabId)
        this.touch(pane.tabId)
      }
    }
    this.visible = visible
    for (const [tabId, view] of this.views) {
      if (!visible.has(tabId)) view.setVisible(false)
    }
    this.evictExcess(visible)
  }

  /** Texte sélectionné dans la page (capture de citation). */
  async selectionText(tabId: string): Promise<string> {
    const view = this.views.get(tabId)
    if (!view || view.webContents.isDestroyed()) return ''
    try {
      const text: unknown = await view.webContents.executeJavaScript(
        'String(window.getSelection ? window.getSelection().toString() : "")',
        true
      )
      return typeof text === 'string' ? text.trim().slice(0, 8000) : ''
    } catch {
      return ''
    }
  }

  /** Entoure la sélection courante d'un surlignage (API Highlight de Chromium). */
  async highlightSelection(tabId: string): Promise<boolean> {
    const view = this.views.get(tabId)
    if (!view || view.webContents.isDestroyed()) return false
    try {
      const painted: unknown = await view.webContents.executeJavaScript(
        `(() => {
          const selection = window.getSelection();
          if (!selection || selection.rangeCount === 0 || !selection.toString().trim()) return false;
          const styleId = '__vela_highlight_style';
          if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = '::highlight(vela-annotation){background-color: rgba(245,197,66,.55);color:inherit}';
            document.documentElement.appendChild(style);
          }
          if (!CSS.highlights) return false;
          const name = 'vela-annotation';
          const existing = CSS.highlights.get(name) || new Highlight();
          existing.add(selection.getRangeAt(0));
          CSS.highlights.set(name, existing);
          return true;
        })()`,
        true
      )
      return painted === true
    } catch {
      return false
    }
  }

  /** Repeint les passages déjà surlignés sur cette page. */
  async paintHighlights(tabId: string, texts: string[]): Promise<number> {
    const view = this.views.get(tabId)
    if (!view || view.webContents.isDestroyed() || texts.length === 0) return 0
    const payload = JSON.stringify(texts.map((text) => text.split('\n')[0].slice(0, 160)))
    try {
      const painted: unknown = await view.webContents.executeJavaScript(
        `(() => {
          const saved = ${payload};
          if (!CSS.highlights) return 0;
          const styleId = '__vela_highlight_style';
          if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = '::highlight(vela-annotation){background-color: rgba(245,197,66,.55);color:inherit}';
            document.documentElement.appendChild(style);
          }
          const body = document.body;
          if (!body) return 0;
          const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
          const nodes = [];
          const starts = [];
          let full = '';
          let node;
          while ((node = walker.nextNode())) {
            if (node.parentElement?.closest('script,style,noscript,svg,[hidden],[aria-hidden="true"]')) continue;
            nodes.push(node);
            starts.push(full.length);
            full += node.textContent || '';
          }
          const locate = (offset) => {
            for (let i = nodes.length - 1; i >= 0; i -= 1) {
              if (offset >= starts[i]) return { node: nodes[i], offset: offset - starts[i] };
            }
            return null;
          };
          const ranges = [];
          for (const text of saved) {
            const index = full.indexOf(text);
            if (index === -1) continue;
            const start = locate(index);
            const end = locate(index + text.length);
            if (!start || !end) continue;
            try {
              const range = document.createRange();
              range.setStart(start.node, start.offset);
              range.setEnd(end.node, end.offset);
              ranges.push(range);
            } catch {
              /* plage invalide : passage ignoré */
            }
          }
          if (ranges.length === 0) return 0;
          CSS.highlights.set('vela-annotation', new Highlight(...ranges));
          return ranges.length;
        })()`,
        true
      )
      return typeof painted === 'number' ? painted : 0
    } catch {
      return 0
    }
  }

  /** Identifie l'onglet qui porte ce webContents (glisser-déposer depuis la page). */
  tabIdForWebContents(id: number): string | null {
    for (const [tabId, view] of this.views) {
      if (!view.webContents.isDestroyed() && view.webContents.id === id) return tabId
    }
    return null
  }

  async excerpt(tabId: string): Promise<{ text: string; anchor: string }> {
    const view = this.views.get(tabId)
    if (!view || view.webContents.isDestroyed()) return { text: '', anchor: '' }
    try {
      const result: unknown = await view.webContents.executeJavaScript(
        `(() => {
          const body = document.body;
          if (!body) return { text: '', anchor: '' };
          const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
          let total = 0;
          let text = '';
          let anchor = '';
          let node;
          while ((node = walker.nextNode()) && total < 6000) {
            const parent = node.parentElement;
            if (!node.textContent?.trim() || !parent || parent.closest('script,style,noscript,svg,[hidden],[aria-hidden="true"]')) continue;
            const style = getComputedStyle(parent);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            const chunk = node.textContent.slice(0, 6000 - total);
            text += chunk + ' ';
            total += chunk.length;
            if (!anchor && chunk.trim().length >= 40) {
              const quote = chunk.trim().slice(0, 120).trim();
              anchor = quote ? '#:~:text=' + encodeURIComponent(quote) : '';
            }
          }
          return { text: text.trim(), anchor };
        })()`,
        true
      )
      if (!result || typeof result !== 'object') return { text: '', anchor: '' }
      const excerpt = result as { text?: unknown; anchor?: unknown }
      return {
        text: typeof excerpt.text === 'string' ? excerpt.text.slice(0, 6000) : '',
        anchor: typeof excerpt.anchor === 'string' ? excerpt.anchor : ''
      }
    } catch {
      return { text: '', anchor: '' }
    }
  }

  /** Raccourcis interceptés dans les pages comme dans la coque. */
  handleInput(event: ElectronEvent, input: Input): void {
    if (input.type !== 'keyDown') return
    const mod = process.platform === 'darwin' ? input.meta : input.control
    if (input.key === 'Escape' && !mod) {
      const current = this.panes[0]?.tabId
      if (current && this.runtimeOf(current).loading) this.stop(current)
      return
    }
    if (!mod || input.alt) return
    const key = input.key.toLowerCase()
    // Zoom du texte : ⌘+ / ⌘- / ⌘0 (le « + » arrive souvent comme « = »).
    if (input.key === '+' || input.key === '=') {
      event.preventDefault()
      this.host.shortcut({ action: 'zoom-in' })
      return
    }
    if (input.key === '-' || input.key === '–') {
      event.preventDefault()
      this.host.shortcut({ action: 'zoom-out' })
      return
    }
    if (input.key === '0') {
      event.preventDefault()
      this.host.shortcut({ action: 'zoom-reset' })
      return
    }
    if (key === 'f' && !input.shift) {
      event.preventDefault()
      this.host.shortcut({ action: 'find' })
      return
    }
    if (input.shift && key === 'g') {
      event.preventDefault()
      this.host.shortcut({ action: 'find-prev' })
      return
    }
    let action: ShortcutAction | null = null
    let digit: number | undefined

    if (!input.shift) {
      const map: Record<string, ShortcutAction> = {
        k: 'command',
        l: 'address',
        t: 'new-tab',
        w: 'close-tab',
        e: 'notes',
        j: 'agent',
        ',': 'settings',
        s: 'sidebar',
        r: 'reload',
        p: 'print',
        y: 'history',
        d: 'bookmark',
        '[': 'back',
        ']': 'forward'
      }
      action = map[key] ?? null
      if (/^[1-9]$/.test(key)) {
        action = 'tab-select'
        digit = Number(key)
      }
    } else if (key === 't') {
      action = 'reopen-tab'
    } else if (key === 'd') {
      action = 'split'
    } else if (key === 'b') {
      action = 'brief'
    } else if (key === 'a') {
      action = 'work'
    } else if (key === 'o') {
      action = 'bookmarks'
    } else if (key === 'h') {
      action = 'home'
    } else if (key === 'n') {
      action = 'mini'
    }

    if (!action) return
    event.preventDefault()
    this.host.shortcut(digit ? { action, digit } : { action })
  }
}
