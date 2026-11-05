/* Captures des vues demandées pour le retrait de la pastille du bloqueur.
   Usage : node scripts/capture-blocker-pill.cjs <tag>

   Aucune requête ne sort : la page de test est une `data:` URL dont les images
   pointent vers un hôte de la liste locale — elles sont annulées par le filtre,
   ce qui alimente le compteur de session sans ouvrir de connexion. */
const { execFileSync, spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const TAG = process.argv[2] || 'apres'
const OUT = path.join(ROOT, 'screenshots', 'pastille', TAG)
const DATA = path.join(OUT, 'data')
const PORT = Number(process.env.VELA_CAPTURE_PORT || 9588)
const INSPECT = PORT + 1
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const SWIFT_SOURCE = `
import CoreGraphics
import Foundation
let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
var windows: [[String: Any]] = []
if let info = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] {
  for w in info {
    let owner = w[kCGWindowOwnerName as String] as? String ?? ""
    let name = w[kCGWindowName as String] as? String ?? ""
    let layer = w[kCGWindowLayer as String] as? Int ?? -1
    if layer == 0 && (owner.lowercased().contains("electron") || owner.lowercased().contains("vela")) {
      windows.append(["id": w[kCGWindowNumber as String] as? Int ?? 0, "owner": owner, "name": name])
    }
  }
}
if let data = try? JSONSerialization.data(withJSONObject: windows), let text = String(data: data, encoding: .utf8) { print(text) }
`

function windowTool() {
  const cache = path.join(ROOT, 'node_modules', '.cache')
  fs.mkdirSync(cache, { recursive: true })
  const source = path.join(cache, 'vela-pill-window.swift')
  const binary = path.join(cache, 'vela-pill-window')
  if (!fs.existsSync(binary) || fs.statSync(binary).mtimeMs < fs.statSync(source).mtimeMs) {
    fs.writeFileSync(source, SWIFT_SOURCE)
    execFileSync('swiftc', ['-O', source, '-o', binary], { stdio: 'ignore' })
  }
  return binary
}

function windowId(title) {
  const windows = JSON.parse(execFileSync(windowTool(), { encoding: 'utf8' }) || '[]')
  const match = windows.find((entry) => entry.name === title)
  if (!match) throw new Error('fenêtre « ' + title + ' » introuvable')
  return match.id
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    const send = (method, params = {}) =>
      new Promise((callResolve, callReject) => {
        const id = Math.floor(Math.random() * 1e6)
        const onMessage = (event) => {
          const message = JSON.parse(event.data)
          if (message.id !== id) return
          ws.removeEventListener('message', onMessage)
          if (message.error) callReject(new Error(message.error.message))
          else callResolve(message.result)
        }
        ws.addEventListener('message', onMessage)
        ws.send(JSON.stringify({ id, method, params }))
      })
    ws.onopen = () =>
      resolve({
        send,
        evaluate: async (expression) => {
          const result = await send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true
          })
          return result.result ? result.result.value : undefined
        },
        close: () => ws.close()
      })
    ws.onerror = () => reject(new Error('WebSocket en erreur'))
  })
}

async function waitForTarget(url, pick, attempts = 500) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const list = await (await fetch(url)).json()
      const target = list.find(pick)
      if (target) return target
    } catch {
      /* pas encore ouvert */
    }
    await sleep(100)
  }
  throw new Error('cible DevTools introuvable sur ' + url)
}

const PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Article de fond</title>
<style>body{margin:0;padding:64px 72px;font:17px/1.65 -apple-system,"Helvetica Neue",sans-serif;color:#23201c;background:#faf8f4}
h1{font-family:Georgia,serif;font-size:34px;margin:0 0 18px}p{max-width:640px;margin:0 0 14px}</style></head>
<body><h1>Article de fond</h1>
<p>La page sert de décor : elle est chargée depuis une adresse locale et ne contacte aucun serveur.</p>
<p>Les images ci-dessous visent un hôte de la liste de blocage ; le filtre les annule avant toute connexion, ce qui alimente le compteur de la session.</p>
<img src="https://www.google-analytics.com/analytics.js?t=1" width="1" height="1" alt="">
<img src="https://www.google-analytics.com/collect?t=2" width="1" height="1" alt="">
<img src="https://www.google-analytics.com/collect?t=3" width="1" height="1" alt="">
<img src="https://adnxs.com/px?id=4" width="1" height="1" alt="">
</body></html>`

;(async () => {
  if (process.platform !== 'darwin') throw new Error('captures natives : macOS uniquement')
  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(DATA, { recursive: true })

  const child = spawn(require('electron'), ['.', `--inspect=${INSPECT}`, `--remote-debugging-port=${PORT}`], {
    cwd: ROOT,
    env: { ...process.env, VELA_USER_DATA: DATA },
    stdio: 'ignore'
  })

  let renderer
  let main
  try {
    const [pageTarget, mainTarget] = await Promise.all([
      waitForTarget(`http://127.0.0.1:${PORT}/json/list`, (entry) => /index\.html/.test(entry.url)),
      waitForTarget(`http://127.0.0.1:${INSPECT}/json/list`, (entry) => entry.type === 'node')
    ])
    renderer = await connect(pageTarget.webSocketDebuggerUrl)
    main = await connect(mainTarget.webSocketDebuggerUrl)

    const mainWindow = `process.mainModule.require("electron").BrowserWindow.getAllWindows().find((w) => w.getTitle() === "Vela")`
    const mainEval = (expression) => main.evaluate(expression)
    const shortcut = (action) => mainEval(`${mainWindow}.webContents.send("shortcut", { action: ${JSON.stringify(action)} })`)
    const focus = () => mainEval(`(() => { const w = ${mainWindow}; w.show(); w.focus(); return true })()`)
    const resize = async (width, height) => {
      await mainEval(`(() => { const w = ${mainWindow}; w.setSize(${width}, ${height}); w.center(); return true })()`)
      await sleep(700)
    }
    const fullScreen = async (value) => {
      await mainEval(`(() => { const w = ${mainWindow}; w.setFullScreen(${value}); return true })()`)
      await sleep(1100)
    }
    const shoot = async (name) => {
      await focus()
      await sleep(320)
      const file = path.join(OUT, `${name}.png`)
      execFileSync('screencapture', ['-x', '-o', `-l${windowId('Vela')}`, file])
      console.log('capturé', path.relative(ROOT, file))
    }
    const click = async (selector) => {
      const done = await renderer.evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return false; node.click(); return true })()`)
      if (!done) console.warn('  cible absente :', selector)
      await sleep(900)
      return Boolean(done)
    }
    const escape = async () => {
      await renderer.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
      await sleep(600)
    }

    await renderer.evaluate(`window.vela.settings.update({ onboarded: true, themeId: 'indigo', theme: 'light' })`)
    await sleep(2400)
    const homeId = await renderer.evaluate(`(async () => (await window.vela.view()).activeTabId)()`)
    const page = await renderer.evaluate(
      `window.vela.tabs.create({ url: 'data:text/html,' + encodeURIComponent(${JSON.stringify(PAGE)}), activate: true })`
    )
    await sleep(2600)
    const counts = await renderer.evaluate(`(async () => {
      const view = await window.vela.view()
      return { total: view.blockedTotal, tab: view.tabs.find((t) => t.id === ${JSON.stringify(page.id)})?.blocked ?? 0 }
    })()`)
    console.log('requêtes bloquées cette session :', JSON.stringify(counts))

    for (const theme of ['light', 'dark']) {
      const suffix = theme === 'light' ? 'clair' : 'sombre'
      await renderer.evaluate(`window.vela.settings.update({ theme: '${theme}' })`)
      await sleep(800)

      await renderer.evaluate(`window.vela.tabs.activate(${JSON.stringify(homeId)})`)
      await sleep(900)
      await shoot(`accueil-${suffix}`)

      await renderer.evaluate(`window.vela.tabs.activate(${JSON.stringify(page.id)})`)
      await sleep(900)
      await shoot(`page-${suffix}`)

      if (await click('.rail-bottom button[title^="Notes"]')) {
        await shoot(`notes-${suffix}`)
        await click('.rail-bottom button[title^="Notes"]')
      }

      if (await click('.rail-bottom button[title^="Agent"]')) {
        await sleep(600)
        await shoot(`agent-${suffix}`)
        await click('.rail-bottom button[title^="Agent"]')
      }

      if (await click('.rail-bottom button[title^="Réglages"]')) {
        await sleep(600)
        await shoot(`reglages-${suffix}`)
        await escape()
      }

      await shortcut('work')
      await sleep(1100)
      await shoot(`tunnel-${suffix}`)
      await shortcut('work')
      await sleep(700)

      await renderer.evaluate(`window.vela.tabs.activate(${JSON.stringify(homeId)})`)
      await sleep(700)
      await resize(980, 700)
      await shoot(`etroite-${suffix}`)
      await fullScreen(true)
      await shoot(`plein-ecran-${suffix}`)
      await fullScreen(false)
      await resize(1380, 880)
    }

    const after = await renderer.evaluate(`(() => ({ pills: document.querySelectorAll('.statusbar-blocked').length, live: document.querySelectorAll('[aria-live]').length }))()`)
    console.log('pastilles dans le DOM :', JSON.stringify(after))
  } finally {
    try {
      renderer?.close()
      main?.close()
    } catch {
      /* déjà fermé */
    }
    await sleep(300)
    child.kill('SIGTERM')
  }
})().catch((error) => {
  console.error('ÉCHEC', error.message)
  process.exit(1)
})
