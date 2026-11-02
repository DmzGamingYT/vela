/* Banc de la traduction de BD : planche réelle, OCR réel, calque réel.
   Traducteur : TRANSLATOR_API_KEY (réel) sinon factice, avec bandeau explicite.
   Usage : npx electron screenshots/comic-check/check.cjs [--mock] */
const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')

const DIR = __dirname
const ROOT = path.resolve(DIR, '../..')
const OUT = path.join(ROOT, 'screenshots', 'comic-check')
const W = 1000
const H = 1400
const KEY = (process.env.TRANSLATOR_API_KEY || '').trim()
const MOCK = !KEY || process.argv.includes('--mock')
const URL_API = process.env.TRANSLATOR_URL || 'https://api.openai.com/v1/chat/completions'
const MODEL = process.env.TRANSLATOR_MODEL || 'gpt-4o-mini'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const CANNED = [
  "On devrait rentrer avant que l'orage éclate.",
  "Le pont est sous l'eau, et la route aussi.",
  'COUREZ !',
  'TROIS HEURES PLUS TÔT'
]

const FRENCH = {
  'WE SHOULD GO BACK BEFORE THE STORM HITS.': "On devrait rentrer avant que l'orage éclate.",
  'THE BRIDGE IS UNDER WATER AND SO IS THE ROAD.': "Le pont est sous l'eau, et la route aussi.",
  'RUN!': 'COUREZ !',
  'THREE HOURS EARLIER': 'TROIS HEURES PLUS TÔT'
}

const PROMPT =
  'Tu es traducteur de bande dessinée vers le français. On te donne un JSON ' +
  '{"contexte":"…","repliques":[{"id":0,"texte":"…"}]}. Traduis chaque réplique, registre ' +
  'parlé et naturel, phrases courtes adaptées à une bulle, noms propres inchangés, onomatopées ' +
  'rendues en français, erreurs d’OCR évidentes corrigées sans rien inventer. Réponds uniquement ' +
  'par {"traductions":[{"id":0,"texte":"…"}]}.'

async function translate(texts, contexte) {
  const clean = (texts || []).map((t) => String(t))
  if (MOCK) {
    return {
      ok: true,
      mode: 'mock',
      translations: clean.map((t, id) => ({ id, texte: FRENCH[t.trim()] || CANNED[id % CANNED.length] }))
    }
  }
  const response = await fetch(URL_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      messages: [
        { role: 'system', content: PROMPT },
        {
          role: 'user',
          content: JSON.stringify({ contexte: contexte || '', repliques: clean.map((texte, id) => ({ id, texte })) })
        }
      ]
    })
  })
  if (!response.ok) return { ok: false, mode: 'real', error: `traducteur HTTP ${response.status}` }
  const body = await response.json()
  const content = body.choices?.[0]?.message?.content || ''
  const match = content.match(/\{[\s\S]*\}/)
  if (!match) return { ok: false, mode: 'real', error: 'réponse du modèle illisible' }
  const list = JSON.parse(match[0]).traductions || []
  return {
    ok: true,
    mode: 'real',
    translations: clean.map((t, id) => ({ id, texte: list.find((x) => Number(x.id) === id)?.texte || t }))
  }
}

app.disableHardwareAcceleration()
app.commandLine.appendSwitch('force-color-profile', 'srgb')
ipcMain.handle('vt:translate', (_event, payload) => translate(payload?.texts, payload?.contexte))

function prelude(script) {
  return `
    (() => {
      const bridge = window.__velaComicBridge
      if (!bridge) return { ok: false, reason: 'pont Vela indisponible' }
      if (window.__velaComicRunning) return { ok: true, reason: 'déjà lancé' }
      window.__velaComicRunning = true
      const token = 'test'
      const storeKey = (key) => 'vela-comic:' + key
      const GM_getValue = (key, fallback) => {
        try { const raw = localStorage.getItem(storeKey(key)); return raw === null ? fallback : JSON.parse(raw) } catch { return fallback }
      }
      const GM_setValue = (key, value) => { try { localStorage.setItem(storeKey(key), JSON.stringify(value)) } catch {} }
      const toBlob = (base64, type) => {
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
        return new Blob([bytes], { type: type || 'image/png' })
      }
      const GM_xmlhttpRequest = (options) => {
        const settings = options || {}
        const done = (fn, value) => { try { if (typeof fn === 'function') fn(value) } catch {} }
        const failMessage = (text) => done(settings.onerror, new Error(text))
        const method = String(settings.method || 'GET').toUpperCase()
        if (method === 'GET') {
          bridge.image(token, String(settings.url || '')).then((result) => {
            if (!result || !result.ok) return failMessage(result && result.error ? result.error : 'image refusée')
            done(settings.onload, { status: 200, response: toBlob(result.base64, result.type), responseText: '' })
          }).catch(() => failMessage('image inaccessible'))
          return
        }
        let texts = []
        let contexte = ''
        try {
          const body = JSON.parse(settings.data || '{}')
          const user = (body.messages || []).find((entry) => entry.role === 'user')
          const parsed = JSON.parse(user ? user.content : '{}')
          texts = (parsed.repliques || []).map((item) => item.texte)
          contexte = parsed.contexte || ''
        } catch {}
        bridge.translate(token, texts, contexte).then((result) => {
          if (!result || !result.ok) return failMessage(result && result.error ? result.error : 'traduction refusée')
          done(settings.onload, { status: 200, responseText: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ traductions: result.translations || [] }) } }] }) })
        }).catch(() => failMessage('traduction injoignable'))
      }
      try { ${script} return { ok: true } } catch (error) {
        window.__velaComicRunning = false
        return { ok: false, reason: error && error.message ? error.message : 'script en échec' }
      }
    })()
  `
}

