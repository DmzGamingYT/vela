/* Banc de la traduction de BD : planche réelle, OCR réel, calque réel.
   Traducteur : TRANSLATOR_API_KEY (réel) sinon factice, avec bandeau explicite.
   Usage : npx electron scripts/comic-bench/check.cjs [--mock|--before]
   Sortie : code 1 si un contrôle échoue. */
const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')

const DIR = __dirname
const ROOT = path.resolve(DIR, '../..')
const OUT = path.join(ROOT, 'screenshots', 'comic-check')
const EDITS_DIR = path.join(OUT, 'edits')
const W = 1000
const H = 1300
const translator = require('../translator.cjs')
const CFG = translator.config()
const MOCK = !CFG.configured || process.argv.includes('--mock')
const MODEL = CFG.model || '(aucun)'
const VISION = { appels: 0, ok: 0, erreur: '' }
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
  'RUN, NOW!': 'COUREZ, VITE !',
  'THREE HOURS EARLIER': 'TROIS HEURES PLUS TÔT',
  'LOCK THE GATE.': 'FERME LA PORTE.',
  'KEEP OUT.': 'SORTEZ DE LÀ.',
  'IT IS LOCKED.': 'ELLE EST FERMÉE.',
  'THE WATER IS RISING FAST.': "L'eau monte vite.",
  'GO.': 'VAS-Y.',
  'NO ONE SAW IT.': "PERSONNE NE L'A VU.",
  'SILENCE.': 'SILENCE.'
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
  const result = await translator.chat(
    CFG,
    [
      { role: 'system', content: PROMPT },
      {
        role: 'user',
        content: JSON.stringify({ contexte: contexte || '', repliques: clean.map((texte, id) => ({ id, texte })) })
      }
    ],
    { temperature: 0.2, timeoutMs: 120_000 }
  )
  if (!result.ok) return { ok: false, mode: 'real', error: result.error }
  const match = result.content.match(/\{[\s\S]*\}/)
  if (!match) return { ok: false, mode: 'real', error: 'réponse du modèle illisible' }
  let list = []
  try {
    list = JSON.parse(match[0]).traductions || []
  } catch {
    return { ok: false, mode: 'real', error: 'JSON de traduction invalide' }
  }
  return {
    ok: true,
    mode: 'real',
    translations: clean.map((t, id) => ({ id, texte: list.find((x) => Number(x.id) === id)?.texte || t }))
  }
}

/** Dernier recours d'un éclat illisible : le modèle regarde le recadrage. */
async function vision(dataUrl) {
  VISION.appels += 1
  if (MOCK) {
    VISION.erreur = 'aucun fournisseur de vision configuré (mode factice)'
    return { ok: false, error: 'vision indisponible : aucun fournisseur configuré' }
  }
  const result = await translator.vision(CFG, dataUrl)
  if (result.ok) VISION.ok += 1
  else VISION.erreur = result.error
  return result
}

app.disableHardwareAcceleration()
app.commandLine.appendSwitch('force-color-profile', 'srgb')
ipcMain.handle('vt:translate', (_event, payload) => translate(payload?.texts, payload?.contexte))
ipcMain.handle('vt:vision', (_event, payload) => vision(payload?.dataUrl))
ipcMain.handle('vt:save-edits', (_event, payload) => {
  const key = String(payload?.key || '')
  if (!/^[a-z0-9]+$/.test(key)) return { ok: false, error: 'clé invalide' }
  fs.mkdirSync(EDITS_DIR, { recursive: true })
  const file = path.join(EDITS_DIR, `${key}.json`)
  fs.writeFileSync(file, JSON.stringify(payload.value, null, 2))
  return { ok: true, file }
})
ipcMain.handle('vt:load-edits', (_event, payload) => {
  const key = String(payload?.key || '')
  if (!/^[a-z0-9]+$/.test(key)) return { ok: false, error: 'clé invalide' }
  const file = path.join(EDITS_DIR, `${key}.json`)
  if (!fs.existsSync(file)) return { ok: false, error: 'aucune correction' }
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(file, 'utf8')) }
  } catch (error) {
    return { ok: false, error: String(error && error.message) }
  }
})

