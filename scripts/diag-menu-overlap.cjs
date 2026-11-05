/* Diagnostic : le menu d'onglet doit rester au-dessus de la page.
   Ouvre une page locale imitant une modale « Sign in required », ouvre le menu
   par clic droit sur la ligne d'onglet, puis relève ce que l'app demande au
   compositeur natif (views:layout) et ce qui reste affiché. */
const { execFileSync, spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'screenshots', 'diag')
const DATA = path.join(OUT, 'data')
const PORT = 9596
const INSPECT = PORT + 1
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const SWIFT = `
import CoreGraphics
import Foundation
let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
var windows: [[String: Any]] = []
if let info = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] {
  for w in info {
    let owner = w[kCGWindowOwnerName as String] as? String ?? ""
    let name = w[kCGWindowName as String] as? String ?? ""
    let layer = w[kCGWindowLayer as String] as? Int ?? -1
    if layer == 0 && owner.lowercased().contains("electron") {
      windows.append(["id": w[kCGWindowNumber as String] as? Int ?? 0, "name": name])
    }
  }
}
if let data = try? JSONSerialization.data(withJSONObject: windows), let text = String(data: data, encoding: .utf8) { print(text) }
`

function windowId() {
  const cache = path.join(ROOT, 'node_modules', '.cache')
  fs.mkdirSync(cache, { recursive: true })
  const source = path.join(cache, 'vela-diag-window.swift')
  const binary = path.join(cache, 'vela-diag-window')
  if (!fs.existsSync(binary) || fs.statSync(binary).mtimeMs < fs.statSync(source).mtimeMs) {
    fs.writeFileSync(source, SWIFT)
    execFileSync('swiftc', ['-O', source, '-o', binary], { stdio: 'ignore' })
  }
  const list = JSON.parse(execFileSync(binary, { encoding: 'utf8' }) || '[]')
  const found = list.find((entry) => entry.name === 'Vela') ?? list[0]
  if (!found) throw new Error('fenêtre introuvable')
  return found.id
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    const send = (method, params = {}) =>
      new Promise((ok, fail) => {
        const id = Math.floor(Math.random() * 1e6)
        const onMessage = (event) => {
          const message = JSON.parse(event.data)
          if (message.id !== id) return
          ws.removeEventListener('message', onMessage)
          if (message.error) fail(new Error(message.error.message))
          else ok(message.result)
        }
        ws.addEventListener('message', onMessage)
        ws.send(JSON.stringify({ id, method, params }))
      })
    ws.onopen = () =>
      resolve({
        send,
        evaluate: async (expression) => {
          const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
          if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'exception')
          return result.result ? result.result.value : undefined
        },
        close: () => ws.close()
      })
    ws.onerror = () => reject(new Error('WebSocket en erreur'))
  })
}

async function waitForTarget(url, pick) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    try {
      const list = await (await fetch(url)).json()
      const target = list.find(pick)
      if (target) return target
    } catch {
      /* pas ouvert */
    }
    await sleep(100)
  }
  throw new Error('cible DevTools introuvable')
}