async function main() {
  console.log(
    MOCK
      ? 'TRADUCTEUR : FACTICE — TRANSLATOR_API_KEY absente ou --mock : la qualité des traductions N’EST PAS vérifiée.'
      : `TRADUCTEUR : réel (${MODEL})`
  )

  if (!fs.existsSync(path.join(DIR, 'panel.png'))) {
    const maker = new BrowserWindow({ width: 900, height: 1300, show: false, useContentSize: true, webPreferences: { offscreen: true } })
    await maker.loadFile(path.join(DIR, 'panel.html'))
    await sleep(700)
    const shot = await maker.webContents.capturePage({ x: 0, y: 0, width: 900, height: 1300 })
    fs.writeFileSync(path.join(DIR, 'panel.png'), shot.toPNG())
    maker.destroy()
    console.log('planche de référence régénérée')
  }

  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '')
    const file = path.join(DIR, rel)
    if (!file.startsWith(DIR) || !fs.existsSync(file)) {
      res.writeHead(404)
      return res.end('absente')
    }
    res.writeHead(200, { 'content-type': file.endsWith('.png') ? 'image/png' : (file.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8') })
    fs.createReadStream(file).pipe(res)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}/page.html`
  console.log('page :', url)

  const win = new BrowserWindow({
    width: W,
    height: H,
    show: false,
    useContentSize: true,
    webPreferences: {
      offscreen: true,
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(DIR, 'preload.cjs')
    }
  })
  const errors = []
  win.webContents.on('console-message', (event, level, message) => {
    const text = String(typeof message === 'string' ? message : (event && event.message) || '')
    const severity = typeof level === 'number' ? level : (event && event.level) || 0
    if (severity >= 2) errors.push(text.slice(0, 200))
    if (text.startsWith('[BD]')) console.log('  log :', text)
  })

  await win.loadURL(url)
  await sleep(1200)

  // Même fenêtre, même cadrage, aucune injection : l'« avant » est comparable
  // au « après » pixel pour pixel.
  if (process.argv.includes('--before')) {
    const shot = await win.webContents.capturePage({ x: 0, y: 0, width: W, height: H })
    fs.writeFileSync(path.join(DIR, 'avant.png'), shot.toPNG())
    console.log('capture avant (sans traduction)')
    server.close()
    app.exit(0)
    return
  }

  await win.webContents.executeJavaScript(`window.__velaComicBridge = {
    image: async () => ({ ok: false, error: 'pas de planche distante dans ce test' }),
    translate: async (token, texts, contexte) => window.__vtTranslate(texts, contexte),
    mode: 'test'
  }; true`)

  const script = fs.readFileSync(path.join(ROOT, 'userscripts/comic-translate.user.js'), 'utf8')
  const injected = await win.webContents.executeJavaScript(prelude(script))
  if (!injected || !injected.ok) {
    console.log('ECHEC_INJECTION', injected && injected.reason)
    app.exit(1)
    return
  }

  await sleep(600)
  await win.webContents.executeJavaScript(`window.__vtReport = []; document.querySelector('#vt-run').click(); true`)

  let bubbles = 0
  let status = ''
  for (let i = 0; i < 60; i += 1) {
    await sleep(2000)
    status = await win.webContents.executeJavaScript(`(document.querySelector('#vt-status') || {}).textContent || ''`)
    bubbles = await win.webContents.executeJavaScript(`document.querySelectorAll('.vt-bubble').length`)
    if (bubbles >= 4) break
    if (/ignorée|aucune planche|refus|expirée/i.test(status)) break
  }

  await sleep(1600)
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: W, height: H })
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, 'resultat.png'), image.toPNG())

  const report = await win.webContents.executeJavaScript('window.__vtReport || []')
  console.log('STATUS:', status)
  console.log('CALQUES:', bubbles, '· rapport:', report.length)
  for (const entry of report) console.log('  ·', JSON.stringify(entry))
  const overflow = report.filter((entry) => !entry.fits)
  console.log(`DEBORDEMENT : ${overflow.length} sur ${report.length}`)
  if (errors.length) console.log('ERREURS:', errors.slice(0, 4))

  server.close()
  app.exit(report.length && !overflow.length ? 0 : 1)
}

app.whenReady().then(main).catch((error) => {
  console.error('banc en échec :', error && error.message)
  app.exit(1)
})
