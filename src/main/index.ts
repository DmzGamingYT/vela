import { join } from 'node:path'
import { app, BrowserWindow, globalShortcut, nativeTheme, session, shell } from 'electron'
import { existsSync } from 'node:fs'
import { Browser } from './browser'
import { installMenu } from './menu'
import { initUpdater } from './updater'
import { CHROME_UA, applyBrowserIdentity, applySessionIdentity } from './identity'

app.setName('Vela')
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

let browser: Browser | null = null
let win: BrowserWindow | null = null

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
      spellcheck: true
    }
  })

  browser!.attach(win)
  browser!.registerIpc()
  installMenu((action) => browser?.sendShortcut(action))

  win.once('ready-to-show', () => win?.show())
  win.on('closed', () => {
    win = null
  })

  // La coque ne navigue jamais : seul le renderer local est autorisé.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const dev = process.env['ELECTRON_RENDERER_URL']
    const allowed = dev ? url.startsWith(dev) : url.startsWith('file://')
    if (!allowed) event.preventDefault()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
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
    browser = new Browser(app.getPath('userData'))
    initUpdater((channel, payload) => {
      if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(channel, payload)
    })
    createWindow()
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
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('will-quit', () => {
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
