// ==UserScript==
// @name         Traduction de BD — calque français
// @namespace    https://vela.local/userscripts
// @version      0.1.0
// @description  Détecte les planches, lit les bulles (OCR local), traduit en français et superpose un calque lisible.
// @match        *://globalcomix.com/*
// @match        *://*.globalcomix.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      api.openai.com
// @connect      openrouter.ai
// @connect      localhost
// @connect      translation.googleapis.com
// @run-at       document-idle
// ==/UserScript==

/*
  COMMENT ÇA MARCHE
  1. Les planches sont des images : le texte des bulles n'existe pas dans le DOM.
     On le récupère par OCR local (Tesseract.js), bulle par bulle, avec les boîtes
     de chaque ligne regroupées en blocs.
  2. Les textes partent ensuite vers le traducteur choisi : une API compatible
     OpenAI (OpenAI, OpenRouter, Ollama/LM Studio en local) ou Google Cloud
     Translation v2. La clé reste dans le stockage du userscript, jamais publiée.
  3. Un calque est posé au-dessus de la planche : chaque bulle reçoit un fond
     clair qui masque l'original et le texte français ajusté à la boîte.

  LIMITES ASSUMÉES
  - Lecteurs qui dessinent la planche dans un <canvas> ou un WebGL : non pris en
    charge, il n'y a pas d'image à relire. Idem pour les pages protégées par un
    flux chiffré côté client.
  - OCR : la qualité dépend de la résolution. Les pages très petites sont
    agrandies avant lecture, les onomatopées et les polices BD fantaisistes
    restent difficiles.
  - Traduction automatique : relire avant de considérer le résultat comme fidèle.
  - Usage personnel. Traduire une œuvre ne donne aucun droit dessus : respectez
    les conditions du site et ne rediffusez pas les planches traduites.

  PERSONNALISER
  - Ajoutez d'autres sites avec une ligne @match (même famille de sélecteurs).
  - Fournisseur « google » : Google Cloud Translation v2, facturé par Google.
  - Fournisseur « ollama » : http://localhost:11434/v1/chat/completions, aucune
    donnée ne quitte la machine, qualité variable selon le modèle.
*/