const MOCK = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Vidéo de test</title>
<style>body{margin:0;font:16px/1.5 -apple-system,sans-serif;background:#0f0f0f;color:#f1f1f1;height:100vh}
header{display:flex;align-items:center;gap:18px;padding:10px 20px}
p.ad{margin:0;padding:10px 20px}
.modal{position:fixed;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.45)}
.card{width:440px;padding:22px 24px;border-radius:14px;background:#fff;color:#0f0f0f;font-family:Arial,sans-serif}
.card h2{margin:0 0 8px;font-size:20px}
.card p{margin:0 0 18px;font-size:18px;line-height:1.45}
.cta{display:inline-flex;align-items:center;gap:8px;border:1px solid #065fd4;border-radius:999px;padding:8px 14px;color:#065fd4;font-weight:500}
</style></head><body>
<section class="modal"><div class="card"><h2>Se connecter</h2>
<p>Connectez-vous à YouTube pour cliquer sur « J’aime », ajouter un commentaire ou vous abonner.</p>
<span class="cta">Se connecter</span></div></section>
</body></html>`

;(async () => {
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
    const win = `process.mainModule.require("electron").BrowserWindow.getAllWindows().find((w) => w.getTitle() === "Vela")`
    await main.evaluate(`(() => { const w = ${win}; w.setSize(1380, 880); w.center(); w.show(); w.focus(); return true })()`)
    await renderer.evaluate(`window.vela.settings.update({ onboarded: true, theme: 'light' })`)
    await sleep(2400)
    // Journal des demandes de disposition envoyées au compositeur natif.
    await renderer.evaluate(`(() => {
      window.__layouts = []
      const original = window.vela.views.layout
      window.vela.views.layout = (payload) => {
        window.__layouts.push({ overlay: payload.overlay, panes: payload.panes.length })
        return original(payload)
      }
      return true
    })()`)
    await renderer.evaluate(`window.vela.tabs.create({ url: 'data:text/html,' + encodeURIComponent(${JSON.stringify(MOCK)}), activate: true })`)
    await sleep(2400)

    const opened = await renderer.evaluate(`(() => {
      const rows = [...document.querySelectorAll('.tab, .tab-row, [data-tab-id], .tablist > *')]
      const row = rows.find((node) => /Vidéo de test/.test(node.textContent || '')) || rows[0]
      if (!row) return 'aucune ligne'
      const box = row.getBoundingClientRect()
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: box.left + 40, clientY: box.top + 10, button: 2 })
      row.dispatchEvent(event)
      return { row: row.className, rect: { left: Math.round(box.left), top: Math.round(box.top) } }
    })()`)
    console.log('ligne visée :', JSON.stringify(opened))
    await sleep(900)
    await main.evaluate(`(() => { const w = ${win}; w.focus(); return true })()`)
    await sleep(300)
    const state = await renderer.evaluate(`(() => ({
      menu: document.querySelectorAll('.tile-menu').length,
      menuOpen: window.__velaDebug?.menuOpen ?? null,
      layouts: window.__layouts,
      menuRect: (() => { const m = document.querySelector('.tile-menu'); if (!m) return null; const r = m.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), width: Math.round(r.width) } })()
    }))()`)
    console.log('état :', JSON.stringify(state, null, 2))
    execFileSync('screencapture', ['-x', '-o', `-l${windowId()}`, path.join(OUT, 'menu-sur-page.png')])
    console.log('capture', path.relative(ROOT, path.join(OUT, 'menu-sur-page.png')))

    // Cascade : un calque s'ouvre alors que le menu est encore là (ici via un
    // clic programmatique, sans pointerdown : rien ne ferme le menu par le clic).
    await renderer.evaluate(`(() => {
      const row = [...document.querySelectorAll('.tab-row')].find((node) => /Vidéo de test/.test(node.textContent || ''))
      if (row) {
        const box = row.getBoundingClientRect()
        row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: box.left + 40, clientY: box.top + 10, button: 2 }))
      }
      return true
    })()`)
    await sleep(700)
    await renderer.evaluate(`(() => {
      const button = document.querySelector('.rail-bottom button[title^="Réglages"]')
      if (button) button.click()
      return Boolean(button)
    })()`)
    await sleep(900)
    const cascade = await renderer.evaluate(`(() => ({
      menu: document.querySelectorAll('.tile-menu').length,
      overlay: document.querySelectorAll('.overlay').length
    }))()`)
    console.log('cascade (menu doit être 0) :', JSON.stringify(cascade))
    execFileSync('screencapture', ['-x', '-o', `-l${windowId()}`, path.join(OUT, 'menu-puis-modale.png')])
    console.log('capture', path.relative(ROOT, path.join(OUT, 'menu-puis-modale.png')))
  } finally {
    try {
      renderer?.close()
      main?.close()
    } catch {
      /* fermé */
    }
    await sleep(300)
    child.kill('SIGTERM')
  }
})().catch((error) => {
  console.error('ÉCHEC', error.message)
  process.exit(1)
})
