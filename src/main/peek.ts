import { join } from 'node:path'
import {
  BrowserWindow,
  Menu,
  WebContentsView,
  clipboard,
  type ContextMenuParams,
  type Event as ElectronEvent,
  type Input,
  type MenuItemConstructorOptions,
  type Session,
  type WebContents
} from 'electron'
import type { PeekState, Rect, Settings, Space } from '@shared/types'
import { peekKeyAction } from '@shared/peek'
import { opensPeek, searchOptionsOf, shouldOpenAsPopup } from '@shared/navigation'
import { hostOf, isHomeUrl, normalizeInput, titleFromUrl } from '@shared/url'
import { applyBrowserIdentity } from './identity'

/** La page du coup d'œil est une vue native : le même preload qu'un onglet. */
const PAGE_PRELOAD = join(__dirname, '../preload/page.js')

/**
 * Ce que le coup d'œil demande à Vela. Il ne connaît ni le magasin ni la liste
 * d'onglets : la carte vit dans le renderer de la coque, la page emprunte tout
 * à l'appelant.
 */
export interface PeekHost {
  /** Fenêtre principale : la carte s'affiche dedans. */
  parent(): BrowserWindow | null
  space(id?: string): Space | undefined
  sessionFor(space: Space): Session
  pageBackground(): string
  visited(spaceId: string, url: string, title: string): void
  /** Installe une page dans un vrai onglet ; renvoie son identifiant. */
  openTab(spaceId: string, url: string, background?: boolean): string
  /** Pose l'onglet dans le second volet. */
  splitTab(id: string): void
  focusMain(): void
  settings(): Settings
}

/** Un lien ouvert en arrière-plan ne vole pas le focus à la carte. */
function openInBackground(disposition: string): boolean {
  return disposition === 'background-tab'
}

function emptyState(space: Space): PeekState {
  return {
    url: '',
    title: '',
    host: '',
    loading: false,
    canGoBack: false,
    canGoForward: false,
    error: null,
    spaceId: space.id,
    spaceName: space.name,
    spaceColor: space.color
  }
}

/**
 * Coup d'œil : une page regardée sans quitter Vela et sans créer d'onglet.
 *
 * La carte, son fond et ses actions appartiennent au renderer de la coque ;
 * ici, on ne gère que la vue native de la page — sa session, sa navigation,
 * ses raccourcis — et on la cale sur le rectangle que la carte mesure.
 * Fermer démonte la vue : rien ne reste en mémoire.
 */
export class Peek {
  private view: WebContentsView | null = null
  private owner: BrowserWindow | null = null
  private spaceId = ''
  private state: PeekState | null = null
  private rect: Rect | null = null
  private addressPending = false

  constructor(private host: PeekHost) {}

  current(): PeekState | null {
    return this.state
  }

  /** Ouvre le coup d'œil, ou recharge celui qui est déjà affiché. */
  open(input: { url?: string; spaceId?: string } = {}): boolean {
    const space = this.host.space(input.spaceId) ?? this.host.space()
    if (!space) return false
    // Une autre session (autre espace) ne peut pas réutiliser la vue en place.
    if (this.view && this.spaceId !== space.id) this.release()
    this.spaceId = space.id
    if (!this.ensure(space)) return false

    this.state = emptyState(space)
    const target = (input.url ?? '').trim()
    if (target) this.load(this.resolve(target))
    else {
      this.place()
      this.publish()
      this.addressPending = true
      this.deliverFocus()
    }
    return true
  }

  /** La carte est montée : elle peut recevoir l'état et la demande de focus. */
  ready(): void {
    this.publish()
    this.deliverFocus()
  }

  close(): void {
    this.state = null
    this.addressPending = false
    // Rien ne reste en mémoire : la page est démontée avec la carte.
    this.release()
    this.publish()
    this.host.focusMain()
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

  /** Décharge la page dans un vrai onglet, puis referme le coup d'œil. */
  openInTab(): boolean {
    const url = this.state?.url ?? ''
    if (!/^https?:/i.test(url)) return false
    this.host.openTab(this.spaceId, url)
    this.close()
    return true
  }

  /** Ouvre la page dans un onglet posé en second volet. */
  openInSplit(): boolean {
    const url = this.state?.url ?? ''
    if (!/^https?:/i.test(url)) return false
    const id = this.host.openTab(this.spaceId, url, true)
    if (id) this.host.splitTab(id)
    this.close()
    return true
  }

  /** Rectangle de la carte, en pixels CSS de la fenêtre. */
  layout(payload: unknown): void {
    const input = (payload ?? {}) as Partial<Rect>
    const numbers = [input.x, input.y, input.width, input.height]
    this.rect =
      numbers.every((value) => typeof value === 'number' && Number.isFinite(value)) &&
      (input.width ?? 0) > 0 &&
      (input.height ?? 0) > 0
        ? {
            x: Math.round(input.x as number),
            y: Math.round(input.y as number),
            width: Math.round(input.width as number),
            height: Math.round(input.height as number)
          }
        : null
    this.place()
  }

  private resolve(input: string): string {
    const target = normalizeInput(input, searchOptionsOf(this.host.settings()))
    return isHomeUrl(target.url) ? '' : target.url
  }

  private page(): WebContents | null {
    const wc = this.view?.webContents
    return wc && !wc.isDestroyed() ? wc : null
  }

  private ensure(space: Space): boolean {
    const parent = this.host.parent()
    if (!parent || parent.isDestroyed()) return false
    if (this.view && this.owner === parent) return true
    // Fenêtre recréée (ou première ouverture) : la vue précédente appartient
    // à une scène disparue, on la libère avant d'en poser une nouvelle.
    this.release()

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
    parent.contentView.addChildView(view)
    this.view = view
    this.owner = parent
    parent.once('closed', () => {
      if (this.owner === parent) this.release()
    })

    const wc = view.webContents
    applyBrowserIdentity(wc)
    wc.on('before-input-event', (event, input) => this.keys(event, input))
    wc.setWindowOpenHandler((details) => {
      if (!/^https?:/i.test(details.url)) return { action: 'deny' }
      // Une vraie popup de site (OAuth « Se connecter avec Google »…) garde
      // sa fenêtre, fille de la fenêtre principale ; tout le reste ouvre un
      // onglet plutôt qu'une énième carte.
      if (shouldOpenAsPopup(details.disposition, details.features)) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            parent: this.host.parent() ?? undefined,
            autoHideMenuBar: true
          }
        }
      }
      this.host.openTab(this.spaceId, details.url, openInBackground(details.disposition))
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
    return true
  }

