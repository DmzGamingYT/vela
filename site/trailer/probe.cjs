/*
 * Sonde rapide : vérifie que la capture depuis le processus principal contient
 * bien les pages web (contrairement au screencast du renderer).
 *
 *   node site/trailer/probe.cjs
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '../..')
const OUT = path.join(__dirname, 'probe')
const PORT = 9377

/* NODE_OPTIONS ne protège pas les espaces : on passe par un chemin neutre. */
const INJECT = path.join(os.tmpdir(), 'vela-trailer-inject.cjs')
fs.copyFileSync(path.join(__dirname, 'inject.cjs'), INJECT)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

;(async () => {
  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true })

  const child = spawn(require('electron'), ['.', `--remote-debugging-port=${PORT}`, '--disable-backgrounding-occluded-windows'], {
    cwd: ROOT,
    env: {
      ...process.env,
      VELA_USER_DATA: path.join(OUT, 'data'),
      VELA_FRAMES: path.join(OUT, 'frames'),
      VELA_FPS: '20',
      NODE_OPTIONS: `--require ${INJECT}`
    },
    stdio: 'ignore'
  })

  try {
    let target = null
    for (let i = 0; i < 400 && !target; i += 1) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
        target = list.find((t) => /index\.html/.test(t.url))
      } catch {
        /* pas encore prêt */
      }
      if (!target) await sleep(50)
    }
    if (!target) throw new Error('pas de cible DevTools')

    const ws = new WebSocket(target.webSocketDebuggerUrl)
    const send = (method, params = {}) =>
      new Promise((resolve) => {
        const id = Math.floor(Math.random() * 1e6)
        const onMessage = (event) => {
          const message = JSON.parse(event.data)
          if (message.id === id) {
            ws.removeEventListener('message', onMessage)
            resolve(message.result)
          }
        }
        ws.addEventListener('message', onMessage)
        ws.send(JSON.stringify({ id, method, params }))
      })
    await new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = reject
    })

    await send('Runtime.evaluate', { expression: `window.vela.settings.update({ onboarded: true, theme: 'dark' })`, awaitPromise: true })
    await sleep(1200)
    await send('Runtime.evaluate', {
      expression: `window.vela.tabs.create({ url: 'https://fr.wikipedia.org/wiki/H%C3%A9bergement_web' })`,
      awaitPromise: true
    })
    await sleep(5000)
    ws.close()
  } finally {
    await sleep(300)
    child.kill('SIGTERM')
  }

  const log = fs.readFileSync(path.join(OUT, 'frames.jsonl'), 'utf8').trim().split('\n').filter(Boolean)
  const files = log.map((line) => JSON.parse(line)).filter((entry) => entry.file)
  console.log(`images capturées : ${files.length}`)
  const span = files.length > 1 ? ((files[files.length - 1].at - files[0].at) / 1000).toFixed(1) : '0'
  console.log(`durée couverte : ${span} s → ${(files.length / Math.max(Number(span), 0.001)).toFixed(1)} i/s`)
  const last = files[files.length - 1]
  if (last) {
    fs.copyFileSync(path.join(OUT, 'frames', last.file), path.join(OUT, 'derniere.jpg'))
    console.log('dernière image :', path.join('site/trailer/probe', 'derniere.jpg'))
  }
  console.log(log.filter((line) => line.includes('error')).join('\n') || 'aucune erreur de capture')
})().catch((error) => {
  console.error('ÉCHEC', error.message)
  process.exit(1)
})
