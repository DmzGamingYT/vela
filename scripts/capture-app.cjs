const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'screenshots', 'app')
const PORT = 9392
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(path.join(OUT, 'data'), { recursive: true })
  // Le commutateur doit précéder le chemin de l'app : placé après, Electron le
  // transmet à l'application et n'ouvre aucun port DevTools (capture muette).
  const child = spawn(require('electron'), [`--remote-debugging-port=${PORT}`, '.'], {
    cwd: ROOT,
    env: { ...process.env, VELA_USER_DATA: path.join(OUT, 'data') },
    stdio: 'ignore'
  })
  try {
    let target = null
    for (let i = 0; i < 400 && !target; i += 1) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
        target = list.find((t) => /index\.html/.test(t.url))
      } catch {}
      if (!target) await sleep(100)
    }
    if (!target) throw new Error('pas de cible DevTools')
    const ws = new WebSocket(target.webSocketDebuggerUrl)
    const send = (method, params = {}) =>
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
    await new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = reject
    })
    await send('Runtime.evaluate', {
      expression: `window.vela.settings.update({ onboarded: true })`,
      awaitPromise: true
    })
    await sleep(2600)
    const shoot = async (name) => {
      const shot = await send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(path.join(OUT, name), Buffer.from(shot.data, 'base64'))
      console.log('capturé', name)
    }
    await shoot('accueil.png')
    await send('Runtime.evaluate', {
      expression: `window.vela.tabs.create({ url: 'https://fr.wikipedia.org/wiki/Navigateur_web' })`,
      awaitPromise: true
    })
    await sleep(3200)
    await shoot('page.png')
    ws.close()
  } finally {
    await sleep(200)
    child.kill('SIGTERM')
  }
})().catch((error) => {
  console.error('ÉCHEC', error.message)
  process.exit(1)
})
