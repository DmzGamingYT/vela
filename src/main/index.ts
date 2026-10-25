import { join } from 'node:path'
import { app, BrowserWindow, globalShortcut, nativeTheme, shell } from 'electron'
import { Browser } from './browser'
import { installMenu } from './menu'
import { initUpdater } from './updater'
import { applyBrowserIdentity } from './identity'

app.setName('Vela')
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
    backgroundColor: dark ? '#09090b' : '#eef2f8',
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
    const accelerator = process.platform === 'darwin' ? 'Alt+Command+Space' : 'Ctrl+Alt+Space'
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
