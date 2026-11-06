/* Diagnostic de la traduction de BD sur une vraie page.

   Ouvre l'URL donnée dans Vela (processus principal réel, pont `comic:image`
   réel), lance la traduction, écoute la console de l'onglet web lui-même —
   pas celle de la coque — et capture la page.

   Usage : node scripts/comic-diag.cjs <url> [nom-de-capture] [secondes]
   Sortie : screenshots/comic-diag/<nom>.log et <nom>.png            */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'screenshots', 'comic-diag')
const PORT = 9393
const URL_ARG = process.argv[2] || 'https://www.webtoons.com/'
const NAME = process.argv[3] || 'webtoons'
const SECONDS = Number(process.argv[4] || 60)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const lines = []
const record = (source, text) => {
  const line = String(text).replace(/\s+/g, ' ').trim()
  if (!line) return
  lines.push(`[${source}] ${line}`)
  console.log(`[${source}] ${line}`)
}

function socket(url) {
  const ws = new WebSocket(url)
  const pending = new Map()
  let nextId = 1
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      message.error ? reject(new Error(message.error.message)) : resolve(message.result)
      return
    }
    if (message.method === 'Runtime.consoleAPICalled') {
      const text = (message.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ')
      record('page', `${message.params.type}: ${text}`)
    } else if (message.method === 'Log.entryAdded') {
      const entry = message.params.entry
      record('page', `${entry.level}: ${entry.text}${entry.url ? ` (${entry.url})` : ''}`)
    } else if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails
      record('page', `exception: ${details.text} ${details.exception?.description || ''}`)
    }
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id)
          reject(new Error(`délai CDP ${method}`))
        }
      }, 25000)
    })
  const open = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  return { ws, send, open }
}

async function targets() {
  return await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const dataDir = path.join(OUT, 'data')
  fs.rmSync(dataDir, { recursive: true, force: true })
  fs.mkdirSync(dataDir, { recursive: true })

  const child = spawn(require('electron'), ['.', `--remote-debugging-port=${PORT}`], {
    cwd: ROOT,
    env: { ...process.env, VELA_USER_DATA: dataDir },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout.on('data', (b) => String(b).split('\n').forEach((l) => record('main', l)))
  child.stderr.on('data', (b) => String(b).split('\n').forEach((l) => record('main', l)))

  let shell = null
  for (let attempt = 0; attempt < 300 && !shell; attempt += 1) {
    try {
      const list = await targets()
      shell = list.find((t) => /index\.html/.test(t.url)) || null
    } catch {}
    if (!shell) await sleep(100)
  }
  if (!shell) throw new Error('coque Vela introuvable')

  const shellSocket = socket(shell.webSocketDebuggerUrl)
  await shellSocket.open
  await shellSocket.send('Runtime.enable')
  const evaluateShell = async (expression) => {
    const r = await shellSocket.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'évaluation refusée')
    return r.result?.value
  }

  await evaluateShell(`window.vela.settings.update({ onboarded: true })`)
  const tab = await evaluateShell(`window.vela.tabs.create({ url: ${JSON.stringify(URL_ARG)} })`)
  record('harnais', `onglet ${tab?.id || '(inconnu)'} ouvert sur ${URL_ARG}`)

  // L'onglet web est une autre cible CDP : c'est là que vit la console [BD].
  let page = null
  for (let attempt = 0; attempt < 150 && !page; attempt += 1) {
    try {
      const list = await targets()
      page = list.find((t) => t.type === 'page' && /webtoons|viewer/.test(t.url)) || null
    } catch {}
    if (!page) await sleep(300)
  }
  if (!page) throw new Error('onglet web introuvable — ' + URL_ARG)
  record('harnais', `cible page : ${page.url}`)

  const pageSocket = socket(page.webSocketDebuggerUrl)
  await pageSocket.open
  await pageSocket.send('Runtime.enable')
  await pageSocket.send('Log.enable')
  const evaluate = async (expression) => {
    const r = await pageSocket.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'évaluation refusée')
    return r.result?.value
  }

  await sleep(6000)
  const before = await evaluate(`(() => ({
    titre: document.title,
    url: location.href,
    images: [...document.images].slice(0, 8).map((img, index) => ({
      index,
      url: img.currentSrc || img.src || '',
      complete: Boolean(img.complete),
      naturalWidth: img.naturalWidth || 0,
      crossOrigin: img.crossOrigin === null ? '(aucun)' : img.crossOrigin,
      dataSrc: img.getAttribute('data-src') || '',
      dataUrl: img.getAttribute('data-url') || ''
    }))
  }))()`)
  record('harnais', `avant : ${JSON.stringify(before)}`)

  const run = await evaluateShell(`window.vela.comic.run(${JSON.stringify(tab.id)})`)
  record('harnais', `comic:run → ${JSON.stringify(run)}`)

  const deadline = Date.now() + SECONDS * 1000
  let status
  while (Date.now() < deadline) {
    status = (await evaluate(`document.querySelector('.vt-panel #vt-status')?.textContent || ''`).catch(() => '')) || ''
    record('harnais', `état : ${status}`)
    if (status && !/en file|préparation|lecture|découpage|zones,/.test(status)) break
    await sleep(3000)
  }

  const after = await evaluate(`(() => ({
    status: document.querySelector('.vt-panel #vt-status')?.textContent || '',
    couches: document.querySelectorAll('.vt-layer').length,
    bulles: document.querySelectorAll('.vt-bubble').length,
    rejets: document.querySelectorAll('.vt-reject').length
  }))()`)
  record('harnais', `après : ${JSON.stringify(after)}`)

  const shot = await pageSocket.send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(path.join(OUT, `${NAME}.png`), Buffer.from(shot.data, 'base64'))
  record('harnais', `capture ${NAME}.png`)

  fs.writeFileSync(path.join(OUT, `${NAME}.log`), lines.join('\n'))
  console.log(`journal : ${path.join(OUT, `${NAME}.log`)}`)
  shellSocket.ws.close()
  pageSocket.ws.close()
  child.kill('SIGTERM')
  await sleep(400)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('ÉCHEC', error.message)
    process.exit(1)
  })