import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  Menu,
  nativeImage,
  nativeTheme,
  session,
  shell,
  Tray
} from 'electron'
import { appendFileSync, existsSync, statSync, writeFileSync } from 'node:fs'
import { Browser } from './browser'
import { installMenu } from './menu'
import { initUpdater } from './updater'
import { CHROME_UA, applyBrowserIdentity, applySessionIdentity } from './identity'

// Le nom du produit est fixé avant toute autre chose : `app.name` alimente le
// premier menu macOS, la fenêtre « À propos » et les dossiers de données. Sans
// cela, la barre de menus affiche « Electron » en développement (le paquet,
// lui, prend CFBundleName = Vela grâce à electron-builder).
app.setName('Vela')
if (process.platform === 'darwin') {
  app.setAboutPanelOptions({
    applicationName: 'Vela',
    applicationVersion: app.getVersion(),
    version: app.getVersion(),
    copyright: 'Vela — navigateur de travail. MIT.'
  })
}
// En développement, le Dock et le menu prennent l'icône et le nom d'Electron :
// on remet l'identité Vela (le paquet signé utilise déjà build/icon.icns).
if (!app.isPackaged && process.platform === 'darwin') {
  const icon = join(__dirname, '../../build/icon-1024.png')
  if (existsSync(icon)) app.dock?.setIcon(icon)
}
// Identité par défaut de tout le processus : favicons, préconnexions et
// service workers n'ont pas de page à qui emprunter un User-Agent propre.
app.userAgentFallback = CHROME_UA
if (process.env.VELA_USER_DATA) app.setPath('userData', process.env.VELA_USER_DATA)

/**
 * Filet de sécurité : une exception isolée ne doit plus emporter la fenêtre et
 * tous les onglets (c'était le cas quand `prepareSession` recevait une
 * partition vide). L'erreur est journalisée dans le dossier de données et
 * l'application continue ; le journal reste petit.
 */
function journalFault(kind: string, fault: unknown): void {
  const message =
    fault instanceof Error ? `${fault.stack || fault.message}` : typeof fault === 'string' ? fault : JSON.stringify(fault)
  console.error(`[vela] ${kind} — ${message}`)
  try {
    const file = join(app.getPath('userData'), 'vela-errors.log')
    const line = `[${new Date().toISOString()}] ${kind} — ${String(message).slice(0, 4000)}\n`
    if (existsSync(file) && statSync(file).size > 256 * 1024) writeFileSync(file, '')
    appendFileSync(file, line, 'utf8')
  } catch {
    /* dossier non inscriptible : la console suffit */
  }
}

process.on('uncaughtException', (error) => journalFault('exception', error))
process.on('unhandledRejection', (reason) => journalFault('promesse rejetée', reason))

let browser: Browser | null = null
let win: BrowserWindow | null = null

/** Autorise uniquement l'origine Vite en développement ou le HTML empaqueté exact. */
function isAllowedShellNavigation(url: string): boolean {
  try {
    const target = new URL(url)
    const dev = process.env['ELECTRON_RENDERER_URL']
    if (dev) {
      const expected = new URL(dev)
      return (
        (expected.protocol === 'http:' || expected.protocol === 'https:') &&
        target.origin === expected.origin &&
        target.pathname === expected.pathname &&
        target.username === '' &&
        target.password === ''
      )
    }

    const rendererFile = resolve(join(__dirname, '../renderer/index.html'))
    return (
      target.protocol === 'file:' &&
      target.host === '' &&
      fileURLToPath(target) === rendererFile &&
      target.search === '' &&
      target.hash === '' &&
      pathToFileURL(rendererFile).protocol === target.protocol
    )
  } catch {
    return false
  }
}