  private menu(params: ContextMenuParams): void {
    const items: MenuItemConstructorOptions[] = []
    if (params.linkURL && /^https?:/i.test(params.linkURL) && !opensPeek(params.linkURL, '')) {
      items.push({
        label: 'Ouvrir le lien dans un onglet',
        click: () => this.host.openTab(this.spaceId, params.linkURL)
      })
      items.push({
        label: 'Ouvrir le lien dans la vue scindée',
        click: () => {
          const id = this.host.openTab(this.spaceId, params.linkURL, true)
          if (id) this.host.splitTab(id)
          this.close()
        }
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
    if (!params.linkURL && !params.selectionText.trim() && !params.isEditable && this.state?.url) {
      items.push(
        { label: 'Ouvrir dans un onglet', click: () => void this.openInTab() },
        { label: 'Copier l’adresse de la page', click: () => this.copy(this.state?.url ?? '') },
        { label: 'Recharger', click: () => this.reload() }
      )
    }
    if (items.length === 0) return
    const win = this.host.parent()
    Menu.buildFromTemplate(items).popup({ window: win ?? undefined })
  }

  private copy(text: string): void {
    clipboard.writeText(text)
  }

  private load(url: string): void {
    if (!url) {
      this.place()
      this.publish()
      return
    }
    const wc = this.page()
    if (!wc) return
    if (!this.state) return
    this.state = { ...this.state, url, host: hostOf(url), title: titleFromUrl(url), loading: true, error: null }
    this.place()
    void wc.loadURL(url).catch(() => {
      /* did-fail-load remonte déjà l'erreur */
    })
    this.publish()
  }

  private record(url: string): void {
    if (!/^https?:/i.test(url) || !this.spaceId) return
    const title = this.page()?.getTitle() || titleFromUrl(url)
    this.host.visited(this.spaceId, url, title)
  }

  /** Cale la vue sur la carte ; sans adresse ou sans mesure, elle s'efface. */
  private place(): void {
    const win = this.host.parent()
    const view = this.view
    if (!win || win.isDestroyed() || !view) return
    const rect = this.rect
    const url = this.state?.url ?? ''
    if (!url || !rect) {
      view.setVisible(false)
      return
    }
    const [width, height] = win.getContentSize()
    view.setBounds({
      x: Math.max(0, Math.min(rect.x, width)),
      y: Math.max(0, Math.min(rect.y, height)),
      width: Math.max(0, Math.min(rect.width, width - rect.x)),
      height: Math.max(0, Math.min(rect.height, height - rect.y))
    })
    view.setVisible(true)
  }

  private sync(over: Partial<PeekState> = {}): void {
    if (!this.state) return
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
    this.publish()
  }

  private publish(): void {
    const win = this.host.parent()
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return
    win.webContents.send('peek:state', this.state)
  }

  private deliverFocus(): void {
    if (!this.addressPending) return
    this.addressPending = false
    const win = this.host.parent()
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('peek:focus-address')
  }

  private keys(event: ElectronEvent, input: Input): void {
    const action = peekKeyAction(
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
    // Échap venu de la page : elle peut s'en servir (plein écran, dialogue).
    if (action === 'close' && input.key === 'Escape') {
      void this.closeUnlessFullscreen()
      return
    }
    event.preventDefault()
    switch (action) {
      case 'close':
        this.close()
        break
      case 'address': {
        this.addressPending = true
        this.deliverFocus()
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

  /** Referme la page et remet l'objet à neuf. */
  private release(): void {
    const view = this.view
    const owner = this.owner
    this.view = null
    this.owner = null
    this.spaceId = ''
    if (!view) return
    if (owner && !owner.isDestroyed()) owner.contentView.removeChildView(view)
    if (!view.webContents.isDestroyed()) view.webContents.close()
  }
}
