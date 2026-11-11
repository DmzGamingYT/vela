/* Ouvre le menu contextuel d'une page chargée dans Vela et capture la fenêtre.
   Usage : node scripts/capture-menu-page.cjs [tag]

   Le menu contextuel est une vue native macOS : `Page.captureScreenshot` ne le
   voit pas. On capture donc la région de l'écran qui contient la fenêtre, après
   avoir amené Vela au premier plan et posé le curseur au centre de la fenêtre
   (le menu s'ouvre à la position du curseur). */
const { spawn, execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const TAG = process.argv[2] || 'onglet-page'
const OUT = path.join(ROOT, 'screenshots', 'menus', TAG)
const PORT = 9423
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.addEventListener('open', () => resolve(ws))
    ws.addEventListener('error', reject)
  })
}

function client(ws) {
  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = Math.floor(Math.random() * 1e6)
      const onMessage = (event) => {
        const message = JSON.parse(event.data)
        if (message.id !== id) return
        ws.removeEventListener('message', onMessage)
        if (message.error) reject(new Error(message.error.message))
        else resolve(message.result)
      }
      ws.addEventListener('message', onMessage)
      ws.send(JSON.stringify({ id, method, params }))
    })
}

const PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Journal de bord</title>
<style>
  body { margin: 0; padding: 56px 64px; font: 17px/1.65 -apple-system, "Helvetica Neue", sans-serif;
    color: #23201c; background: #faf8f4; }
  h1 { font-family: Georgia, serif; font-size: 34px; margin: 0 0 18px; }
  p { max-width: 620px; margin: 0 0 14px; }
  a { color: #a35a2a; }
</style></head><body>
<h1>Journal de bord</h1>
<p>Ce matin, la lumière entrait par la fenêtre de l'atelier et tout le plan de
travail en était changé. J'ai relu les notes de la veille, corrigé deux
paragraphes, puis laissé le reste en attente.</p>
<p>L'après-midi a servi à ranger les outils, à trier les factures et à préparer
la livraison de jeudi. Une <a href="https://example.com/">page de référence</a>
reste ouverte pour la suite.</p>
</body></html>`

;(async () => {
  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(OUT, { recursive: true })

  const child = spawn(require('electron'), ['.', `--remote-debugging-port=${PORT}`], {
    cwd: ROOT,
    env: { ...process.env, VELA_USER_DATA: path.join(OUT, 'data') },
    stdio: 'ignore'
  })

  try {
    let target = null
    for (let attempt = 0; attempt < 400 && !target; attempt += 1) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
        target = list.find((entry) => /index\.html/.test(entry.url))
      } catch {
        /* le port n'écoute pas encore */
      }
      if (!target) await sleep(100)
    }
    if (!target) throw new Error('pas de cible DevTools')

    const ws = await connect(target.webSocketDebuggerUrl)
    const send = client(ws)
    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true
      })
      if (result.exceptionDetails) {
        throw new Error(
          result.exceptionDetails.exception?.description ?? result.exceptionDetails.text
        )
      }
      return result.result.value
    }

    await evaluate(`window.vela.settings.update({ onboarded: true, theme: 'light' })`)
    await sleep(2600)
    await evaluate(
      `window.vela.tabs.create({ url: 'data:text/html,' + encodeURIComponent(${JSON.stringify(PAGE)}) })`
    )
    await sleep(2000)

    const geo = await evaluate(`({
      x: window.screenX, y: window.screenY,
      w: window.outerWidth, h: window.outerHeight,
      sw: window.screen.width, sh: window.screen.height
    })`)
    console.log('fenêtre :', JSON.stringify(geo))

    const swift = path.join(OUT, 'front.swift')
    fs.writeFileSync(
      swift,
      `import AppKit
import CoreGraphics
import Foundation
let pid = Int32(CommandLine.arguments[1])!
_ = NSRunningApplication(processIdentifier: pid)?.activate(options: [.activateAllWindows])
usleep(300_000)
CGWarpMouseCursorPosition(CGPoint(x: Double(CommandLine.arguments[2])!, y: Double(CommandLine.arguments[3])!))
usleep(120_000)
`
    )
    // La page vit dans sa propre cible : on y sélectionne un paragraphe puis on
    // envoie un clic droit, ce qui déclenche le menu natif côté processus main.
    const pages = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter(
      (entry) => entry.type === 'page' && entry.url.startsWith('data:text/html')
    )
    if (pages.length === 0) throw new Error('la page chargée n’a pas de cible DevTools')
    const pageWs = await connect(pages[0].webSocketDebuggerUrl)
    const pageSend = client(pageWs)
    const selected = await pageSend('Runtime.evaluate', {
      expression: `(() => {
        const paragraph = document.querySelectorAll('p')[0]
        const range = document.createRange()
        range.selectNodeContents(paragraph)
        const selection = getSelection()
        selection.removeAllRanges()
        selection.addRange(range)
        return selection.toString().slice(0, 60)
      })()`,
      returnByValue: true
    })
    console.log('sélection :', selected.result.value)
    // On vise le texte du paragraphe, pas le lien : sinon Chromium ouvre le
    // menu du lien et perd la sélection (donc les actions de sélection).
    const point = await pageSend('Runtime.evaluate', {
      expression: `(() => {
        const rect = document.querySelectorAll('p')[0].getBoundingClientRect()
        for (const dx of [40, 140, 320]) {
          const x = rect.left + dx
          const y = rect.top + 12
          const node = document.elementFromPoint(x, y)
          if (node && !node.closest('a')) return { x: Math.round(x), y: Math.round(y) }
        }
        return null
      })()`,
      returnByValue: true
    })
    const at = point.result.value ?? { x: 300, y: 260 }
    console.log('clic droit :', JSON.stringify(at))
    // Le menu natif s'ouvre à la position du curseur ; on le place sur la zone
    // de page, sinon il apparaîtrait là où se trouve la souris de l'utilisateur.
    const cx = Math.round(geo.x + geo.w * 0.4)
    const cy = Math.round(geo.y + geo.h * 0.42)
    execFileSync('swift', [swift, String(child.pid), String(cx), String(cy)], { stdio: 'ignore' })
    for (const type of ['mousePressed', 'mouseReleased']) {
      await pageSend('Input.dispatchMouseEvent', {
        type,
        x: at.x,
        y: at.y,
        button: 'right',
        buttons: type === 'mousePressed' ? 2 : 0,
        clickCount: 1
      })
    }
    await sleep(900)

    const x = Math.max(0, Math.round(geo.x))
    const y = Math.max(0, Math.round(geo.y))
    const w = Math.min(geo.sw - x, Math.round(geo.w))
    const h = Math.min(geo.sh - y, Math.round(geo.h))
    const file = path.join(OUT, `${TAG}.png`)
    execFileSync('screencapture', ['-x', '-R', `${x},${y},${w},${h}`, file])
    console.log('capturé', path.relative(ROOT, file))

    pageWs.close()
    ws.close()
  } finally {
    await sleep(300)
    child.kill('SIGTERM')
  }
})().catch((error) => {
  console.error('ÉCHEC', error.message)
  process.exit(1)
})