function createWindow(): void {
  const store = browser!.store
  const settings = store.get().settings
  nativeTheme.themeSource = settings.theme
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && nativeTheme.shouldUseDarkColors)

  win = new BrowserWindow({
    width: 1380,
    height: 880,
    center: true,
    minWidth: 980,
    minHeight: 620,
    show: false,
    title: 'Vela',
    backgroundColor: dark ? '#151518' : '#faf8f5',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 20, y: 21 },
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Chromium télécharge ses dictionnaires de correction depuis un CDN
      // Google dès qu'un champ est corrigible. Les onglets sont déjà à false :
      // on garde zéro téléchargement caché, quitte à perdre le soulignement.
      spellcheck: false
    }
  })

  const shellWindow = win
  browser!.attach(win)
  browser!.registerIpc()
  installMenu((action) => browser?.sendShortcut(action))

  shellWindow.once('ready-to-show', () => shellWindow.show())
  // Comparaison avec la fenêtre courante : sinon la fermeture de l'ancienne
  // châssis (après un plantage du renderer) effaçait la nouvelle.
  shellWindow.on('closed', () => {
    if (win === shellWindow) win = null
  })

  // Le châssis est notre interface : si son processus meurt (panneau trop
  // gourmand, plantage du renderer), on recrée la fenêtre au lieu de laisser un
  // rectangle vide jusqu'au prochain lancement.
  shellWindow.webContents.on('render-process-gone', (_event, details) => {
    journalFault('renderer de l’interface perdu', details.reason)
    if (details.reason === 'clean-exit' || shellWindow.isDestroyed()) return
    if (win === shellWindow) win = null
    try {
      shellWindow.destroy()
    } catch {
      /* déjà détruite */
    }
    setTimeout(() => {
      if (win && !win.isDestroyed()) return
      try {
        createWindow()
      } catch (error) {
        journalFault('recréation de la fenêtre impossible', error)
      }
    }, 120)
  })

  // La coque ne navigue jamais : seul le renderer local est autorisé.
  shellWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  shellWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedShellNavigation(url)) event.preventDefault()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void shellWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void shellWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

let statusItem: Tray | null = null

/** Fenêtre principale au premier plan, recréée si elle a été fermée. */
function showWindow(): void {
  if (!win || win.isDestroyed()) {
    createWindow()
    return
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

/**
 * Élément de barre de menus (macOS uniquement). Le gabarit est dessiné en noir
 * sur fond transparent et marqué « template » : macOS l'inverse lui-même quand
 * le thème est sombre, puisqu'un gabarit ne porte pas de couleur propre.
 *
 * Le dessin vit dans build/ : `extraResources` le copie à côté de l'exécutable
 * une fois l'app empaquetée, sinon un paquet n'aurait pas d'icône à afficher.
 */
function installStatusItem(): void {
  if (process.platform !== 'darwin') return
  const base = app.isPackaged ? process.resourcesPath : join(__dirname, '../../build')
  const file = join(base, 'iconTemplate.png')
  if (!existsSync(file)) return
  const image = nativeImage.createFromPath(file)
  if (image.isEmpty()) return
  image.setTemplateImage(true)

  statusItem = new Tray(image)
  statusItem.setToolTip('Vela')
  statusItem.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Afficher Vela', click: () => showWindow() },
      {
        label: 'Nouvel onglet',
        click: () => {
          showWindow()
          browser?.sendShortcut('new-tab')
        }
      },
      { type: 'separator' },
      { label: 'Quitter Vela', accelerator: 'Cmd+Q', click: () => app.quit() }
    ])
  )
  console.log('[vela] barre de menus prête : Afficher Vela · Nouvel onglet · Quitter Vela')
}

function main(): void {
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }

  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault())
  })

  app.whenReady().then(() => {
    applySessionIdentity(session.defaultSession)
    try {
      browser = new Browser(app.getPath('userData'))
    } catch (error) {
      journalFault('démarrage impossible', error)
      dialog.showErrorBox('Impossible d’ouvrir Vela', error instanceof Error ? error.message : 'Les données n’ont pas pu être chargées.')
      app.quit()
      return
    }
    initUpdater((channel, payload) => {
      if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(channel, payload)
    })
    createWindow()
    installStatusItem()
    // Fenêtres ouvertes par une page (connexion OAuth, popup d'un site) : elles
    // doivent annoncer la même identité que les onglets. Enregistré après la
    // coque pour ne jamais toucher au renderer local.
    app.on('web-contents-created', (_event, contents) => {
      if (contents.getType() === 'window' && contents.id !== win?.webContents.id) {
        applyBrowserIdentity(contents)
      }
    })
    const accelerator = process.platform === 'darwin' ? 'Command+Shift+Space' : 'Ctrl+Shift+Space'
    try {
      globalShortcut.register(accelerator, () => {
        if (!win || win.isDestroyed()) return
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
        browser?.sendShortcut('command')
      })
    } catch {
      /* raccourci global indisponible */
    }

    app.on('activate', () => {
      // La petite fenêtre compte dans `getAllWindows()` : on regarde la fenêtre
      // principale elle-même, sinon un clic sur le Dock ne la rouvrirait pas.
      if (!win || win.isDestroyed()) createWindow()
    })
  })

  app.on('will-quit', () => {
    statusItem?.destroy()
    statusItem = null
    try {
      globalShortcut.unregisterAll()
    } catch {
      /* ignore */
    }
  })

  app.on('before-quit', () => {
    browser?.store.flush()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

main()
