import { join } from 'node:path'
import {
  BrowserWindow,
  Menu,
  screen,
  WebContentsView,
  type Event as ElectronEvent,
  type Input,
  type MenuItemConstructorOptions,
  type Session
} from 'electron'
import type { MiniState, Settings, Space } from '@shared/types'
import {
  MINI_CHROME_HEIGHT,
  MINI_HEIGHT,
  MINI_MIN_HEIGHT,
  MINI_MIN_WIDTH,
  MINI_WIDTH,
  miniKeyAction,
  placeMiniWindow
} from '@shared/mini'
import { opensMiniWindow } from '@shared/navigation'
import { hostOf, isHomeUrl, normalizeInput, titleFromUrl } from '@shared/url'
import { applyBrowserIdentity } from './identity'

/** Barre compacte : c'est le renderer de Vela, dans sa variante « mini ». */
const CHROME_PRELOAD = join(__dirname, '../preload/index.js')
const PAGE_PRELOAD = join(__dirname, '../preload/page.js')

/**
 * Ce que la petite fenêtre demande à Vela. Elle ne connaît ni le magasin ni les
 * onglets : elle emprunte tout à l'appelant.
 */
export interface MiniHost {
  /** Fenêtre principale : la petite s'ouvre à côté d'elle. */
  parent(): BrowserWindow | null
  space(id?: string): Space | undefined
  sessionFor(space: Space): Session
  pageBackground(): string
  visited(spaceId: string, url: string, title: string): void
  /** Installe une page dans un vrai onglet de la fenêtre principale. */
  openTab(spaceId: string, url: string, background?: boolean): void
  focusMain(): void
  settings(): Settings
}

function emptyState(): MiniState {
  return {
    url: '',
    title: '',
    host: '',
    loading: false,
    canGoBack: false,
    canGoForward: false,
    error: null,
    spaceId: '',
    spaceName: '',
    spaceColor: ''
  }
}

/**
 * Fenêtre réduite, jetable, pour regarder une page sans créer d'onglet.
 *
 * Elle emprunte la session de l'espace qui l'ouvre : mêmes cookies, même
 * filtre de traqueurs, même identité annoncée aux sites. Fermer suffit à s'en
 * débarrasser — rien n'entre dans la liste des onglets — mais la visite reste
 * dans l'historique de l'espace, comme n'importe quelle page ouverte.
 */
export class MiniWindow {
  private win: BrowserWindow | null = null
  private view: WebContentsView | null = null
  private spaceId = ''
  private state: MiniState = emptyState()
  /** La barre n'écoute qu'à partir de son montage : sinon les messages se perdent. */
  private chromeReady = false
  /** Focus à donner à la barre d'adresse dès qu'elle est prête. */
  private addressPending = false

  constructor(private host: MiniHost) {}

  current(): MiniState {
    return this.state
  }

  /** Ouvre la petite fenêtre, ou recharge celle qui existe déjà. */
  open(input: { url?: string; spaceId?: string } = {}): boolean {
    const space = this.host.space(input.spaceId) ?? this.host.space()
    if (!space) return false
    this.spaceId = space.id
    const win = this.ensure(space)
    if (!win) return false

    this.state = { ...this.state, spaceId: space.id, spaceName: space.name, spaceColor: space.color }
    this.addressPending = true
    win.show()
    win.focus()

    const target = (input.url ?? '').trim()
    if (target) this.load(this.resolve(target))
    else this.deliver()
    return true
  }

  /** La barre annonce qu'elle écoute : elle reçoit l'état, puis le focus demandé. */
  ready(): void {
    this.chromeReady = true
    this.deliver()
  }

  close(): void {
    const win = this.win
    if (!win || win.isDestroyed()) return
    win.close()
  }

  navigate(input: string): void {
    const clean = input.trim()
    if (clean) this.load(this.resolve(clean))
  }

