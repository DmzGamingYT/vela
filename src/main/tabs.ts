import { join } from 'node:path'
import { BrowserWindow, nativeTheme, WebContentsView, type Event as ElectronEvent, type Input, type Session } from 'electron'
import { HOME_URL } from '@shared/types'
import type {
  LayoutRequest,
  PaneRect,
  Settings,
  ShortcutAction,
  ShortcutEvent,
  Space,
  TabState
} from '@shared/types'
import { shouldOpenAsPopup } from '@shared/navigation'
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
  createTab(spaceId: string, url: string): string
  tabsOfSpace(spaceId: string): TabState[]
  shortcut(event: ShortcutEvent): void
  settings(): Settings
  visited(spaceId: string, url: string, title: string): void
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
}

const MAX_LIVE_VIEWS = 5
const IDLE_DISCARD_MS = 5 * 60_000

export class TabManager {
  private views = new Map<string, WebContentsView>()
  private runtimes = new Map<string, Runtime>()
  private blocked = new Map<string, number>()
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
    return {
      loading: runtime?.loading ?? false,
      canGoBack: alive ? view!.webContents.navigationHistory.canGoBack() : false,
      canGoForward: alive ? view!.webContents.navigationHistory.canGoForward() : false,
      blocked: this.blocked.get(tabId) ?? 0,
      agentSent: Boolean(runtime?.agentSent),
      error: runtime?.error ?? null
    }
  }

  blockedTotal(): number {
    let total = 0
    for (const count of this.blocked.values()) total += count
    return total
  }

  private scrolls = new Map<string, number>()

  private backgroundForPages(): string {
    const theme = this.host.settings().theme
    const dark = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors)
    return dark ? '#09090b' : '#ffffff'
  }

  private sessionFor(space: Space) {
    const ses = prepareSession(space.partition)
    try {
      this.host.trackSession?.(ses, space.partition)
    } catch {
      /* suivi téléchargements optionnel */
    }
    attachPrivacy(
      ses,
      () => this.host.settings().blockTrackers,
      (webContentsId) => {
        const tabId = this.byWebContents.get(webContentsId)
        if (!tabId) return
        this.blocked.set(tabId, (this.blocked.get(tabId) ?? 0) + 1)
        this.host.changed()
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
      // Popups (window.open, OAuth « Se connecter avec Google »…) : vraie
      // fenêtre avec opener intact, héritant la session de l'espace.
      if (shouldOpenAsPopup(details.disposition)) {
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
      this.host.createTab(tab.spaceId, details.url)
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

    wc.on('did-navigate', (_event, url) => {
      this.record(tabId, url)
      this.host.changed()
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
    const target = normalizeInput(input, this.host.settings().searchEngine)
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
    if (view) {
      this.byWebContents.delete(view.webContents.id)
      this.getWindow()?.contentView.removeChildView(view)
      if (!view.webContents.isDestroyed()) view.webContents.close()
    }
    const runtime = this.runtimes.get(tabId)
    this.runtimes.set(tabId, { loading: false, error: runtime?.error ?? null })
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
    }

    if (!action) return
    event.preventDefault()
    this.host.shortcut(digit ? { action, digit } : { action })
  }
}
