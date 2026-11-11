const { spawn } = require('node:child_process')
const fs = require('node:fs')

const ROOT = '/Users/alessioinnangi/Desktop/Projets/vela'
const PORT = 9401
const INSPECT = PORT + 1
const DATA = '/private/var/folders/k4/jt7vpptx2qdb9wsg275sj8pw0000gn/T/opencode/vela-measure'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
fs.rmSync(DATA, { recursive: true, force: true })
fs.mkdirSync(DATA, { recursive: true })

const child = spawn(
  require('electron'),
  ['.', `--inspect=${INSPECT}`, `--remote-debugging-port=${PORT}`],
  { cwd: ROOT, env: { ...process.env, VELA_USER_DATA: DATA }, stdio: ['ignore', 'pipe', 'pipe'] }
)

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    const send = (method, params = {}) =>
      new Promise((ok, fail) => {
        const id = Math.floor(Math.random() * 1e6)
        const on = (e) => {
          const m = JSON.parse(e.data)
          if (m.id !== id) return
          ws.removeEventListener('message', on)
          m.error ? fail(new Error(m.error.message)) : ok(m.result)
        }
        ws.addEventListener('message', on)
        ws.send(JSON.stringify({ id, method, params }))
      })
    ws.onopen = () =>
      resolve({
        send,
        evaluate: async (expression) => {
          const r = await send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true
          })
          if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'erreur')
          return r.result ? r.result.value : undefined
        }
      })
    ws.onerror = () => reject(new Error('WebSocket en erreur'))
  })
}

async function waitForTarget(url, pick) {
  for (let i = 0; i < 400; i += 1) {
    try {
      const list = await (await fetch(url)).json()
      const found = list.find(pick)
      if (found) return found
    } catch {}
    await sleep(100)
  }
  throw new Error('cible introuvable')
}

;(async () => {
  const [pageTarget, mainTarget] = await Promise.all([
    waitForTarget(`http://127.0.0.1:${PORT}/json/list`, (e) => /index\.html/.test(e.url)),
    waitForTarget(`http://127.0.0.1:${INSPECT}/json/list`, (e) => e.type === 'node')
  ])
  const renderer = await connect(pageTarget.webSocketDebuggerUrl)
  const main = await connect(mainTarget.webSocketDebuggerUrl)
  const win = `process.mainModule.require("electron").BrowserWindow.getAllWindows().find((w) => w.getTitle().includes("Vela") || w.getTitle() === "Vela")`
  await main.evaluate(`(() => { const w = ${win}; if (!w) return 'pas de fenêtre'; w.setSize(1440, 900); w.center(); w.show(); return w.getSize().join('x') })()`)
  await renderer.evaluate(`window.vela.settings.update({ onboarded: true })`)
  await sleep(2500)

  const mesure = await renderer.evaluate(`(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { haut: Math.round(r.top), bas: Math.round(r.bottom), gauche: Math.round(r.left), droite: Math.round(r.right), h: Math.round(r.height), l: Math.round(r.width) };
    };
    const start = document.querySelector('.start');
    const scroll = start ? { scrollH: start.scrollHeight, clientH: start.clientHeight } : null;
    return {
      fenetre: { l: window.innerWidth, h: window.innerHeight },
      start: scroll,
      startInner: box('.start-inner.home'),
      head: box('.home-head'),
      search: box('.home-search'),
      favoris: box('.home-favorites, [class*=favori]'),
      grid: box('.home-grid'),
      recent: box('.home-recent'),
      side: box('.home-side'),
      sideCartes: [...document.querySelectorAll('.home-side > *')].map(el => {
        const r = el.getBoundingClientRect();
        return { cls: el.className, h: Math.round(r.height), bas: Math.round(r.bottom) };
      }),
      tuiles: [...document.querySelectorAll('.recent-tile')].map(el => {
        const r = el.getBoundingClientRect();
        return { h: Math.round(r.height), l: Math.round(r.width) };
      }),
      foot: box('.home-foot'),
      cartes: [...document.querySelectorAll('.home-card')].map(el => {
        const r = el.getBoundingClientRect();
        return { cls: el.className, h: Math.round(r.height) };
      })
    };
  })()`)
  console.log(JSON.stringify(mesure, null, 2))
  child.kill('SIGTERM')
})().catch((e) => {
  console.error('ÉCHEC', e.message)
  try {
    child.kill('SIGTERM')
  } catch {}
  process.exit(1)
})