  back(): void {
    const wc = this.page()
    if (wc && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
  }

  forward(): void {
    const wc = this.page()
    if (wc && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
  }

  reload(): void {
    const wc = this.page()
    if (wc) wc.reload()
  }

  stop(): void {
    const wc = this.page()
    if (wc) wc.stop()
  }

  /** Décharge la page dans un vrai onglet, puis referme la petite fenêtre. */
  openInTab(): boolean {
    const url = this.state.url
    if (!/^https?:/i.test(url)) return false
    this.host.openTab(this.spaceId, url)
    this.close()
    this.host.focusMain()
    return true
  }

  /** Adresse ou recherche : la règle est celle de la barre d'adresse principale. */
  private resolve(input: string): string {
    const settings = this.host.settings()
    const target = normalizeInput(input, settings.searchEngine, settings.searxInstance)
    return isHomeUrl(target.url) ? '' : target.url
  }

  private page(): Electron.WebContents | null {
    const wc = this.view?.webContents
    return wc && !wc.isDestroyed() ? wc : null
  }

  private ensure(space: Space): BrowserWindow | null {
    if (this.win && !this.win.isDestroyed()) return this.win
    // La fenêtre précédente peut être détruite sans que son événement « closed »
    // soit encore passé : on libère sa page ici, sinon elle survivrait à côté.
    if (this.win) this.release()
    const parent = this.host.parent()
    const alive = parent && !parent.isDestroyed() ? parent : null
    const display = alive ? screen.getDisplayMatching(alive.getBounds()) : screen.getPrimaryDisplay()
    // Comme Little Arc : au milieu de l'écran, pas collée au bord de Vela.
    const bounds = placeMiniWindow({
      workArea: display.workArea,
      width: MINI_WIDTH,
      height: MINI_HEIGHT
    })

    const win = new BrowserWindow({
      ...bounds,
      show: false,
      title: 'Mini navigateur',
      minimizable: true,
      maximizable: false,
      fullscreenable: false,
      minWidth: MINI_MIN_WIDTH,
      minHeight: MINI_MIN_HEIGHT,
      backgroundColor: this.host.pageBackground(),
      // Sur macOS les feux de circulation restent : la barre compacte se
      // contente de leur laisser la place. Ailleurs, la fenêtre n'a pas de
      // cadre du tout et c'est notre bouton Fermer qui la referme.
      ...(process.platform === 'darwin'
        ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 15 } }
        : { frame: false }),
      webPreferences: {
        preload: CHROME_PRELOAD,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false
      }
    })
    this.win = win
    this.chromeReady = false
    // `app.on('web-contents-created')` traite toute fenêtre comme un site : il
    // vient d'appliquer l'identité Chrome à notre propre barre et d'y brancher
    // un débogueur. La barre n'est pas un site, on retire le débogueur.
    try {
      if (win.webContents.debugger.isAttached()) win.webContents.debugger.detach()
    } catch {
      /* déjà détaché */
    }
    win.webContents.on('before-input-event', (event, input) => this.keys(event, input, false))
    win.on('resize', () => this.fit())
    win.on('closed', () => {
      // Une fermeture tardive ne doit pas démonter la fenêtre qui l'a remplacée.
      if (this.win === win) this.release()
    })
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) this.host.openTab(this.spaceId, url)
      return { action: 'deny' }
    })

    const dev = process.env['ELECTRON_RENDERER_URL']
    if (dev) void win.loadURL(`${dev}?mini=1`)
    else void win.loadFile(join(__dirname, '../renderer/index.html'), { query: { mini: '1' } })

    this.createPage(space)
    return win
  }

  private createPage(space: Space): void {
    const win = this.win
    if (!win) return
    const view = new WebContentsView({
      webPreferences: {
        session: this.host.sessionFor(space),
        preload: PAGE_PRELOAD,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false,
        backgroundThrottling: true
      }
    })
    view.setBackgroundColor(this.host.pageBackground())
    view.setVisible(false)
    win.contentView.addChildView(view)
    this.view = view

    const wc = view.webContents
    applyBrowserIdentity(wc)
    wc.on('before-input-event', (event, input) => this.keys(event, input, true))
    wc.setWindowOpenHandler((details) => {
      // La petite fenêtre ne grandit pas : un geste de lien la recharge
      // elle-même, ⌘ + clic part en onglet sans voler le focus, et une popup
      // de site (fenêtre OAuth) s'ouvre dans un vrai onglet.
      if (!/^https?:/i.test(details.url)) return { action: 'deny' }
      if (opensMiniWindow(details.disposition, details.features)) {
        this.load(details.url)
        return { action: 'deny' }
      }
      this.host.openTab(this.spaceId, details.url, details.disposition === 'background-tab')
      return { action: 'deny' }
    })
    wc.on('context-menu', (_event, params) => this.menu(params))
    wc.on('did-start-loading', () => this.sync({ loading: true, error: null }))
    wc.on('did-stop-loading', () => this.sync({ loading: false }))
    wc.on('page-title-updated', () => this.sync())
    wc.on('did-navigate', (_event, url, status) => {
      if (status !== 200 && status !== 304 && status !== 0) return
      this.sync()
      this.record(url)
    })
    wc.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (!isMainFrame) return
      this.sync()
      this.record(url)
    })
    wc.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
      if (!isMainFrame || code === -3 || isHomeUrl(url)) return
      this.sync({ loading: false, error: description || 'Chargement impossible' })
    })
    wc.on('render-process-gone', (_event, details) => {
      this.sync({ loading: false, error: details.reason === 'clean-exit' ? null : 'La page a cessé de répondre.' })
    })
  }

  private menu(params: Electron.ContextMenuParams): void {
    const items: MenuItemConstructorOptions[] = []
    if (params.linkURL && /^https?:/i.test(params.linkURL)) {
      items.push({
        label: 'Ouvrir le lien dans un onglet',
        click: () => this.host.openTab(this.spaceId, params.linkURL)
      })
      items.push({ type: 'separator' })
    }
    if (params.selectionText.trim()) items.push({ role: 'copy', label: 'Copier' })
    if (params.isEditable) {
      items.push(
        { role: 'cut', label: 'Couper' },
        { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout sélectionner' }
      )
    }
    if (items.length === 0) return
    Menu.buildFromTemplate(items).popup({ window: this.win ?? undefined })
  }

  private load(url: string): void {
    if (!url) {
      this.deliver()
      return
    }
    const view = this.view
    const wc = this.page()
    if (!view || !wc) return
    this.state = { ...this.state, url, host: hostOf(url), title: titleFromUrl(url), loading: true, error: null }
    this.fit()
    view.setVisible(true)
    void wc.loadURL(url).catch(() => {
      /* did-fail-load remonte déjà l'erreur */
    })
    this.publish()
    this.deliver()
  }

  private record(url: string): void {
    if (!/^https?:/i.test(url) || !this.spaceId) return
    const title = this.page()?.getTitle() || titleFromUrl(url)
    this.host.visited(this.spaceId, url, title)
  }

  /** Position de la page : sous la barre compacte, jamais dessous. */
  private fit(): void {
    const win = this.win
    const view = this.view
    if (!win || !view || win.isDestroyed()) return
    const [width, height] = win.getContentSize()
    view.setBounds({
      x: 0,
      y: MINI_CHROME_HEIGHT,
      width,
      height: Math.max(0, height - MINI_CHROME_HEIGHT)
    })
  }

  private sync(over: Partial<MiniState> = {}): void {
    const wc = this.page()
    const url = wc ? wc.getURL() : this.state.url
    this.state = {
      ...this.state,
      url,
      title: wc ? wc.getTitle() || titleFromUrl(url) : this.state.title,
      loading: wc ? wc.isLoading() : false,
      canGoBack: wc ? wc.navigationHistory.canGoBack() : false,
      canGoForward: wc ? wc.navigationHistory.canGoForward() : false,
      ...over
    }
    this.state.host = hostOf(this.state.url)
    if (this.state.title) this.win?.setTitle(this.state.title)
    this.publish()
  }

  private publish(): void {
    const win = this.win
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return
    win.webContents.send('mini:state', this.state)
  }

  private deliver(): void {
    if (!this.chromeReady) return
    this.publish()
    if (this.addressPending) {
      this.addressPending = false
      const win = this.win
      if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('mini:focus-address')
    }
  }

  private keys(event: ElectronEvent, input: Input, fromPage: boolean): void {
    const action = miniKeyAction(
      {
        type: input.type,
        key: input.key,
        meta: input.meta,
        control: input.control,
        shift: input.shift,
        alt: input.alt
      },
      process.platform === 'darwin'
    )
    if (!action) return
    // Échap venu de la page : elle peut s'en servir (sortie du plein écran,
    // fenêtre de dialogue). On ne referme que si elle ne l'a pas consommé.
    if (action === 'close' && fromPage && input.key === 'Escape') {
      void this.closeUnlessFullscreen()
      return
    }
    event.preventDefault()
    switch (action) {
      case 'close':
        this.close()
        break
      case 'address': {
        const win = this.win
        if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('mini:focus-address')
        break
      }
      case 'reload':
        this.reload()
        break
      case 'back':
        this.back()
        break
      case 'forward':
        this.forward()
        break
      case 'zoom-in':
      case 'zoom-out':
      case 'zoom-reset': {
        const wc = this.page()
        if (!wc) break
        const current = wc.getZoomLevel()
        const next = action === 'zoom-reset' ? 0 : current + (action === 'zoom-in' ? 0.5 : -0.5)
        wc.setZoomLevel(Math.min(4, Math.max(-3, next)))
        break
      }
    }
  }

  private async closeUnlessFullscreen(): Promise<void> {
    const wc = this.page()
    if (wc) {
      try {
        const full: unknown = await wc.executeJavaScript('Boolean(document.fullscreenElement)', true)
        if (full === true) return
      } catch {
        /* page inaccessible : on referme quand même */
      }
    }
    this.close()
  }

  /** Referme la page et remet l'objet à neuf ; la fenêtre, elle, est déjà partie. */
  private release(): void {
    const win = this.win
    const view = this.view
    this.win = null
    this.view = null
    this.chromeReady = false
    this.addressPending = false
    this.spaceId = ''
    this.state = emptyState()
    if (view) {
      if (win && !win.isDestroyed()) win.contentView.removeChildView(view)
      if (!view.webContents.isDestroyed()) view.webContents.close()
    }
  }
}