function prelude(script) {
  return `
    (() => {
      const bridge = window.__velaComicBridge
      if (!bridge) return { ok: false, reason: 'pont Vela indisponible' }
      if (window.__velaComicRunning) return { ok: true, reason: 'déjà lancé' }
      window.__velaComicRunning = true
      const token = 'test'
      // Comme dans src/main/comic.ts : les aides restent dans la fermeture, le
      // script de page ne voit aucune entrée portant le jeton.
      const velaComicVision = (dataUrl) => bridge.vision(token, dataUrl)
      const velaComicEdits = (key, value) => bridge.saveEdits(token, key, value)
      const velaComicLoadEdits = (key) => bridge.loadEdits(token, key)
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

/**
 * Comparaison avant/après générée à partir des boîtes mesurées, pas à la main.
 * L'image est rendue par `scripts/shot.cjs` dans un autre processus : créer une
 * deuxième fenêtre offscreen ici tue le rendu de cette machine.
 */
function comparison(rows) {
  const cellW = 320
  const cellH = 170
  const width = cellW * 2 + 16 + 36
  const height = 54 + rows.length * (cellH + 30) + 16
  const block = (image, box) =>
    `<div class="shot"><img src="${image}" style="margin-left:${Math.round(-(box.cx - cellW / 2))}px;margin-top:${Math.round(-(box.cy - cellH / 2))}px"></div>`
  const html = `<!doctype html><meta charset="utf-8">
<style>
  body{margin:0;background:#f6f5f2;font:12px/1.4 -apple-system,system-ui,sans-serif;color:#1b1a17}
  h1{font-size:13px;font-weight:600;margin:14px 18px 10px}
  .row{display:flex;gap:16px;padding:0 18px 12px}
  .cell{width:${cellW}px}
  .shot{width:${cellW}px;height:${cellH}px;overflow:hidden;position:relative;border-radius:8px;background:#fff;box-shadow:inset 0 0 0 1px rgba(0,0,0,.1)}
  .shot img{position:absolute;width:${W}px;height:${H}px}
  .cap{font-size:10px;opacity:.6;text-transform:uppercase;letter-spacing:.05em;margin:5px 0 0}
</style>
<h1>Avant / après — même cadrage, zones lues par le banc${MOCK ? ' · TRADUCTEUR FACTICE (qualité non vérifiée)' : ''}</h1>
${rows
  .map(
    (row) => `<div class="row">
  <div class="cell">${block('avant.png', row.box)}<p class="cap">avant · ${row.titre}</p></div>
  <div class="cell">${block('resultat.png', row.box)}<p class="cap">après · ${row.titre}</p></div>
</div>`
  )
  .join('\n')}`
  const file = path.join(OUT, 'comparaison.html')
  fs.writeFileSync(file, html)
  fs.writeFileSync(path.join(OUT, 'comparaison.size.json'), JSON.stringify({ width, height: height + 40 }))
  console.log(`comparaison : screenshots/comic-check/comparaison.html (${width}×${height + 40}) — capturée par le banc lui-même`)
}

async function main() {
  if (MOCK) {
    console.log(
      `TRADUCTEUR : FACTICE — ${CFG.configured ? '--mock demandé' : CFG.reason} : la qualité des traductions N’EST PAS vérifiée.`
    )
  } else {
    console.log(`TRADUCTEUR : ${translator.describe(CFG)}`)
    const reachable = await translator.ping(CFG)
    console.log(reachable.ok ? `CONNEXION : OK en ${reachable.ms} ms` : `CONNEXION : ÉCHEC — ${reachable.error}`)
    if (!reachable.ok) {
      console.log('ECHEC : fournisseur configuré mais injoignable — relancer avec --mock pour la démonstration locale.')
      app.exit(2)
      return
    }
  }
  fs.mkdirSync(OUT, { recursive: true })
  // Chaque passage part d'un disque vide : sans cela, les corrections du
  // passage précédent seraient relues et l'« après » montrerait déjà le texte.
  fs.rmSync(EDITS_DIR, { recursive: true, force: true })
  if (!fs.existsSync(path.join(DIR, 'panel.png'))) {
    console.log('ECHEC : panel.png absent — lancer d’abord scripts/shot.cjs sur panel.html')
    app.exit(1)
    return
  }

  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '')
    const file = path.join(DIR, rel)
    if (!file.startsWith(DIR) || !fs.existsSync(file)) {
      res.writeHead(404)
      return res.end('absente')
    }
    res.writeHead(200, {
      'content-type': file.endsWith('.png') ? 'image/png' : file.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8'
    })
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

  // La planche elle-même, rendue par cette fenêtre : plus de second processus.
  win.setContentSize(900, 1300)
  await win.loadFile(path.join(DIR, 'panel.html'))
  await sleep(500)
  const panelShot = await win.webContents.capturePage({ x: 0, y: 0, width: 900, height: 1300 })
  fs.writeFileSync(path.join(DIR, 'panel.png'), panelShot.toPNG())
  win.setContentSize(W, H)

  await win.loadURL(url)
  await sleep(1200)

  // Même fenêtre, même cadrage, aucune injection : l'« avant » est comparable
  // au « après » pixel pour pixel.
  if (process.argv.includes('--before')) {
    const shot = await win.webContents.capturePage({ x: 0, y: 0, width: W, height: H })
    fs.writeFileSync(path.join(OUT, 'avant.png'), shot.toPNG())
    console.log('capture avant (sans traduction)')
    server.close()
    app.exit(0)
    return
  }

  await win.webContents.executeJavaScript(`window.__velaComicBridge = {
    image: async () => ({ ok: false, error: 'pas de planche distante dans ce test' }),
    translate: async (token, texts, contexte) => window.__vtTranslate(texts, contexte),
    vision: async (token, dataUrl) => window.__vtVision(dataUrl),
    saveEdits: async (token, key, value) => window.__vtSaveEdits(key, value),
    loadEdits: async (token, key) => window.__vtLoadEdits(key),
    mode: 'test'
  };
  true`)

  const script = fs.readFileSync(path.join(ROOT, 'userscripts/comic-translate.user.js'), 'utf8')
  const injected = await win.webContents.executeJavaScript(prelude(script))
  if (!injected || !injected.ok) {
    console.log('ECHEC_INJECTION', injected && injected.reason)
    app.exit(1)
    return
  }

  await sleep(600)
  await win.webContents.executeJavaScript('window.__vtReport = []; document.querySelector("#vt-run").click(); true')

  let zones = 0
  let status = ''
  for (let i = 0; i < 200; i += 1) {
    await sleep(1000)
    status = await win.webContents.executeJavaScript(`(document.querySelector('#vt-status') || {}).textContent || ''`)
    zones = await win.webContents.executeJavaScript(`document.querySelectorAll('.vt-bubble').length`)
    if (/traduite\\(s\\)/.test(status)) break
    if (/aucune planche|ignorée|refus|expirée/i.test(status)) break
  }

  await sleep(1600)
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: W, height: H })
  fs.writeFileSync(path.join(OUT, 'resultat.png'), image.toPNG())

  const report = await win.webContents.executeJavaScript('window.__vtReport || []')
  console.log('STATUS:', status)
  console.log('CALQUES:', zones, '· rapport:', report.length)
  for (const entry of report) {
    console.log(
      '  ·',
      JSON.stringify({
        type: entry.type,
        texte: entry.texte,
        boite: entry.boite,
        taille: entry.taille,
        fond: entry.fond,
        gradient: entry.gradient,
        fits: entry.fits,
        overflow: entry.overflow
      })
    )
  }

  const checks = []
  const check = (nom, ok, detail) => {
    checks.push({ nom, ok })
    console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} — ${detail}`)
  }
  const ignores = []
  const skip = (nom, detail) => {
    ignores.push(nom)
    console.log(`IGNORE ${nom} — ${detail}`)
  }
  const found = (pattern) => report.filter((entry) => pattern.test(entry.texte || ''))

  // Le jeton de traduction ne doit rien laisser d’appelable depuis la page :
  // posées sur window, la vision et les corrections pouvaient être invoquées par
  // un script tiers pendant les trente minutes de validité de la session.
  const portes = await win.webContents.executeJavaScript(
    `['__velaComicVision', '__velaComicEdits', '__velaComicLoadEdits'].filter((nom) => typeof window[nom] === 'function')`
  )
  check(
    'le pont BD ne dépasse pas la fermeture injectée',
    !Array.isArray(portes) || portes.length === 0,
    Array.isArray(portes) && portes.length ? `window porte encore ${portes.join(', ')}` : 'window ne porte que le pont sans jeton'
  )

  const burst = found(/RUN/i)[0]
  check('1 éclat lu et traduit', Boolean(burst && /COUREZ/i.test(burst.traduit) && burst.fits), burst ? `« ${burst.texte} » → « ${burst.traduit} » (${burst.taille} px)` : 'zone absente')

  const locks = report.filter((entry) => /KEEP OUT|IT IS LOCKED/i.test(entry.texte || ''))
  const split =
    locks.length >= 2 &&
    new Set(locks.map((entry) => entry.id)).size >= 2 &&
    Math.abs(locks[0].boite.x0 - locks[1].boite.x0) > 150
  check('2 bulles adjacentes séparées', split, `${locks.length} bulle(s) : ${locks.map((entry) => `« ${entry.texte} »`).join(' | ') || 'fusionnées'}`)

  const large = found(/^GO\.?$/i)[0]
  check('4 grande bulle, corps adapté', Boolean(large && large.taille > 24 && large.fits), large ? `${large.taille} px (ancien plafond 24, plafond relatif ${large.plafond})` : 'zone absente')

  const gradient = report.find((entry) => entry.gradient && Math.abs(entry.gradient.avant) >= 20)
  const kept = gradient && Math.abs(gradient.gradient.apres - gradient.gradient.avant) <= 10
  check('6 dégradé conservé', Boolean(kept), gradient ? `écart haut/bas avant ${gradient.gradient.avant}, après ${gradient.gradient.apres}` : 'aucune bulle en dégradé')

  const open = found(/NO ONE/i)[0]
  check('5 contour ouvert refermé', Boolean(open && /contour|enveloppe/.test(open.fond) && !open.warning), open ? `fond : ${open.fond}${open.warning ? ' — ' + open.warning : ''}` : 'zone absente')

  const plain = found(/SILENCE/i)[0]
  check('5bis dernier recours signalé', Boolean(plain && plain.fond === 'plaque arrondie' && plain.warning), plain ? `${plain.fond} — ${plain.warning}` : 'zone absente')

  const overflow = report.filter((entry) => !entry.fits)
  check('3 aucun débordement', overflow.length === 0, `${overflow.length} sur ${report.length}`)

  console.log(
    MOCK
      ? 'ÉVALUATION : NON ÉVALUÉE — traducteur factice, aucun chiffre de qualité ne peut être avancé.'
      : 'ÉVALUATION : traducteur réel, lancer `node scripts/comic-eval.mjs` pour les scores.'
  )

  const target = report.find((entry) => /IT IS LOCKED/i.test(entry.texte || ''))
  let editOk = false
  let editDetail = 'aucune bulle cible'
  if (target) {
    const beforeSize = target.taille
    await win.webContents.executeJavaScript(
      `window.__vtEdits.set(${JSON.stringify(target.id)}, { texte: 'ELLE EST FERMÉE, J’AI DIT.', dx: 4, dy: -2, echelle: 1.2 }); true`
    )
    const painted = (await win.webContents.executeJavaScript('window.__vtReport || []')).find((entry) => entry.id === target.id)
    const stored = await win.webContents.executeJavaScript('window.__vtEdits.export()')
    await win.webContents.executeJavaScript('document.querySelector("#vt-run").click(); true')
    await sleep(1500)
    const rerun = (await win.webContents.executeJavaScript('window.__vtReport || []')).find((entry) => entry.id === target.id)
    const edited = 'ELLE EST FERMÉE, J’AI DIT.'
    editOk = Boolean(painted && painted.traduit === edited && stored.includes('J’AI DIT') && rerun && rerun.traduit === edited)
    editDetail = `corps ${beforeSize} → ${painted ? painted.taille : '?'} px · après relance : ${rerun ? `« ${rerun.traduit} »` : 'absente'}`
    // Aller-retour disque : le fichier écrit par le pont doit être relu par le
    // script, pas seulement gardé en mémoire.
    const loaded = await win.webContents.executeJavaScript('window.__vtEdits.loadFromDisk()')
    const fichiers = fs.existsSync(EDITS_DIR) ? fs.readdirSync(EDITS_DIR) : []
    const disque = fichiers
      .map((nom) => fs.readFileSync(path.join(EDITS_DIR, nom), 'utf8'))
      .join('')
    const disqueOk = Boolean(
      loaded &&
        loaded.ok &&
        loaded.disque &&
        JSON.stringify(loaded.disque).includes('J’AI DIT') &&
        disque.includes('J’AI DIT')
    )
    editOk = editOk && disqueOk
    editDetail += ` · disque : ${fichiers.join(', ') || 'aucun fichier'} ${disqueOk ? 'relu' : 'NON relu'}`
    const exported = await win.webContents.executeJavaScript('window.__vtEdits.export()')
    fs.writeFileSync(path.join(OUT, 'edits-export.json'), exported)
    fs.writeFileSync(
      path.join(OUT, 'bubbles.json'),
      JSON.stringify(
        {
          planche: 'panel.png',
          zones: report.map((entry) => ({
            id: entry.id,
            type: entry.type,
            texte: entry.texte,
            traduit: entry.traduit,
            taille: entry.taille,
            boite: entry.boite
          }))
        },
        null,
        2
      )
    )
  }
  check('7 correction manuelle appliquée et conservée', editOk, editDetail)

  // Angle : même fonction que le rendu, sur des images d'angle connu.
  const angles = await win.webContents.executeJavaScript(
    '[0, 12, -20].map((deg) => Object.assign({ attendu: deg }, window.__vtTestAngle(deg)))'
  )
  const zonesAngles = await win.webContents.executeJavaScript('window.__vtAngles ? window.__vtAngles() : []')
  const tilted = (zonesAngles || []).find((zone) => /HEY/i.test(zone.texte || ''))
  const angleOk =
    Array.isArray(angles) && angles.length === 3 && angles.every((entry) => Math.abs(entry.deg - entry.attendu) <= 5)
  check(
    '8 angle estimé à ±5°',
    angleOk,
    `${(angles || []).map((entry) => `${entry.attendu}° → ${entry.deg}°`).join(' · ')}${
      tilted ? ` · planche inclinée : ${tilted.angleDeg}° (gain ${tilted.gain})` : ' · éclat incliné non lu'
    }`
  )

  // Crible des amas d'encre : rejets affichés et temps mesuré.
  const stats = await win.webContents.executeJavaScript('window.__vtStats || {}')
  const badges = await win.webContents.executeJavaScript(`document.querySelectorAll('.vt-reject').length`)
  const timing = await win.webContents.executeJavaScript('window.__vtTimeBursts()')
  if ((stats.rejets || 0) > 0) {
    check(
      '9 crible des éclats',
      badges === stats.rejets,
      `${stats.rejets} rejet(s), ${badges} cadre(s) gris · OCR ${stats.ocrMs} ms en ${stats.ocrCalls} appel(s) · cache ${stats.cacheHits}`
    )
  } else {
    skip('9 crible des éclats', `aucun amas rejeté · OCR ${stats.ocrMs} ms en ${stats.ocrCalls} appel(s)`)
  }
  if (timing) {
    console.log(
      `TEMPS ÉCLATS — sans crible ${timing.sans.ms} ms (${timing.sans.lus}/${timing.sans.essais} lus) · avec crible ${timing.avec.ms} ms (${timing.avec.lus} lus, ${timing.avec.rejets} rejetés)`
    )
  }

  // Vision : chemin page → pont → fournisseur. Sans fournisseur, on le dit.
  if (MOCK) {
    skip(
      '2 repli vision',
      `${VISION.appels} appel(s) tenté(s), 0 réussite — ${VISION.erreur || 'aucun fournisseur de vision configuré'}`
    )
  } else {
    check(
      '2 repli vision exercé',
      VISION.appels > 0 && VISION.ok > 0,
      `${VISION.appels} appel(s), ${VISION.ok} réussite(s)${VISION.erreur ? ` · ${VISION.erreur}` : ''}`
    )
  }

  if (errors.length) console.log('ERREURS CONSOLE:', errors.slice(0, 4))
  if (ignores.length) console.log(`TESTS IGNORÉS (${ignores.length}) : ${ignores.join(' · ')}`)
  if (!MOCK) console.log(`RAPPORT : modèle ${MODEL} · vision ${CFG.visionModel || MODEL} · ${new Date().toISOString()}`)

  const rows = []
  // Les boîtes du rapport sont en pixels du canvas agrandi (1600 de large) ;
  // la capture est à l'échelle de la planche (900), centrée dans 1000 px.
  const boxOf = (entry, pad = 24) => {
    const scale = 900 / ((entry.toile && entry.toile.w) || 900)
    return {
      cx: ((entry.boite.x0 + entry.boite.x1) / 2) * scale + 50,
      cy: ((entry.boite.y0 + entry.boite.y1) / 2) * scale,
      pad
    }
  }
  if (burst) rows.push({ titre: 'éclat (RUN, NOW!)', box: boxOf(burst) })
  if (locks.length) {
    const box = {
      x0: Math.min(...locks.map((entry) => entry.boite.x0)),
      x1: Math.max(...locks.map((entry) => entry.boite.x1)),
      y0: Math.min(...locks.map((entry) => entry.boite.y0)),
      y1: Math.max(...locks.map((entry) => entry.boite.y1))
    }
    rows.push({ titre: 'deux bulles adjacentes', box: boxOf({ boite: box, toile: locks[0].toile }) })
  }
  if (large) rows.push({ titre: 'grande bulle, peu de texte', box: boxOf(large) })
  if (gradient) rows.push({ titre: 'bulle en dégradé', box: boxOf(gradient) })
  if (open) rows.push({ titre: 'contour ouvert (enveloppe)', box: boxOf(open) })
  if (plain) rows.push({ titre: 'dernier recours (plaque arrondie)', box: boxOf(plain) })
  if (rows.length) comparison(rows)

  // La comparaison, rendue dans la même fenêtre puis capturée : un seul
  // processus pour la planche, le résultat et la comparaison.
  const size = JSON.parse(fs.readFileSync(path.join(OUT, 'comparaison.size.json'), 'utf8'))
  win.setContentSize(size.width, size.height)
  await win.loadFile(path.join(OUT, 'comparaison.html'))
  await sleep(700)
  const compareShot = await win.webContents.capturePage({ x: 0, y: 0, width: size.width, height: size.height })
  fs.writeFileSync(path.join(OUT, 'comparaison.png'), compareShot.toPNG())
  console.log(`comparaison : screenshots/comic-check/comparaison.png (${size.width}×${size.height})`)

  server.close()
  app.exit(checks.every((entry) => entry.ok) ? 0 : 1)
}

app.whenReady().then(main).catch((error) => {
  console.error('banc en échec :', error && error.message)
  app.exit(1)
})