;(() => {
  'use strict'

  const PRESETS = {
    openai: { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
    openrouter: { endpoint: 'https://openrouter.ai/api/v1/chat/completions', model: 'openai/gpt-4o-mini' },
    ollama: { endpoint: 'http://localhost:11434/v1/chat/completions', model: 'llama3.1' },
    google: { endpoint: 'https://translation.googleapis.com/language/translate/v2', model: '' }
  }

  const DEFAULTS = {
    provider: 'openai',
    apiKey: '',
    model: '',
    target: 'fr',
    source: 'eng', // langue des planches pour Tesseract : eng, ita, spa, fra, jpn…
    auto: false,
    mode: 'cover', // cover = masque la bulle d'origine · below = traduction sous la bulle
    minSize: 360, // côté minimum d'une image pour être considérée comme une planche
    maxPanels: 12,
    opacity: 0.95,
    font: '"Comic Sans MS", "Trebuchet MS", system-ui, sans-serif'
  }

  const CFG = { ...DEFAULTS, ...(GM_getValue('cfg', {}) || {}) }
  const saveConfig = () => GM_setValue('cfg', CFG)

  const COLORS = { ink: '#111', line: 'rgba(0,0,0,.12)', paper: '255,255,255' }

  // Images déjà traitées, avec la source exacte qui a été lue : si le lecteur
  // change le src d'une même <img> (page suivante), on la retraite.
  let done = new WeakMap()
  const layers = new WeakMap()
  let workerPromise = null
  let workerLang = ''

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const near = (img) => {
    const rect = img.getBoundingClientRect()
    return rect.bottom > -window.innerHeight && rect.top < window.innerHeight * 2
  }

  /* ---------------------------------------------------------------- styles */

  const CSS = `
    .vt-layer { position: absolute; pointer-events: none; z-index: 2147483000; }
    .vt-bubble {
      position: absolute; box-sizing: border-box; display: flex; align-items: center;
      justify-content: center; overflow: hidden; text-align: center; line-height: 1.18;
      color: ${COLORS.ink}; border: 1px solid ${COLORS.line}; border-radius: 12px;
      box-shadow: 0 1px 2px rgba(0,0,0,.14); pointer-events: auto; user-select: text;
      padding: 2px 5px; overflow-wrap: anywhere;
    }
    .vt-bubble[data-mode="below"] { border-radius: 8px; }
    .vt-hidden .vt-layer { display: none !important; }
    .vt-launch {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483601;
      width: 40px; height: 40px; border-radius: 50%; border: 1px solid rgba(255,255,255,.14);
      background: rgba(21,21,24,.92); color: #f3f1ee; font: 600 11px/1 system-ui, sans-serif;
      cursor: pointer; box-shadow: 0 8px 24px rgba(0,0,0,.3);
    }
    .vt-panel {
      position: fixed; right: 16px; bottom: 64px; z-index: 2147483602; width: 268px;
      padding: 12px; border-radius: 14px; border: 1px solid rgba(255,255,255,.12);
      background: rgba(21,21,24,.96); color: #f3f1ee; box-shadow: 0 18px 48px rgba(0,0,0,.4);
      font: 12px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
      backdrop-filter: blur(14px);
    }
    .vt-panel h2 { margin: 0 0 8px; font-size: 12px; font-weight: 600; letter-spacing: .01em; }
    .vt-panel label { display: block; margin: 8px 0 3px; color: rgba(243,241,238,.62); font-size: 11px; }
    .vt-panel select, .vt-panel input {
      width: 100%; box-sizing: border-box; padding: 6px 8px; border-radius: 8px;
      border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06);
      color: inherit; font: inherit;
    }
    .vt-panel .vt-row { display: flex; gap: 6px; margin-top: 10px; }
    .vt-panel button {
      flex: 1; padding: 6px 8px; border-radius: 8px; cursor: pointer;
      border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08);
      color: inherit; font: inherit;
    }
    .vt-panel button.vt-primary { background: #5b5bd6; border-color: #5b5bd6; color: #fff; }
    .vt-panel .vt-status { margin-top: 9px; min-height: 15px; color: rgba(243,241,238,.62); font-size: 11px; }
    .vt-panel .vt-note { margin: 0 0 8px; color: rgba(243,241,238,.62); font-size: 11px; line-height: 1.4; }
    .vt-panel .vt-check { display: flex; align-items: center; gap: 6px; margin-top: 9px; color: rgba(243,241,238,.8); }
    .vt-panel .vt-check input { width: auto; }
    @media (prefers-reduced-motion: reduce) { .vt-panel, .vt-bubble { transition: none !important; } }
  `

  function injectStyle() {
    if (document.querySelector('style[data-vt-style]')) return
    const style = document.createElement('style')
    style.dataset.vtStyle = ''
    style.textContent = CSS
    document.documentElement.appendChild(style)
  }

  /* ------------------------------------------------------- détection planches */

  function panelSource(img) {
    return img.currentSrc || img.src || ''
  }

  function looksLikePanel(img) {
    const src = panelSource(img)
    if (!src || !/^(https?:|blob:|data:image)/i.test(src)) return false
    if (img.closest('header, nav, footer, .vt-layer')) return false
    if (done.get(img) === src) return false
    const width = img.naturalWidth || img.clientWidth
    const height = img.naturalHeight || img.clientHeight
    if (width < CFG.minSize || height < CFG.minSize) return false
    // Une planche est haute ou carrée ; on écarte les bannières et vignettes.
    return height / width > 0.45
  }

  function findPanels() {
    const found = []
    for (const img of document.images) {
      if (found.length >= CFG.maxPanels) break
      if (!near(img)) continue
      if (looksLikePanel(img)) found.push(img)
    }
    return found
  }

  /* ------------------------------------------------------------------ calque */

  function layerFor(img) {
    const existing = layers.get(img)
    if (existing && existing.isConnected) return existing
    const parent = img.parentElement
    if (!parent) return null
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative'

    const layer = document.createElement('div')
    layer.className = 'vt-layer'
    layer.dataset.vtLayer = ''
    parent.appendChild(layer)
    layers.set(img, layer)

    const place = () => {
      if (!img.isConnected) return
      const ir = img.getBoundingClientRect()
      const pr = parent.getBoundingClientRect()
      layer.style.left = `${ir.left - pr.left + parent.scrollLeft}px`
      layer.style.top = `${ir.top - pr.top + parent.scrollTop}px`
      layer.style.width = `${ir.width}px`
      layer.style.height = `${ir.height}px`
    }
    place()

    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(place)
      observer.observe(img)
    }
    addEventListener('resize', place, { passive: true })
    return layer
  }

  /* -------------------------------------------------------------------- OCR */

  let statusEl = null
  function setStatus(text) {
    if (statusEl) statusEl.textContent = text
    console.debug('[BD]', text)
  }

  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract)
    return new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
      script.onload = () => resolve(window.Tesseract)
      script.onerror = () => reject(new Error('Tesseract.js n’a pas pu être chargé'))
      document.head.appendChild(script)
    })
  }

  async function ocrWorker() {
    const lang = CFG.source || 'eng'
    if (workerPromise && workerLang === lang) return workerPromise
    if (workerPromise) {
      try {
        const old = await workerPromise
        await old.terminate()
      } catch {
        /* worker déjà arrêté */
      }
    }
    workerLang = lang
    workerPromise = (async () => {
      const Tesseract = await loadTesseract()
      return Tesseract.createWorker(lang, 1, {
        logger: (message) => {
          if (message?.status === 'recognizing text') setStatus('lecture de la planche…')
        }
      })
    })()
    return workerPromise
  }

  /** Récupère les octets de l'image sans polluer le canvas (CORS). */
  function requestBinary(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        responseType: 'blob',
        timeout: 30000,
        onload: (response) =>
          response.status >= 200 && response.status < 300
            ? resolve(response.response)
            : reject(new Error(`image HTTP ${response.status}`)),
        onerror: () => reject(new Error('image inaccessible')),
        ontimeout: () => reject(new Error('image : délai dépassé'))
      })
    })
  }

  /** Bitmap non teinté + agrandissement modéré pour les pages basses résolutions. */
  async function canvasFrom(url) {
    const blob = /^(blob:|data:)/i.test(url) ? await (await fetch(url)).blob() : await requestBinary(url)
    const bitmap = await createImageBitmap(blob)
    const scale = bitmap.width < 1400 ? Math.min(2, 1400 / bitmap.width) : 1
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    // Les boîtes de l'OCR sont exprimées dans le canvas, pas dans l'image affichée.
    return { canvas, scale }
  }

  /** Regroupe les lignes d'un même bloc (bulle) par proximité verticale et recouvrement. */
  function groupLines(lines) {
    const groups = []
    const sorted = [...lines].sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0)
    for (const line of sorted) {
      const height = line.bbox.y1 - line.bbox.y0
      let target = null
      let bestGap = Infinity
      for (const group of groups) {
        const box = group.bbox
        const gap = line.bbox.y0 - box.y1
        if (gap < -height * 0.6 || gap > height * 1.1) continue
        const overlap = Math.min(box.x1, line.bbox.x1) - Math.max(box.x0, line.bbox.x0)
        const narrowest = Math.min(box.x1 - box.x0, line.bbox.x1 - line.bbox.x0)
        if (narrowest <= 0 || overlap < narrowest * 0.3) continue
        if (gap < bestGap) {
          bestGap = gap
          target = group
        }
      }
      if (target) {
        target.text += ` ${line.text}`
        target.bbox.x0 = Math.min(target.bbox.x0, line.bbox.x0)
        target.bbox.y0 = Math.min(target.bbox.y0, line.bbox.y0)
        target.bbox.x1 = Math.max(target.bbox.x1, line.bbox.x1)
        target.bbox.y1 = Math.max(target.bbox.y1, line.bbox.y1)
      } else {
        groups.push({ text: line.text, bbox: { ...line.bbox } })
      }
    }
    return groups.filter((group) => group.text.replace(/[^\p{L}\p{N}]/gu, '').length >= 2)
  }

  async function readBubbles(canvas) {
    const worker = await ocrWorker()
    const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true })
    const lines = []
    for (const block of data.blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        for (const line of paragraph.lines || []) {
          const text = (line.text || '').trim()
          if (text.length >= 2 && (line.confidence ?? 100) >= 40) {
            lines.push({ text, bbox: line.bbox, confidence: line.confidence })
          }
        }
      }
    }
    return groupLines(lines)
  }

  /** Lit une planche, traduit ses bulles et pose le calque. */
  async function translatePanel(img) {
    const source = panelSource(img)
    if (!source) return
    const layer = layerFor(img)
    if (!layer) return
    setStatus('préparation de la planche…')
    try {
      const { canvas } = await canvasFrom(source)
      const bubbles = await readBubbles(canvas)
      if (!bubbles.length) {
        done.set(img, source)
        setStatus('aucun texte détecté sur cette planche')
        return
      }
      setStatus(`${bubbles.length} bulle(s) — traduction…`)
      const translated = await translateTexts(bubbles.map((bubble) => bubble.text))
      bubbles.forEach((bubble, index) => drawBubble(layer, img, bubble, translated[index], canvas))
      done.set(img, source)
      setStatus(`${bubbles.length} bulle(s) traduite(s)`)
    } catch (error) {
      console.warn('[BD] planche ignorée', error)
      setStatus(`planche ignorée : ${error.message}`)
      layer.remove()
      layers.delete(img)
    }
  }

  /* ------------------------------------------------------------ traduction */

  const memo = new Map(Object.entries(GM_getValue('memo', {}) || {}))
  let memoTimer = null
  const memoKey = (text) => `${CFG.target}|${text}`

  function remember(text, output) {
    memo.set(memoKey(text), output)
    clearTimeout(memoTimer)
    memoTimer = setTimeout(() => {
      GM_setValue('memo', Object.fromEntries([...memo].slice(-800)))
    }, 800)
  }

  function request(options) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        timeout: 60000,
        ...options,
        onload: (response) => {
          if (response.status >= 200 && response.status < 300) resolve(response)
          else reject(new Error(`traducteur HTTP ${response.status} : ${String(response.responseText).slice(0, 140)}`))
        },
        onerror: () => reject(new Error('traducteur injoignable')),
        ontimeout: () => reject(new Error('traducteur : délai dépassé'))
      })
    })
  }

  const systemPrompt = (target) =>
    `Tu es traducteur de bande dessinée vers le ${target}. ` +
    'On te donne un tableau JSON de répliques extraites par OCR : {"repliques":[{"id":0,"texte":"…"}]}. ' +
    'Traduis chaque réplique en gardant son id. Registre parlé et naturel, phrases courtes, ' +
    'ponctuation de BD, noms propres inchangés, onomatopées rendues par un équivalent français. ' +
    'Corrige les erreurs d’OCR évidentes sans inventer de contenu. ' +
    'Réponds uniquement par un JSON de la forme {"traductions":[{"id":0,"texte":"…"}]}, sans commentaire.'

  // Injecté par Vela, le script n'a pas de clé : le pont de l'application traduit
  // avec le fournisseur réglé dans Réglages › Modèles.
  const viaVela = () => Boolean(window.__velaComicBridge)

  async function llmTranslate(texts) {
    const preset = PRESETS[CFG.provider] || PRESETS.openai
    if (!viaVela() && CFG.provider !== 'ollama' && !CFG.apiKey) {
      throw new Error('ajoutez une clé API dans le panneau')
    }
    const payload = {
      model: CFG.model || preset.model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt(CFG.target) },
        { role: 'user', content: JSON.stringify({ repliques: texts.map((texte, id) => ({ id, texte })) }) }
      ]
    }
    const response = await request({
      method: 'POST',
      url: preset.endpoint,
      headers: {
        'Content-Type': 'application/json',
        ...(CFG.apiKey ? { Authorization: `Bearer ${CFG.apiKey}` } : {})
      },
      data: JSON.stringify(payload)
    })
    const body = JSON.parse(response.responseText)
    const content = body.choices?.[0]?.message?.content ?? ''
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('réponse du modèle illisible')
    const parsed = JSON.parse(match[0])
    const list = parsed.traductions || parsed.translations || []
    const output = new Array(texts.length)
    for (const item of list) {
      const index = Number(item.id)
      if (Number.isInteger(index) && index >= 0 && index < texts.length) {
        output[index] = item.texte ?? item.text ?? ''
      }
    }
    return texts.map((text, index) => output[index] || text)
  }

  function decodeEntities(value) {
    const area = document.createElement('textarea')
    area.innerHTML = value
    return area.value
  }

  async function googleTranslate(texts) {
    if (!CFG.apiKey) throw new Error('ajoutez une clé Google Cloud Translation')
    const url = `${PRESETS.google.endpoint}?key=${encodeURIComponent(CFG.apiKey)}`
    const response = await request({
      method: 'POST',
      url,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ q: texts, target: CFG.target, format: 'text' })
    })
    const body = JSON.parse(response.responseText)
    const translations = body.data?.translations || []
    return texts.map((text, index) =>
      translations[index] ? decodeEntities(translations[index].translatedText) : text
    )
  }

  async function translateTexts(texts) {
    const output = new Array(texts.length)
    const pending = []
    texts.forEach((text, index) => {
      const hit = memo.get(memoKey(text))
      if (hit) output[index] = hit
      else pending.push({ index, text })
    })
    if (pending.length) {
      const translated =
        CFG.provider === 'google'
          ? await googleTranslate(pending.map((item) => item.text))
          : await llmTranslate(pending.map((item) => item.text))
      pending.forEach((item, position) => {
        output[item.index] = translated[position] || item.text
        remember(item.text, output[item.index])
      })
    }
    return output
  }

  /* ----------------------------------------------------------------- dessin */

  function fitText(node) {
    let size = Math.min(26, Math.max(10, node.clientHeight * 0.58))
    node.style.fontSize = `${size}px`
    let guard = 32
    while (
      guard-- > 0 &&
      size > 8 &&
      (node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1)
    ) {
      size -= 1
      node.style.fontSize = `${size}px`
    }
  }

  function drawBubble(layer, img, bubble, text, canvas) {
    if (!text) return
    // L'OCR lit un canvas (parfois agrandi) : on ramène ses boîtes à la taille affichée.
    const sourceWidth = canvas?.width || img.naturalWidth || layer.clientWidth || 1
    const sourceHeight = canvas?.height || img.naturalHeight || layer.clientHeight || 1
    const scaleX = layer.clientWidth / sourceWidth
    const scaleY = layer.clientHeight / sourceHeight
    const width = (bubble.bbox.x1 - bubble.bbox.x0) * scaleX
    const height = (bubble.bbox.y1 - bubble.bbox.y0) * scaleY
    if (width < 8 || height < 8) return

    const pad = Math.max(2, Math.min(9, height * 0.18))
    const node = document.createElement('div')
    node.className = 'vt-bubble'
    node.dataset.mode = CFG.mode
    node.textContent = text
    node.title = bubble.text
    node.setAttribute('lang', CFG.target)
    node.style.left = `${bubble.bbox.x0 * scaleX - pad}px`
    node.style.top = `${bubble.bbox.y0 * scaleY - pad}px`
    node.style.width = `${width + pad * 2}px`
    node.style.height = `${height + pad * 2}px`
    node.style.background =
      CFG.mode === 'cover'
        ? `rgba(${COLORS.paper},${CFG.opacity})`
        : `rgba(${COLORS.paper},0.97)`
    node.style.fontFamily = CFG.font
    if (CFG.mode === 'below') {
      node.style.top = `${bubble.bbox.y1 * scaleY + 4}px`
      node.style.height = 'auto'
      node.style.minHeight = `${height + pad}px`
    }
    layer.appendChild(node)
    fitText(node)
  }

  function clearOverlays() {
    document.querySelectorAll('.vt-layer').forEach((layer) => layer.remove())
    done = new WeakMap()
    setStatus('calques effacés')
  }

  /* ------------------------------------------------------------------ file */

  const queue = []
  let pumping = false

  function enqueue(img) {
    const source = panelSource(img)
    if (!source || done.get(img) === source || queue.includes(img)) return
    queue.push(img)
    void pump()
  }

  async function pump() {
    if (pumping) return
    pumping = true
    try {
      while (queue.length) {
        const img = queue.shift()
        if (img.isConnected) await translatePanel(img)
        await sleep(120)
      }
    } finally {
      pumping = false
    }
  }

  function translatePage() {
    const panels = findPanels()
    if (!panels.length) {
      setStatus('aucune planche détectée')
      return
    }
    setStatus(`${panels.length} planche(s) en file`)
    panels.forEach(enqueue)
  }

  let autoTimer = null
  function scheduleAuto() {
    if (!CFG.auto) return
    clearTimeout(autoTimer)
    autoTimer = setTimeout(() => {
      findPanels().forEach(enqueue)
    }, 900)
  }

  /* -------------------------------------------------------------------- UI */

  let panel = null
  let launcher = null

  function buildUI() {
    launcher = document.createElement('button')
    launcher.type = 'button'
    launcher.className = 'vt-launch'
    launcher.textContent = 'BD'
    launcher.title = 'Traduire les planches (Alt+T)'
    launcher.addEventListener('click', () => {
      panel.hidden = false
      launcher.hidden = true
    })
    document.documentElement.appendChild(launcher)

    panel = document.createElement('div')
    panel.className = 'vt-panel'
    panel.hidden = true
    panel.innerHTML = `
      <h2>Traduction de BD</h2>
      <div data-provider-fields>
        <label for="vt-provider">Traducteur</label>
        <select id="vt-provider">
          <option value="openai">OpenAI</option>
          <option value="openrouter">OpenRouter</option>
          <option value="ollama">Ollama (local)</option>
          <option value="google">Google Cloud Translation</option>
        </select>
        <label for="vt-key">Clé API</label>
        <input id="vt-key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-… (inutile en local)">
        <label for="vt-model">Modèle</label>
        <input id="vt-model" type="text" spellcheck="false" placeholder="gpt-4o-mini">
      </div>
      <label for="vt-source">Langue des planches (OCR)</label>
      <input id="vt-source" type="text" spellcheck="false" placeholder="eng, ita, spa, fra, jpn…">
      <label class="vt-check"><input id="vt-auto" type="checkbox"> Traduire au fil du chargement</label>
      <div class="vt-row">
        <button type="button" class="vt-primary" id="vt-run">Traduire</button>
        <button type="button" id="vt-clear">Effacer</button>
        <button type="button" id="vt-close">Fermer</button>
      </div>
      <div class="vt-status" id="vt-status">prêt</div>
    `
    document.documentElement.appendChild(panel)

    const provider = panel.querySelector('#vt-provider')
    const key = panel.querySelector('#vt-key')
    const model = panel.querySelector('#vt-model')
    const source = panel.querySelector('#vt-source')
    const auto = panel.querySelector('#vt-auto')
    statusEl = panel.querySelector('#vt-status')

    // Dans Vela, le fournisseur et la clé vivent dans Réglages › Modèles.
    if (viaVela()) {
      const fields = panel.querySelector('[data-provider-fields]')
      fields?.remove()
      const note = document.createElement('p')
      note.className = 'vt-note'
      note.textContent = 'Traduction via Vela : le modèle se choisit dans Réglages › Modèles.'
      panel.querySelector('h2')?.after(note)
    }

    provider.value = CFG.provider
    key.value = CFG.apiKey
    model.value = CFG.model
    source.value = CFG.source
    auto.checked = CFG.auto

    const sync = () => {
      CFG.provider = provider.value
      CFG.apiKey = key.value.trim()
      CFG.model = model.value.trim()
      CFG.source = source.value.trim() || 'eng'
      CFG.auto = auto.checked
      saveConfig()
      if (CFG.auto) scheduleAuto()
    }
    provider.addEventListener('change', sync)
    key.addEventListener('change', sync)
    model.addEventListener('change', sync)
    source.addEventListener('change', sync)
    auto.addEventListener('change', sync)

    panel.querySelector('#vt-run').addEventListener('click', () => {
      sync()
      translatePage()
    })
    panel.querySelector('#vt-clear').addEventListener('click', clearOverlays)
    panel.querySelector('#vt-close').addEventListener('click', () => {
      panel.hidden = true
      launcher.hidden = false
    })
  }

  /* ------------------------------------------------------------------ boot */

  function boot() {
    injectStyle()
    buildUI()

    const observer = new MutationObserver(scheduleAuto)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'srcset']
    })
    addEventListener('scroll', scheduleAuto, { passive: true })

    addEventListener('keydown', (event) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const key = event.key.toLowerCase()
      if (key === 't') {
        event.preventDefault()
        translatePage()
      }
      if (key === 'h') {
        event.preventDefault()
        document.documentElement.classList.toggle('vt-hidden')
      }
    })

    if (CFG.auto) scheduleAuto()

    // Accès console pour déboguer sans passer par l'interface.
    window.velaComic = { translate: translatePage, clear: clearOverlays, config: CFG }
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot, { once: true })
  else boot()
})()
