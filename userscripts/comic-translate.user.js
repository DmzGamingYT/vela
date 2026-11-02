// ==UserScript==
// @name         Traduction de BD — calque français
// @namespace    https://vela.local/userscripts
// @version      0.1.0
// @description  Détecte les planches, lit les bulles (OCR local), traduit en français et superpose un calque lisible.
// Injecté par Vela sur l'onglet actif (commande « Traduire la BD ») ; les lignes
// @match ne servent qu'à l'usage du script hors application.
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
    deep: true, // relit les bandes sans texte : les cartouches s'y perdent
    contexte: '', // genre, personnages, registre — transmis au traducteur
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
    .vt-bubble { position: absolute; pointer-events: none; }
    .vt-bubble[data-mode="below"] {
      display: flex; align-items: center; justify-content: center; overflow: hidden;
      text-align: center; line-height: 1.18; color: ${COLORS.ink};
      border: 1px solid ${COLORS.line}; border-radius: 8px; padding: 2px 5px;
      background: rgba(${COLORS.paper},.97); box-shadow: 0 1px 2px rgba(0,0,0,.14);
      pointer-events: auto; user-select: text; overflow-wrap: anywhere;
    }
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
      const worker = await Tesseract.createWorker(lang, 1, {
        logger: (message) => {
          if (message?.status === 'recognizing text') setStatus('lecture de la planche…')
        }
      })
      // Mode automatique (3) plutôt que « texte épars » (11) : mesuré sur une
      // planche de test, le 11 perdait les cartouches d'une seule ligne
      // (« THREE HOURS EARLIER ») sans mieux découper les bulles.
      await worker.setParameters({ preserve_interword_spaces: '1' })
      return worker
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
    const scale = bitmap.width < 1600 ? Math.min(2, 1600 / bitmap.width) : 1
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
        target.count += 1
        target.bbox.x0 = Math.min(target.bbox.x0, line.bbox.x0)
        target.bbox.y0 = Math.min(target.bbox.y0, line.bbox.y0)
        target.bbox.x1 = Math.max(target.bbox.x1, line.bbox.x1)
        target.bbox.y1 = Math.max(target.bbox.y1, line.bbox.y1)
      } else {
        groups.push({ text: line.text, bbox: { ...line.bbox }, count: 1 })
      }
    }
    return groups.filter((group) => group.text.replace(/[^\p{L}\p{N}]/gu, '').length >= 2)
  }

  async function ocrPass(canvas, params) {
    const worker = await ocrWorker()
    await worker.setParameters(params)
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
    return lines
  }

  /** Part de la boîte de `a` couverte par `b` : sert à ne pas compter deux fois. */
  function covered(a, b) {
    const x = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0))
    const y = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
    return (x * y) / Math.max(1, (a.x1 - a.x0) * (a.y1 - a.y0))
  }

  /** Bande de la planche où aucune ligne n'a été lue, assez haute pour du texte. */
  function silentBands(canvas, lines) {
    if (!lines.length) return []
    const sorted = [...lines].sort((a, b) => a.bbox.y0 - b.bbox.y0)
    const bands = []
    let cursor = 0
    for (const line of sorted) {
      if (line.bbox.y0 - cursor > 90) bands.push({ y0: cursor, y1: line.bbox.y0 })
      cursor = Math.max(cursor, line.bbox.y1)
    }
    if (canvas.height - cursor > 90) bands.push({ y0: cursor, y1: canvas.height })
    return bands.slice(0, 3)
  }

  function crop(canvas, y0, y1) {
    const part = document.createElement('canvas')
    part.width = canvas.width
    part.height = Math.max(1, y1 - y0)
    const context = part.getContext('2d', { willReadFrequently: true })
    context.fillStyle = '#fff'
    context.fillRect(0, 0, part.width, part.height)
    context.drawImage(canvas, 0, y0, canvas.width, part.height, 0, 0, canvas.width, part.height)
    return part
  }

  async function readBubbles(canvas) {
    const lines = await ocrPass(canvas, { preserve_interword_spaces: '1' })
    if (CFG.deep) {
      // Une cartouche seule dans une bande vide se perd dans la segmentation
      // d'ensemble. On relit chaque bande muette entre deux lignes trouvées :
      // c'est là qu'elle vit, et la relire isolée la fait remonter.
      for (const band of silentBands(canvas, lines)) {
        const extra = await ocrPass(crop(canvas, band.y0, band.y1), {
          tessedit_pageseg_mode: '11',
          preserve_interword_spaces: '1'
        })
        for (const line of extra) {
          const shifted = {
            ...line,
            bbox: {
              x0: line.bbox.x0,
              y0: line.bbox.y0 + band.y0,
              x1: line.bbox.x1,
              y1: line.bbox.y1 + band.y0
            }
          }
          if (!lines.some((seen) => covered(seen.bbox, shifted.bbox) > 0.5)) lines.push(shifted)
        }
      }
    }
    console.debug('[BD] OCR :', lines.length, 'ligne(s) ·', lines.map((line) => line.text).join(' | '))
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

  // Le contexte (genre, personnages, registre) vient du panneau : sans lui, le
  // modèle traduit chaque réplique hors situation et rate les tutoiements.
  const systemPrompt = (target) =>
    `Tu es traducteur de bande dessinée vers le ${target}. ` +
    'On te donne un JSON {"contexte":"…","repliques":[{"id":0,"texte":"…"}]} : « contexte » décrit ' +
    'l’œuvre (genre, personnages, registre) et vaut pour toute la planche. ' +
    'Traduis chaque réplique en gardant son id, en cohérence avec les répliques voisines du même ' +
    'envoi : mêmes personnes, mêmes tutoiements, mêmes noms. Registre parlé et naturel, phrases ' +
    'courtes qui tiennent dans une bulle, ponctuation de BD, noms propres inchangés, onomatopées ' +
    'rendues par un équivalent français. Corrige les erreurs d’OCR évidentes sans inventer de ' +
    'contenu. Réponds uniquement par un JSON de la forme {"traductions":[{"id":0,"texte":"…"}]}, ' +
    'sans commentaire.'

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
        {
          role: 'user',
          content: JSON.stringify({
            contexte: CFG.contexte || '',
            repliques: texts.map((texte, id) => ({ id, texte }))
          })
        }
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

  function report() {
    if (!Array.isArray(window.__vtReport)) window.__vtReport = []
    return window.__vtReport
  }

  const luminance = (data, offset) =>
    0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2]

  /**
   * Intérieur de la bulle : la zone claire connexe qui contient le texte.
   * Le seuil vient de la boîte de texte elle-même (quatre-vingtième centile), donc
   * une bulle grise ou un fond en dégradé passent aussi. Si la tache déborde du
   * cadre utile, on abandonne : un contour ouvert ferait fuir le remplissage
   * dans toute la planche.
   */
  function interiorMask(image, box) {
    const { data, width, height } = image
    const samples = []
    for (let y = Math.max(0, box.y0); y < Math.min(height, box.y1); y += 2) {
      for (let x = Math.max(0, box.x0); x < Math.min(width, box.x1); x += 2) {
        samples.push(luminance(data, (Math.round(y) * width + Math.round(x)) * 4))
      }
    }
    if (samples.length < 8) return null
    samples.sort((a, b) => a - b)
    const background = samples[Math.floor(samples.length * 0.8)]
    // Seuil serré : le fond de la planche (gris clair) ne doit pas rejoindre la
    // bulle blanche. Un contour fermé suffit à contenir le remplissage.
    const threshold = Math.max(110, background - 12)

    let seed = -1
    let best = -1
    for (let y = Math.max(0, Math.floor(box.y0)); y < Math.min(height, Math.ceil(box.y1)); y += 1) {
      for (let x = Math.max(0, Math.floor(box.x0)); x < Math.min(width, Math.ceil(box.x1)); x += 1) {
        const value = luminance(data, (y * width + x) * 4)
        if (value > best) {
          best = value
          seed = y * width + x
        }
      }
    }
    if (seed < 0) return null

    // Une queue qui fusionne avec le corps laisse une ouverture dans le contour :
    // le remplissage est donc confiné à une marge autour du texte, et une tache
    // trop étendue est refusée plus bas.
    const boxWidth = box.x1 - box.x0
    const boxHeight = box.y1 - box.y0
    // Le masque n'a pas besoin d'épouser toute la bulle : la plaque affiche
    // l'image d'origine avec le texte effacé, donc le contour, la queue et le
    // fond sont conservés tels quels. On borne la tache à la zone du texte.
    const padX = Math.max(18, Math.round(boxWidth * 0.32))
    const padY = Math.max(18, Math.round(boxHeight * 0.32))
    const limX0 = Math.max(0, Math.floor(box.x0 - padX))
    const limX1 = Math.min(width - 1, Math.ceil(box.x1 + padX))
    const limY0 = Math.max(0, Math.floor(box.y0 - padY))
    const limY1 = Math.min(height - 1, Math.ceil(box.y1 + padY))

    const mask = new Uint8Array(width * height)
    const stack = [seed]
    let area = 0
    while (stack.length) {
      const index = stack.pop()
      if (mask[index]) continue
      if (luminance(data, index * 4) < threshold) continue
      const x = index % width
      const y = (index - x) / width
      if (x < limX0 || x > limX1 || y < limY0 || y > limY1) continue
      mask[index] = 1
      area += 1
      if (x > limX0) stack.push(index - 1)
      if (x < limX1) stack.push(index + 1)
      if (y > limY0) stack.push(index - width)
      if (y < limY1) stack.push(index + width)
    }
    if (area < 400) return null

    // Le texte n'est pas du « fond » : sans rebouchage, le masque est percé de
    // trous et aucun rectangle n'y tient. On remplit les cavités en partant des
    // bords de la zone bornée ; l'extérieur de la bulle, lui, reste exclu.
    const solid = Uint8Array.from(mask)
    const seen = new Uint8Array(mask.length)
    const queue = []
    for (let x = limX0; x <= limX1; x += 1) {
      queue.push(limY0 * width + x, limY1 * width + x)
    }
    for (let y = limY0; y <= limY1; y += 1) {
      queue.push(y * width + limX0, y * width + limX1)
    }
    while (queue.length) {
      const index = queue.pop()
      if (seen[index] || solid[index]) continue
      seen[index] = 1
      const x = index % width
      const y = (index - x) / width
      if (x > limX0) queue.push(index - 1)
      if (x < limX1) queue.push(index + 1)
      if (y > limY0) queue.push(index - width)
      if (y < limY1) queue.push(index + width)
    }
    for (let y = limY0; y <= limY1; y += 1) {
      for (let x = limX0; x <= limX1; x += 1) {
        const index = y * width + x
        if (!solid[index] && !seen[index]) solid[index] = 1
      }
    }

    // Érosion d'un pixel : le contour d'origine (et la queue) restent intacts,
    // on ne repeint jamais dessus.
    const core = new Uint8Array(mask.length)
    let kept = 0
    let sumX = 0
    let sumY = 0
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x
        if (!solid[index]) continue
        if (!solid[index - 1] || !solid[index + 1] || !solid[index - width] || !solid[index + width]) continue
        core[index] = 1
        kept += 1
        sumX += x
        sumY += y
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
    if (kept < 300) return null
    // Une bulle tient autour de son texte ; une tache bien plus large est une
    // fuite dans la planche, pas une bulle.
    if (maxX - minX > boxWidth * 1.9 + 60 || maxY - minY > boxHeight * 2.2 + 60) return null
    return {
      mask: core,
      width,
      height,
      area: kept,
      cx: sumX / kept,
      cy: sumY / kept,
      minX,
      minY,
      maxX,
      maxY
    }
  }

  /**
   * Efface le texte et lui seul : par ligne, la teinte des pixels clairs de la
   * bulle remplace les pixels d'encre. Le fond garde son dégradé horizontal,
   * le contour, la queue et les éclats ne sont jamais touchés.
   */
  function inpaint(context, image, region) {
    const { data, width } = image
    for (let y = region.minY; y <= region.maxY; y += 1) {
      const row = []
      for (let x = region.minX; x <= region.maxX; x += 1) {
        const index = y * width + x
        if (!region.mask[index]) continue
        row.push({ index, value: luminance(data, index * 4) })
      }
      if (row.length < 6) continue
      const sorted = row.map((pixel) => pixel.value).sort((a, b) => a - b)
      const light = sorted[Math.floor(sorted.length * 0.75)]
      let red = 0
      let green = 0
      let blue = 0
      let count = 0
      for (const pixel of row) {
        if (Math.abs(pixel.value - light) > 14) continue
        const offset = pixel.index * 4
        red += data[offset]
        green += data[offset + 1]
        blue += data[offset + 2]
        count += 1
      }
      if (!count) continue
      red /= count
      green /= count
      blue /= count
      // -6 et non -28 : à -28 les bords antialiasés du texte restaient en place
      // et l'anglais transparaissait sous le français.
      for (const pixel of row) {
        if (pixel.value > light - 6) continue
        const offset = pixel.index * 4
        data[offset] = red
        data[offset + 1] = green
        data[offset + 2] = blue
      }
    }
    context.putImageData(image, 0, 0)
  }

  /**
   * Plus grand rectangle entièrement contenu dans le masque, centré sur son
   * centroïde. On pousse les bords un par un et on ne teste que le bord ajouté ;
   * la marge de 8 % garde le texte à distance du contour.
   */
  function inscribedRect(region) {
    const inside = (x, y) =>
      x >= 0 && y >= 0 && x < region.width && y < region.height && region.mask[y * region.width + x] === 1
    const cx = Math.round(region.cx)
    const cy = Math.round(region.cy)
    const maxHalfW = Math.max(4, Math.round((region.maxX - region.minX) * 0.35))
    const maxHalfH = Math.max(4, Math.round((region.maxY - region.minY) * 0.35))

    const columnFree = (x, y0, y1) => {
      for (let y = y0; y <= y1; y += 1) if (!inside(x, y)) return false
      return true
    }
    const rowFree = (y, x0, x1) => {
      for (let x = x0; x <= x1; x += 1) if (!inside(x, y)) return false
      return true
    }

    let halfW = 4
    let halfH = 4
    let grew = true
    while (grew && (halfW < maxHalfW || halfH < maxHalfH)) {
      grew = false
      if (halfW < maxHalfW && columnFree(cx - halfW - 1, cy - halfH, cy + halfH) && columnFree(cx + halfW + 1, cy - halfH, cy + halfH)) {
        halfW += 1
        grew = true
      }
      if (halfH < maxHalfH && rowFree(cy - halfH - 1, cx - halfW, cx + halfW) && rowFree(cy + halfH + 1, cx - halfW, cx + halfW)) {
        halfH += 1
        grew = true
      }
    }

    const margin = 0.08
    const w = halfW * 2 * (1 - margin)
    const h = halfH * 2 * (1 - margin)
    return { x: cx - w / 2, y: cy - h / 2, w, h, cx, cy }
  }

  function wrapLines(context, text, maxWidth) {
    const words = String(text).split(/\s+/).filter(Boolean)
    const lines = []
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line)
        line = word
      } else {
        line = candidate
      }
    }
    if (line) lines.push(line)
    return lines
  }

  /** Écrit le texte dans `target`, centré sur le rectangle ; renvoie les lignes. */
  function paintText(target, text, rect, size, color, font) {
    const context = target.getContext('2d', { willReadFrequently: true })
    context.font = `600 ${size}px ${font}`
    context.fillStyle = color
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    const lines = wrapLines(context, text, rect.w)
    const lineHeight = size * 1.18
    const first = rect.cy - ((lines.length - 1) * lineHeight) / 2
    lines.forEach((line, index) => context.fillText(line, rect.cx, first + index * lineHeight))
    return { lines, lineHeight }
  }

  /** Pixels de texte hors du masque : la mesure exacte du débordement. */
  function overflowPixels(probe, region) {
    const { data } = probe.getContext('2d').getImageData(0, 0, probe.width, probe.height)
    let outside = 0
    for (let index = 0, alpha = 3; index < data.length; index += 4, alpha += 4) {
      if (data[alpha] < 40) continue
      if (region.mask[index / 4] === 1) continue
      outside += 1
    }
    return outside
  }

  /** Recadre la bulle et rend l'image telle quelle dans un canvas de travail. */
  function plateFor(canvas, bubble) {
    const box = bubble.bbox
    const lineHeight = (box.y1 - box.y0) / Math.max(1, bubble.count || 1)
    const pad = Math.max(10, Math.round(lineHeight * 0.9))
    const sx = Math.max(0, Math.floor(box.x0 - pad))
    const sy = Math.max(0, Math.floor(box.y0 - pad))
    const sw = Math.min(canvas.width - sx, Math.ceil(box.x1 - box.x0 + pad * 2))
    const sh = Math.min(canvas.height - sy, Math.ceil(box.y1 - box.y0 + pad * 2))
    if (sw < 20 || sh < 20) return null
    const plate = document.createElement('canvas')
    plate.width = sw
    plate.height = sh
    const context = plate.getContext('2d', { willReadFrequently: true })
    context.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh)
    const image = context.getImageData(0, 0, sw, sh)
    const region = interiorMask(image, {
      x0: box.x0 - sx,
      y0: box.y0 - sy,
      x1: box.x1 - sx,
      y1: box.y1 - sy
    })
    if (!region) return { plate, context, region: null, sx, sy, sw, sh }
    inpaint(context, image, region)
    return { plate, context, region, sx, sy, sw, sh }
  }

  /** Repli quand la bulle n'est pas détectable : plaque arrondie, comme avant. */
  function drawPlain(layer, bubble, text, scaleX, scaleY, width, height, pad) {
    const node = document.createElement('div')
    node.className = 'vt-bubble'
    node.dataset.mode = CFG.mode
    node.textContent = text
    node.title = bubble.text
    node.style.left = `${bubble.bbox.x0 * scaleX - pad}px`
    node.style.top = `${bubble.bbox.y0 * scaleY - pad}px`
    node.style.width = `${width + pad * 2}px`
    node.style.minHeight = `${height + pad * 2}px`
    node.style.fontFamily = CFG.font
    node.style.fontSize = `${Math.min(22, Math.max(11, height * 0.5))}px`
    layer.appendChild(node)
    return node
  }

  function drawBubble(layer, img, bubble, text, canvas) {
    if (!text || !canvas) return
    const sourceWidth = canvas.width || img.naturalWidth || layer.clientWidth || 1
    const sourceHeight = canvas.height || img.naturalHeight || layer.clientHeight || 1
    const scaleX = layer.clientWidth / sourceWidth
    const scaleY = layer.clientHeight / sourceHeight
    const width = (bubble.bbox.x1 - bubble.bbox.x0) * scaleX
    const height = (bubble.bbox.y1 - bubble.bbox.y0) * scaleY
    if (width < 8 || height < 8) return
    const pad = Math.max(3, Math.min(10, height * 0.16))

    if (CFG.mode === 'below') {
      drawPlain(layer, bubble, text, scaleX, scaleY, width, height, pad)
      return
    }

    const work = plateFor(canvas, bubble)
    if (!work) return
    if (!work.region) {
      drawPlain(layer, bubble, text, scaleX, scaleY, width, height, pad)
      return
    }

    const rect = inscribedRect(work.region)
    const lineHeight = (bubble.bbox.y1 - bubble.bbox.y0) / Math.max(1, bubble.count || 1)
    let size = Math.min(24, Math.max(11, lineHeight * 0.95))
    let overflow = 0
    let fits = false
    while (size >= 10) {
      const probe = document.createElement('canvas')
      probe.width = work.plate.width
      probe.height = work.plate.height
      paintText(probe, text, rect, size, '#111', CFG.font)
      overflow = overflowPixels(probe, work.region)
      if (!overflow) {
        fits = true
        break
      }
      size -= 1
    }
    if (!fits) {
      paintText(work.plate, text, rect, 10, '#111', CFG.font)
      size = 10
    } else {
      paintText(work.plate, text, rect, size, '#111', CFG.font)
    }

    const node = work.plate
    node.className = 'vt-bubble'
    node.title = bubble.text
    node.setAttribute('role', 'img')
    node.setAttribute('aria-label', text)
    node.style.left = `${work.sx * scaleX}px`
    node.style.top = `${work.sy * scaleY}px`
    node.style.width = `${work.sw * scaleX}px`
    node.style.height = `${work.sh * scaleY}px`
    layer.appendChild(node)

    report().push({
      texte: text.slice(0, 60),
      plaque: { w: work.plate.width, h: work.plate.height },
      taille: size,
      fits,
      overflow,
      region: work.region.area,
      rect: { w: Math.round(rect.w), h: Math.round(rect.h) }
    })
  }

  function clearOverlays() {
    document.querySelectorAll('.vt-layer').forEach((layer) => layer.remove())
    window.__vtReport = []
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
    window.__vtReport = []
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
      <label class="vt-check"><input id="vt-deep" type="checkbox"> Relire les zones sans texte</label>
      <label for="vt-context">Contexte (genre, personnages, registre)</label>
      <input id="vt-context" type="text" spellcheck="false" placeholder="polar, deux frères, tutoiement">
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
    const deep = panel.querySelector('#vt-deep')
    const contextField = panel.querySelector('#vt-context')
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
    deep.checked = CFG.deep
    contextField.value = CFG.contexte || ''

    const sync = () => {
      CFG.provider = provider.value
      CFG.apiKey = key.value.trim()
      CFG.model = model.value.trim()
      CFG.source = source.value.trim() || 'eng'
      CFG.auto = auto.checked
      CFG.deep = deep.checked
      CFG.contexte = contextField.value.trim()
      saveConfig()
      if (CFG.auto) scheduleAuto()
    }
    provider.addEventListener('change', sync)
    key.addEventListener('change', sync)
    model.addEventListener('change', sync)
    source.addEventListener('change', sync)
    auto.addEventListener('change', sync)
    deep.addEventListener('change', sync)
    contextField.addEventListener('change', sync)

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

    // Hors Vela, l'accès console sert à déboguer. Sous Vela, il ouvrirait au JS
    // de la page un moyen de lancer des traductions sur la clé de l'utilisateur.
    if (!viaVela()) {
      window.velaComic = { translate: translatePage, clear: clearOverlays, config: CFG }
    }
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot, { once: true })
  else boot()
})()
