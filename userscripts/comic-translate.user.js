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
    .vt-bubble[data-mode="cover"] {
      display: flex; align-items: center; justify-content: center; overflow: hidden;
      text-align: center; line-height: 1.18; color: ${COLORS.ink};
      border: 2px solid rgba(17,17,17,.85); border-radius: 18px; padding: 2px 7px;
      background: rgba(${COLORS.paper},.99); box-shadow: 0 1px 3px rgba(0,0,0,.18);
      overflow-wrap: anywhere;
    }
    .vt-bubble .vt-warn {
      position: absolute; left: 2px; top: -15px; padding: 2px 5px; border-radius: 4px;
      background: rgba(255,255,255,.96); color: #a33232; border: 1px solid rgba(163,50,50,.35);
      font: 600 9px/1.1 system-ui, sans-serif; white-space: nowrap;
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

  /* -------------------------------------------- analyse géométrique de la page */

  /** Luminance et pixels d'une planche, relus une seule fois. */
  function panelPixels(canvas) {
    const image = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height)
    const { data, width, height } = image
    const lum = new Uint8Array(width * height)
    for (let index = 0; index < lum.length; index += 1) {
      lum[index] = (data[index * 4] * 299 + data[index * 4 + 1] * 587 + data[index * 4 + 2] * 114) / 1000
    }
    return { image, lum, width, height }
  }

  /** Seuil d'encre : entre le trait et le papier, pas une valeur absolue. */
  function inkThreshold(lum) {
    const hist = new Uint32Array(256)
    for (let index = 0; index < lum.length; index += 1) hist[lum[index]] += 1
    const at = (share) => {
      let seen = 0
      for (let value = 0; value < 256; value += 1) {
        seen += hist[value]
        if (seen >= lum.length * share) return value
      }
      return 255
    }
    const dark = at(0.01)
    const light = at(0.9)
    return Math.max(dark + 40, Math.round((dark + light) / 2))
  }

  /** Composantes connexes 4-voisines d'un masque binaire, avec leur boîte. */
  function regionsOf(flag, width, height, limit) {
    const labels = new Int32Array(flag.length).fill(-1)
    const regions = []
    const stack = []
    for (let start = 0; start < flag.length; start += 1) {
      if (!flag[start] || labels[start] >= 0) continue
      if (regions.length >= limit) break
      const id = regions.length
      const region = { id, area: 0, x0: width, y0: height, x1: -1, y1: -1, border: false, pixels: [] }
      labels[start] = id
      stack.push(start)
      while (stack.length) {
        const index = stack.pop()
        const x = index % width
        const y = (index - x) / width
        region.area += 1
        region.pixels.push(index)
        if (x < region.x0) region.x0 = x
        if (x > region.x1) region.x1 = x
        if (y < region.y0) region.y0 = y
        if (y > region.y1) region.y1 = y
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) region.border = true
        if (x > 0 && flag[index - 1] && labels[index - 1] < 0) {
          labels[index - 1] = id
          stack.push(index - 1)
        }
        if (x < width - 1 && flag[index + 1] && labels[index + 1] < 0) {
          labels[index + 1] = id
          stack.push(index + 1)
        }
        if (y > 0 && flag[index - width] && labels[index - width] < 0) {
          labels[index - width] = id
          stack.push(index - width)
        }
        if (y < height - 1 && flag[index + width] && labels[index + width] < 0) {
          labels[index + width] = id
          stack.push(index + width)
        }
      }
      regions.push(region)
    }
    return { labels, regions }
  }

  function dilateLine(flag, width, height, radius, horizontal) {
    const out = new Uint8Array(flag.length)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let on = 0
        for (let step = -radius; step <= radius && !on; step += 1) {
          const nx = horizontal ? x + step : x
          const ny = horizontal ? y : y + step
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          if (flag[ny * width + nx]) on = 1
        }
        out[y * width + x] = on
      }
    }
    return out
  }

  function erodeLine(flag, width, height, radius, horizontal) {
    const inverse = new Uint8Array(flag.length)
    for (let index = 0; index < flag.length; index += 1) inverse[index] = flag[index] ? 0 : 1
    const grown = dilateLine(inverse, width, height, radius, horizontal)
    const out = new Uint8Array(flag.length)
    for (let index = 0; index < flag.length; index += 1) out[index] = grown[index] ? 0 : 1
    return out
  }

  /** Fermeture : un contour interrompu (trou, antialias) se referme. */
  function closing(flag, width, height, radius) {
    let current = flag
    for (const horizontal of [false, true]) current = dilateLine(current, width, height, radius, horizontal)
    for (const horizontal of [false, true]) current = erodeLine(current, width, height, radius, horizontal)
    return current
  }

  /** Part du pourtour d'une région qui touche de l'encre : un contour fermé. */
  function borderIsInk(region, labels, closed, width) {
    let edge = 0
    let darkEdge = 0
    for (const index of region.pixels) {
      const x = index % width
      const neighbours = [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, index - width, index + width]
      for (const neighbour of neighbours) {
        if (neighbour < 0 || neighbour >= labels.length) continue
        if (labels[neighbour] === region.id) continue
        edge += 1
        if (closed[neighbour]) darkEdge += 1
      }
    }
    return edge ? darkEdge / edge : 0
  }

  /** Intérieur plein (texte rebouché) d'une région, en coordonnées locales. */
  function solidMask(region, width) {
    const w = region.x1 - region.x0 + 1
    const h = region.y1 - region.y0 + 1
    if (w < 4 || h < 4) return null
    const mask = new Uint8Array(w * h)
    for (const index of region.pixels) {
      const x = index % width
      const y = (index - x) / width
      mask[(y - region.y0) * w + (x - region.x0)] = 1
    }
    const seen = new Uint8Array(w * h)
    const queue = []
    for (let x = 0; x < w; x += 1) queue.push(x, (h - 1) * w + x)
    for (let y = 0; y < h; y += 1) queue.push(y * w, y * w + w - 1)
    while (queue.length) {
      const index = queue.pop()
      if (mask[index] || seen[index]) continue
      seen[index] = 1
      const x = index % w
      const y = (index - x) / w
      if (x > 0) queue.push(index - 1)
      if (x < w - 1) queue.push(index + 1)
      if (y > 0) queue.push(index - w)
      if (y < h - 1) queue.push(index + w)
    }
    let area = 0
    let sumX = 0
    let sumY = 0
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const index = y * w + x
        if (!mask[index] && !seen[index]) mask[index] = 1
        if (!mask[index]) continue
        area += 1
        sumX += x
        sumY += y
      }
    }
    if (area < 400) return null
    return {
      mask,
      x0: region.x0,
      y0: region.y0,
      w,
      h,
      area,
      cx: sumX / area,
      cy: sumY / area,
      minX: 0,
      minY: 0,
      maxX: w - 1,
      maxY: h - 1,
      width: w,
      height: h
    }
  }

  /**
   * Découpe la planche en bulles AVANT de lire le texte : une bulle est
   * l'intérieur clair d'un contour fermé (composante connexe). Deux bulles
   * voisines restent deux régions distinctes, donc deux lectures distinctes.
   */
  function bubbleRegions(canvas) {
    const pixels = panelPixels(canvas)
    const { lum, width, height } = pixels
    const cut = inkThreshold(lum)
    const ink = new Uint8Array(lum.length)
    for (let index = 0; index < lum.length; index += 1) ink[index] = lum[index] < cut ? 1 : 0
    const closed = closing(ink, width, height, 2)
    const room = new Uint8Array(lum.length)
    for (let index = 0; index < room.length; index += 1) room[index] = closed[index] ? 0 : 1
    const { labels, regions } = regionsOf(room, width, height, 900)

    const candidates = []
    for (const region of regions) {
      if (region.border || region.area < 1200) continue
      const w = region.x1 - region.x0 + 1
      const h = region.y1 - region.y0 + 1
      if (w < 28 || h < 22) continue
      // Un cadre de planche n'est pas une bulle : trop large et trop grand.
      if (w > width * 0.8 && region.area > lum.length * 0.05) continue
      if (borderIsInk(region, labels, closed, width) < 0.55) continue
      candidates.push(region)
    }

    // Le fond d'un cadre contient les bulles : on ne garde une région que si
    // elle n'en englobe pas une plus petite (tri par aire croissante).
    candidates.sort((a, b) => a.area - b.area)
    const bubbles = []
    for (const region of candidates) {
      const inside = bubbles.some((bubble) => {
        const box = bubble.bbox
        return box.x0 >= region.x0 && box.y0 >= region.y0 && box.x1 <= region.x1 && box.y1 <= region.y1
      })
      if (inside) continue
      const solid = solidMask(region, width)
      if (!solid) continue
      if (solid.area / (solid.w * solid.h) < 0.3) continue
      bubbles.push({
        bbox: { x0: solid.x0, y0: solid.y0, x1: solid.x0 + solid.w - 1, y1: solid.y0 + solid.h - 1 },
        mask: solid,
        kind: 'bulle',
        text: ''
      })
    }
    return { bubbles, pixels, cut }
  }

  /** Identifiant stable d'une zone : sert aux corrections manuelles. */
  function stableId(text, bbox) {
    const seed = `${text}|${Math.round((bbox.x0 + bbox.x1) / 2)}|${Math.round((bbox.y0 + bbox.y1) / 2)}`
    let hash = 5381
    for (let index = 0; index < seed.length; index += 1) hash = ((hash << 5) + hash + seed.charCodeAt(index)) >>> 0
    return hash.toString(36)
  }

  /** Découpe un rectangle dans la planche, avec une marge. */
  function cropBox(canvas, box, pad) {
    const sx = Math.max(0, Math.floor(box.x0 - pad))
    const sy = Math.max(0, Math.floor(box.y0 - pad))
    const sw = Math.min(canvas.width - sx, Math.ceil(box.x1 - box.x0 + pad * 2))
    const sh = Math.min(canvas.height - sy, Math.ceil(box.y1 - box.y0 + pad * 2))
    if (sw < 12 || sh < 12) return null
    const part = document.createElement('canvas')
    part.width = sw
    part.height = sh
    part.getContext('2d', { willReadFrequently: true }).drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh)
    return { canvas: part, sx, sy, sw, sh }
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
            lines.push({
              text,
              bbox: line.bbox,
              confidence: line.confidence,
              words: (line.words || []).map((word) => ({ text: word.text || '', bbox: word.bbox }))
            })
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

  function lineHeightOf(lines) {
    const heights = lines.map((line) => line.bbox.y1 - line.bbox.y0).sort((a, b) => a - b)
    return heights.length ? heights[Math.floor(heights.length / 2)] : 0
  }

  /**
   * Lit une bulle isolément. C'est ce qui empêche deux bulles voisines d'être
   * réunies : chacune est recadrée sur son propre masque, donc l'OCR ne voit
   * jamais la ligne de l'autre.
   */
  async function readBubble(canvas, bubble) {
    const part = cropBox(canvas, bubble.bbox, 8)
    if (!part) return null
    let lines = await ocrPass(part.canvas, { tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' })
    if (!lines.length) {
      lines = await ocrPass(part.canvas, { tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' })
    }
    if (!lines.length) return null
    const text = lines.map((line) => line.text).join(' ').replace(/\s+/g, ' ').trim()
    if (text.replace(/[^\p{L}\p{N}]/gu, '').length < 2) return null
    return { text, lineHeight: lineHeightOf(lines), lines: lines.length }
  }

  /**
   * Éclat, onomatopée, mot seul : la passe d'ensemble n'en lit rien. On recadre
   * la zone, on l'agrandit, on la binarise (et on l'inverse si le texte est
   * clair sur fond sombre), puis on relit en mode « mot » et « mot seul ».
   */
  async function readBurst(canvas, box, zoneMask) {
    const part = cropBox(canvas, box, 6)
    if (!part) return null
    let source = part.canvas
    if (zoneMask) {
      // Le recadrage d'un éclat contient ses pointes : elles se lisent comme
      // des lettres. On ne garde que l'intérieur de la bulle, le reste en blanc.
      const clean = document.createElement('canvas')
      clean.width = part.sw
      clean.height = part.sh
      const cleanContext = clean.getContext('2d', { willReadFrequently: true })
      const inside = part.canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, part.sw, part.sh)
      for (let y = 0; y < part.sh; y += 1) {
        for (let x = 0; x < part.sw; x += 1) {
          const mx = x + part.sx - zoneMask.x0
          const my = y + part.sy - zoneMask.y0
          const kept = mx >= 0 && my >= 0 && mx < zoneMask.w && my < zoneMask.h && zoneMask.mask[my * zoneMask.w + mx]
          if (kept) continue
          const offset = (y * part.sw + x) * 4
          inside.data[offset] = 255
          inside.data[offset + 1] = 255
          inside.data[offset + 2] = 255
          inside.data[offset + 3] = 255
        }
      }
      cleanContext.putImageData(inside, 0, 0)
      source = clean
    }
    const scale = Math.max(2, Math.min(4, Math.round(720 / Math.max(1, part.sw))))
    const up = document.createElement('canvas')
    up.width = part.sw * scale
    up.height = part.sh * scale
    const context = up.getContext('2d', { willReadFrequently: true })
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(source, 0, 0, up.width, up.height)
    const image = context.getImageData(0, 0, up.width, up.height)
    const { data } = image
    let sum = 0
    let min = 255
    let max = 0
    for (let index = 0; index < data.length; index += 4) {
      const value = (data[index] * 299 + data[index + 1] * 587 + data[index + 2] * 114) / 1000
      sum += value
      if (value < min) min = value
      if (value > max) max = value
    }
    const cut = Math.round((min + max) / 2)
    const invert = sum / (data.length / 4) < 128
    for (let index = 0; index < data.length; index += 4) {
      const value = (data[index] * 299 + data[index + 1] * 587 + data[index + 2] * 114) / 1000
      const ink = invert ? value > cut : value < cut
      const level = ink ? 0 : 255
      data[index] = level
      data[index + 1] = level
      data[index + 2] = level
      data[index + 3] = 255
    }
    context.putImageData(image, 0, 0)
    for (const mode of ['7', '8']) {
      const lines = await ocrPass(up, {
        tessedit_pageseg_mode: mode,
        preserve_interword_spaces: '1'
      })
      const text = lines.map((line) => line.text).join(' ').replace(/\s+/g, ' ').trim()
      const letters = text.replace(/[^\p{L}\p{N}]/gu, '').length
      const confidence = lines.reduce((total, line) => total + (line.confidence || 0), 0) / Math.max(1, lines.length)
      if (letters >= 2 && confidence >= 55) {
        return { text, lineHeight: lineHeightOf(lines) / scale, confidence: Math.round(confidence) }
      }
    }
    return null
  }

  /** Dernier recours pour un éclat illisible : le modèle de vision lit l'image. */
  async function readBurstVision(canvas, box) {
    // Branché par Vela (le jeton reste dans sa fermeture). Hors application, il
    // n'y a pas de modèle de vision : on ne prétend pas lire l'éclat.
    if (typeof window.__velaComicVision !== 'function') return null
    const part = cropBox(canvas, box, 6)
    if (!part) return null
    try {
      const result = await window.__velaComicVision(part.canvas.toDataURL('image/png'))
      const text = String((result && result.texte) || '').trim()
      if (!result || !result.ok || !text) return null
      return { text, lineHeight: 0, via: 'vision' }
    } catch {
      return null
    }
  }

  /** Couverture d'une ligne par les bulles : une ligne à cheval sur deux bulles
   *  est écartée (chaque bulle a déjà sa propre lecture). */
  function bubbleCoverage(bbox, bubbles) {
    const area = Math.max(1, (bbox.x1 - bbox.x0) * (bbox.y1 - bbox.y0))
    let total = 0
    for (const bubble of bubbles) {
      const x = Math.max(0, Math.min(bbox.x1, bubble.bbox.x1) - Math.max(bbox.x0, bubble.bbox.x0))
      const y = Math.max(0, Math.min(bbox.y1, bubble.bbox.y1) - Math.max(bbox.y0, bubble.bbox.y0))
      total += (x * y) / area
    }
    return total
  }

  /** Colonne d'encre qui traverse une ligne : deux textes séparés par un trait. */
  function darkColumnBetween(pixels, x0, x1, y0, y1, cut) {
    const { lum, width, height } = pixels
    const top = Math.max(0, Math.floor(y0))
    const bottom = Math.min(height - 1, Math.ceil(y1))
    for (let x = Math.max(1, Math.floor(x0)); x < Math.min(width - 1, Math.ceil(x1)); x += 1) {
      let dark = 0
      for (let y = top; y <= bottom; y += 1) if (lum[y * width + x] < cut) dark += 1
      if (dark > (bottom - top + 1) * 0.6) return x
    }
    return -1
  }

  /** Coupe une ligne aux grands vides et aux traits qui la traversent. */
  function splitLine(line, pixels, cut) {
    const height = Math.max(6, line.bbox.y1 - line.bbox.y0)
    const words = (line.words || []).filter((word) => word.text.trim())
    if (words.length < 2) return [{ text: line.text, bbox: { ...line.bbox } }]
    const segments = []
    let current = { text: words[0].text.trim(), bbox: { ...words[0].bbox } }
    for (let index = 1; index < words.length; index += 1) {
      const word = words[index]
      const gap = word.bbox.x0 - current.bbox.x1
      const crossed = gap > height * 0.4 ? darkColumnBetween(pixels, current.bbox.x1, word.bbox.x0, line.bbox.y0, line.bbox.y1, cut) : -1
      if (gap > height * 2 || crossed >= 0) {
        segments.push(current)
        current = { text: word.text.trim(), bbox: { ...word.bbox } }
      } else {
        current.text += ` ${word.text.trim()}`
        current.bbox.x1 = Math.max(current.bbox.x1, word.bbox.x1)
        current.bbox.y0 = Math.min(current.bbox.y0, word.bbox.y0)
        current.bbox.y1 = Math.max(current.bbox.y1, word.bbox.y1)
      }
    }
    segments.push(current)
    return segments
  }

  /** Regroupe les lignes d'un même paragraphe hors bulle, sans jamais mélanger
   *  deux blocs séparés par un vide ou un trait. */
  function groupSegments(segments) {
    const groups = []
    const sorted = [...segments].sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0)
    for (const segment of sorted) {
      const height = Math.max(8, segment.bbox.y1 - segment.bbox.y0)
      let target = null
      let best = Infinity
      for (const group of groups) {
        const box = group.bbox
        const gap = segment.bbox.y0 - box.y1
        if (gap < -height * 0.5 || gap > height * 0.7) continue
        const overlap = Math.min(box.x1, segment.bbox.x1) - Math.max(box.x0, segment.bbox.x0)
        const narrowest = Math.min(box.x1 - box.x0, segment.bbox.x1 - segment.bbox.x0)
        if (narrowest <= 0 || overlap < narrowest * 0.5) continue
        if (gap < best) {
          best = gap
          target = group
        }
      }
      if (target) {
        target.text += ` ${segment.text}`
        target.count += 1
        target.bbox.x0 = Math.min(target.bbox.x0, segment.bbox.x0)
        target.bbox.y0 = Math.min(target.bbox.y0, segment.bbox.y0)
        target.bbox.x1 = Math.max(target.bbox.x1, segment.bbox.x1)
        target.bbox.y1 = Math.max(target.bbox.y1, segment.bbox.y1)
        target.lineHeight = Math.max(target.lineHeight, height)
      } else {
        groups.push({ text: segment.text, bbox: { ...segment.bbox }, count: 1, lineHeight: height })
      }
    }
    return groups.filter((group) => group.text.replace(/[^\p{L}\p{N}]/gu, '').length >= 2)
  }

  /** Amas d'encre hors texte connu : gros glyphes, onomatopées, éclats. */
  function inkClusters(pixels, cut, excluded) {
    const { lum, width, height } = pixels
    const blocked = new Uint8Array(lum.length)
    for (const box of excluded) {
      const pad = 10
      const x0 = Math.max(0, Math.floor(box.x0 - pad))
      const y0 = Math.max(0, Math.floor(box.y0 - pad))
      const x1 = Math.min(width - 1, Math.ceil(box.x1 + pad))
      const y1 = Math.min(height - 1, Math.ceil(box.y1 + pad))
      for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) blocked[y * width + x] = 1
    }
    const ink = new Uint8Array(lum.length)
    for (let index = 0; index < lum.length; index += 1) ink[index] = !blocked[index] && lum[index] < cut ? 1 : 0
    const grown = dilateLine(dilateLine(ink, width, height, 8, true), width, height, 8, false)
    const { regions } = regionsOf(grown, width, height, 400)
    const clusters = []
    for (const region of regions) {
      const w = region.x1 - region.x0 + 1
      const h = region.y1 - region.y0 + 1
      if (h < 22 || h > 170 || w < 26) continue
      if (w / h > 6) continue
      if (w * h > lum.length * 0.2) continue
      let solid = 0
      for (const index of region.pixels) solid += ink[index]
      const density = solid / (w * h)
      if (density < 0.05 || density > 0.7) continue
      clusters.push({ x0: region.x0, y0: region.y0, x1: region.x1, y1: region.y1 })
    }
    return clusters
  }

  /**
   * Une planche : les bulles (masque), le texte hors bulle (lignes recoupées) et
   * les zones muettes (éclats) relues par agrandissement puis, en mode réel, par
   * le modèle de vision.
   */
  async function analyzePanel(canvas) {
    const { bubbles, pixels, cut } = bubbleRegions(canvas)
    for (const bubble of bubbles) {
      const read = await readBubble(canvas, bubble)
      if (read) {
        bubble.text = read.text
        bubble.lineHeight = read.lineHeight
      }
    }
    const zones = bubbles
      .filter((bubble) => bubble.text)
      .map((bubble) => ({
        bbox: bubble.bbox,
        mask: bubble.mask,
        kind: 'bulle',
        text: bubble.text,
        lineHeight: bubble.lineHeight,
        count: 1,
        source: 'bulle'
      }))

    const lines = await ocrPass(canvas, { preserve_interword_spaces: '1' })
    console.debug(
      '[BD] bulles :',
      bubbles.map((bubble) => `« ${bubble.text || '—'} » @${bubble.bbox.x0},${bubble.bbox.y0},${bubble.bbox.x1},${bubble.bbox.y1}`).join(' | ')
    )
    const outside = []
    const inBubble = (bbox) => {
      const cx = (bbox.x0 + bbox.x1) / 2
      const cy = (bbox.y0 + bbox.y1) / 2
      return bubbles.some(
        (bubble) => cx >= bubble.bbox.x0 && cx <= bubble.bbox.x1 && cy >= bubble.bbox.y0 && cy <= bubble.bbox.y1
      )
    }
    for (const line of lines) {
      if (bubbleCoverage(line.bbox, bubbles) > 0.55) continue
      // Le découpage se fait AVANT le filtrage : une ligne à cheval sur une
      // bulle et l'extérieur ne doit pas déposer un faux texte dans la bulle.
      for (const segment of splitLine(line, pixels, cut)) {
        if (inBubble(segment.bbox)) continue
        if (bubbleCoverage(segment.bbox, bubbles) > 0.55) continue
        outside.push(segment)
      }
    }
    for (const group of groupSegments(outside)) {
      zones.push({ ...group, kind: 'cartouche', mask: null, source: 'ocr' })
    }

    // Zones muettes : une bulle close que l'OCR n'a pas lue, et les amas d'encre
    // hors de tout texte connu. On tente l'OCR agrandi, puis la vision.
    const silent = bubbles.filter((bubble) => !bubble.text).map((bubble) => ({ bbox: bubble.bbox, mask: bubble.mask }))
    const clusters = inkClusters(pixels, cut, [...bubbles.map((bubble) => bubble.bbox), ...zones.map((zone) => zone.bbox)])
    let extra = 0
    for (const bbox of clusters) {
      if (extra >= 4) break
      const cx = (bbox.x0 + bbox.x1) / 2
      const cy = (bbox.y0 + bbox.y1) / 2
      if (bubbles.some((bubble) => cx >= bubble.bbox.x0 && cx <= bubble.bbox.x1 && cy >= bubble.bbox.y0 && cy <= bubble.bbox.y1)) continue
      silent.push({ bbox, mask: null })
      extra += 1
    }
    for (const candidate of silent) {
      let read = await readBurst(canvas, candidate.bbox, candidate.mask)
      if (read) read = { ...read, via: 'ocr-agrandi' }
      else read = await readBurstVision(canvas, candidate.bbox)
      const lineHeight = (read && read.lineHeight) || candidate.bbox.y1 - candidate.bbox.y0
      zones.push({
        bbox: candidate.bbox,
        mask: candidate.mask,
        kind: 'eclat',
        text: read ? read.text : '',
        lineHeight,
        count: 1,
        unread: !read,
        source: read ? read.via : 'illisible'
      })
    }

    for (const zone of zones) {
      zone.id = stableId(zone.text, zone.bbox)
    }
    console.debug('[BD] zones :', zones.map((zone) => `${zone.kind}:${zone.text || '—'}`).join(' | '))
    return { bubbles, zones, pixels }
  }

  /** Planches déjà analysées : une correction manuelle se réaffiche sans OCR. */
  const analysed = new Map()
  let activeSource = ''
  let activeLayer = null
  let activeState = null
  let activeImg = null

  /** Lit une planche, traduit ses bulles et pose le calque. */
  async function translatePanel(img) {
    const source = panelSource(img)
    if (!source) return
    const layer = layerFor(img)
    if (!layer) return
    activeSource = source
    activeLayer = layer
    activeImg = img
    try {
      let state = analysed.get(source)
      if (!state) {
        // Corrections enregistrées lors d'une session précédente : elles
        // reviennent avant l'analyse, sans être écrasées par la traduction.
        await restoreEdits(source)
        setStatus('préparation de la planche…')
        const { canvas } = await canvasFrom(source)
        setStatus('découpage des bulles…')
        const analysis = await analyzePanel(canvas)
        const readable = analysis.zones.filter((zone) => zone.text)
        setStatus(`${analysis.zones.length} zone(s), ${readable.length} à traduire…`)
        if (readable.length) {
          const translated = await translateTexts(readable.map((zone) => zone.text))
          readable.forEach((zone, index) => {
            zone.traduit = translated[index]
          })
        }
        state = { canvas, zones: analysis.zones, bubbles: analysis.bubbles }
        analysed.set(source, state)
      }
      activeState = state
      const drawn = repaint()
      done.set(img, source)
      setStatus(`${drawn} zone(s) traduite(s) · ${state.zones.length} détectée(s)`)
    } catch (error) {
      console.warn('[BD] planche ignorée', error)
      analysed.delete(source)
      setStatus(`planche ignorée : ${error.message}`)
      layer.remove()
      layers.delete(img)
    }
  }

  /** Redessine la planche analysée, corrections manuelles comprises. */
  function repaint(reset = true) {
    if (!activeState || !activeLayer) return 0
    activeLayer.textContent = ''
    if (reset) window.__vtReport = []
    const edits = editsOf(activeSource)
    let drawn = 0
    for (const zone of activeState.zones) {
      if (!zone.traduit) continue
      if (drawZone(activeLayer, activeImg, zone, activeState.canvas, edits[zone.id], activeState.bubbles)) drawn += 1
    }
    return drawn
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

  /** Résout un système 3×3 (moindres carrés du plan de fond). */
  function solve3(matrix, vector) {
    const rows = matrix.map((row, index) => [...row, vector[index]])
    for (let col = 0; col < 3; col += 1) {
      let pivot = col
      for (let row = col + 1; row < 3; row += 1) {
        if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row
      }
      if (Math.abs(rows[pivot][col]) < 1e-9) return null
      const swap = rows[col]
      rows[col] = rows[pivot]
      rows[pivot] = swap
      for (let row = 0; row < 3; row += 1) {
        if (row === col) continue
        const factor = rows[row][col] / rows[col][col]
        for (let k = col; k < 4; k += 1) rows[row][k] -= factor * rows[col][k]
      }
    }
    return [rows[0][3] / rows[0][0], rows[1][3] / rows[1][1], rows[2][3] / rows[2][2]]
  }

  /**
   * Efface le texte et lui seul. Le fond d'une bulle n'est pas une couleur
   * unique : on ajuste un plan (r, g, b = a + b·x + c·y) sur ses pixels de fond,
   * puis on remplit l'encre avec ce plan. Un dégradé vertical ou horizontal est
   * donc conservé — le remplissage ligne par ligne l'aplatissait.
   */
  function inpaint(context, image, region) {
    const { data, width } = image
    const rows = new Map()
    for (let y = region.minY; y <= region.maxY; y += 1) {
      const values = []
      for (let x = region.minX; x <= region.maxX; x += 1) {
        const index = y * width + x
        if (region.mask[index]) values.push(luminance(data, index * 4))
      }
      if (values.length < 6) continue
      values.sort((a, b) => a - b)
      rows.set(y, values[Math.floor(values.length * 0.75)])
    }

    const normal = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    const sums = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    let samples = 0
    for (const [y, light] of rows) {
      for (let x = region.minX; x <= region.maxX; x += 1) {
        const index = y * width + x
        if (!region.mask[index]) continue
        if (luminance(data, index * 4) < light - 8) continue
        const basis = [1, x, y]
        samples += 1
        for (let a = 0; a < 3; a += 1) {
          for (let b = 0; b < 3; b += 1) normal[a][b] += basis[a] * basis[b]
          for (let channel = 0; channel < 3; channel += 1) sums[channel][a] += basis[a] * data[index * 4 + channel]
        }
      }
    }
    let planes = null
    if (samples > 300) {
      planes = [0, 1, 2].map((channel) => solve3(normal, sums[channel]))
      if (planes.some((plane) => !plane)) planes = null
    }

    const top = []
    const bottom = []
    const span = Math.max(1, region.maxY - region.minY)
    for (let y = region.minY; y <= region.maxY; y += 1) {
      const light = rows.get(y)
      if (light === undefined) continue
      const share = (y - region.minY) / span
      for (let x = region.minX; x <= region.maxX; x += 1) {
        const index = y * width + x
        if (!region.mask[index]) continue
        if (luminance(data, index * 4) >= light - 8) continue
        let red = light
        let green = light
        let blue = light
        if (planes) {
          red = planes[0][0] + planes[0][1] * x + planes[0][2] * y
          green = planes[1][0] + planes[1][1] * x + planes[1][2] * y
          blue = planes[2][0] + planes[2][1] * x + planes[2][2] * y
        }
        red = Math.max(0, Math.min(255, red))
        green = Math.max(0, Math.min(255, green))
        blue = Math.max(0, Math.min(255, blue))
        const offset = index * 4
        data[offset] = red
        data[offset + 1] = green
        data[offset + 2] = blue
        const filled = (red * 299 + green * 587 + blue * 114) / 1000
        if (share < 0.28) top.push(filled)
        else if (share > 0.72) bottom.push(filled)
      }
    }
    context.putImageData(image, 0, 0)

    // Mesure du dégradé : la pente du fond doit survivre au remplissage.
    const beforeTop = []
    const beforeBottom = []
    for (const [y, light] of rows) {
      const share = (y - region.minY) / span
      if (share < 0.28) beforeTop.push(light)
      else if (share > 0.72) beforeBottom.push(light)
    }
    const average = (list) => (list.length ? list.reduce((total, value) => total + value, 0) / list.length : 0)
    return {
      avant: Math.round(average(beforeTop) - average(beforeBottom)),
      apres: Math.round(average(top) - average(bottom)),
      plan: Boolean(planes)
    }
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
  function paintText(target, text, rect, size, color, font, options = {}) {
    const context = target.getContext('2d', { willReadFrequently: true })
    context.save()
    context.font = `${options.weight || 600} ${size}px ${font}`
    context.fillStyle = color
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    if (options.angle) {
      context.translate(rect.cx, rect.cy)
      context.rotate(options.angle)
      context.translate(-rect.cx, -rect.cy)
    }
    const lines = wrapLines(context, text, rect.w)
    const lineHeight = size * 1.18
    const first = rect.cy - ((lines.length - 1) * lineHeight) / 2
    lines.forEach((line, index) => context.fillText(line, rect.cx, first + index * lineHeight))
    context.restore()
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

  /* ------------------------------------------------ corrections manuelles */

  const EDITS = GM_getValue('edits', {}) || {}

  function imageKeyOf(source) {
    let hash = 5381
    for (let index = 0; index < source.length; index += 1) hash = ((hash << 5) + hash + source.charCodeAt(index)) >>> 0
    return hash.toString(36)
  }

  function editsOf(source) {
    return EDITS[imageKeyOf(source)] || {}
  }

  /** Une correction manuelle prime sur la traduction et n'est jamais écrasée
   *  par une relance : elle vit à part, indexée par bulle. */
  function saveEdit(source, id, patch) {
    if (!source || !id) return null
    const key = imageKeyOf(source)
    EDITS[key] = { ...(EDITS[key] || {}) }
    EDITS[key][id] = { ...(EDITS[key][id] || {}), ...patch, manuel: true }
    GM_setValue('edits', EDITS)
    if (typeof window.__velaComicEdits === 'function') {
      try {
        window.__velaComicEdits(key, EDITS[key])
      } catch {
        /* disque indisponible : le stockage du script suffit */
      }
    }
    return EDITS[key][id]
  }

  /** Relit les corrections de cette planche depuis le disque (pont Vela).
   *  Le stockage du script prime : une correction faite dans la page n'est pas
   *  écrasée par une version plus ancienne du fichier. */
  async function readEditsFile(source) {
    if (!source || typeof window.__velaComicLoadEdits !== 'function') return null
    try {
      const result = await window.__velaComicLoadEdits(imageKeyOf(source))
      return result && result.ok && result.value ? result.value : null
    } catch {
      return null
    }
  }

  async function restoreEdits(source) {
    const disque = await readEditsFile(source)
    if (!disque) return null
    const key = imageKeyOf(source)
    EDITS[key] = { ...disque, ...(EDITS[key] || {}) }
    return disque
  }

  function exportEdits() {
    return JSON.stringify({ version: 1, planches: EDITS }, null, 2)
  }

  function importEdits(json) {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json
    const planches = parsed && parsed.planches ? parsed.planches : parsed
    if (!planches || typeof planches !== 'object') throw new Error('fichier de corrections illisible')
    for (const [key, value] of Object.entries(planches)) EDITS[key] = { ...(EDITS[key] || {}), ...value }
    GM_setValue('edits', EDITS)
    return EDITS
  }

  /** Masque plein d'une bulle, recopié dans le repère de sa plaque. */
  function regionFromMask(source, sx, sy, sw, sh) {
    const mask = new Uint8Array(sw * sh)
    let area = 0
    let sumX = 0
    let sumY = 0
    let minX = sw
    let minY = sh
    let maxX = 0
    let maxY = 0
    for (let y = 0; y < source.h; y += 1) {
      for (let x = 0; x < source.w; x += 1) {
        if (!source.mask[y * source.w + x]) continue
        const px = source.x0 + x - sx
        const py = source.y0 + y - sy
        if (px < 0 || py < 0 || px >= sw || py >= sh) continue
        mask[py * sw + px] = 1
        area += 1
        sumX += px
        sumY += py
        if (px < minX) minX = px
        if (px > maxX) maxX = px
        if (py < minY) minY = py
        if (py > maxY) maxY = py
      }
    }
    if (area < 400) return null
    return { mask, width: sw, height: sh, area, cx: sumX / area, cy: sumY / area, minX, minY, maxX, maxY }
  }

  /**
   * Contour ouvert : on reconstruit la forme par l'enveloppe convexe des pixels
   * d'encre. L'enveloppe n'est retenue que si elle est réellement suivie par un
   * trait, sinon c'est un cadre ou du bruit et on renvoie null.
   */
  function hullRegion(image, box) {
    const { data, width, height } = image
    const x0 = Math.max(0, Math.floor(box.x0))
    const y0 = Math.max(0, Math.floor(box.y0))
    const x1 = Math.min(width - 1, Math.ceil(box.x1))
    const y1 = Math.min(height - 1, Math.ceil(box.y1))
    let min = 255
    let max = 0
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const value = luminance(data, (y * width + x) * 4)
        if (value < min) min = value
        if (value > max) max = value
      }
    }
    if (max - min < 40) return null
    const cut = (min + max) / 2
    const points = []
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (luminance(data, (y * width + x) * 4) < cut) points.push([x, y])
      }
    }
    if (points.length < 60) return null
    points.sort((a, b) => a[0] - b[0] || a[1] - b[1])
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    const lower = []
    for (const point of points) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop()
      lower.push(point)
    }
    const upper = []
    for (let index = points.length - 1; index >= 0; index -= 1) {
      const point = points[index]
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop()
      upper.push(point)
    }
    const hull = lower.slice(0, -1).concat(upper.slice(0, -1))
    if (hull.length < 3) return null
    let supported = 0
    const probes = 60
    for (let step = 0; step < probes; step += 1) {
      const a = hull[Math.floor((step * hull.length) / probes)]
      const b = hull[Math.floor(((step + 1) * hull.length) / probes) % hull.length]
      const px = Math.round(a[0] + (b[0] - a[0]) * 0.5)
      const py = Math.round(a[1] + (b[1] - a[1]) * 0.5)
      let found = false
      for (let dy = -6; dy <= 6 && !found; dy += 1) {
        for (let dx = -6; dx <= 6 && !found; dx += 1) {
          const x = px + dx
          const y = py + dy
          if (x < 0 || y < 0 || x >= width || y >= height) continue
          if (luminance(data, (y * width + x) * 4) < cut) found = true
        }
      }
      if (found) supported += 1
    }
    if (supported / probes < 0.5) return null

    const mask = new Uint8Array(width * height)
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0
    for (const [x, y] of hull) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    let area = 0
    let sumX = 0
    let sumY = 0
    for (let y = minY; y <= maxY; y += 1) {
      const crossings = []
      for (let index = 0; index < hull.length; index += 1) {
        const a = hull[index]
        const b = hull[(index + 1) % hull.length]
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          crossings.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]))
        }
      }
      crossings.sort((a, b) => a - b)
      for (let index = 0; index + 1 < crossings.length; index += 2) {
        const from = Math.max(0, Math.ceil(crossings[index]))
        const to = Math.min(width - 1, Math.floor(crossings[index + 1]))
        for (let x = from; x <= to; x += 1) {
          mask[y * width + x] = 1
          area += 1
          sumX += x
          sumY += y
        }
      }
    }
    // Une enveloppe à peine plus grande que la boîte du texte, c'est le texte
    // lui-même, pas un contour : on refuse plutôt que d'inventer une bulle.
    const boxArea = Math.max(1, (box.x1 - box.x0) * (box.y1 - box.y0))
    if (area < 400 || area < boxArea * 1.5) return null
    return { mask, width, height, area, cx: sumX / area, cy: sumY / area, minX, minY, maxX, maxY }
  }

  const pixelCache = new WeakMap()
  function panelInfo(canvas) {
    let info = pixelCache.get(canvas)
    if (!info) {
      const pixels = panelPixels(canvas)
      info = { pixels, cut: inkThreshold(pixels.lum) }
      pixelCache.set(canvas, info)
    }
    return info
  }

  /**
   * Contour réellement fermé autour du texte : la plus petite composante d'encre
   * dont la boîte contient celle du texte. Son intérieur est rempli depuis le
   * texte, donc une interruption du trait (trou, queue, aplat) ne fait plus
   * fuir le remplissage. L'encre n'est jamais dans le masque : le trait, lui,
   * survit toujours.
   */
  function contourRegion(canvas, box, bubbles) {
    const { pixels, cut } = panelInfo(canvas)
    const { lum, width, height } = pixels
    const ink = new Uint8Array(lum.length)
    for (let index = 0; index < lum.length; index += 1) ink[index] = lum[index] < cut ? 1 : 0
    const { regions } = regionsOf(ink, width, height, 4000)
    const textArea = Math.max(1, (box.x1 - box.x0) * (box.y1 - box.y0))
    const textX = (box.x0 + box.x1) / 2
    const textY = (box.y0 + box.y1) / 2
    let best = null
    for (const region of regions) {
      if (region.x0 > box.x0 || region.x1 < box.x1 || region.y0 > box.y0 || region.y1 < box.y1) continue
      if (region.area < 200) continue
      const area = (region.x1 - region.x0 + 1) * (region.y1 - region.y0 + 1)
      if (area > lum.length * 0.25) continue
      // Une boîte à peine plus grande que le texte, ce sont ses propres glyphes.
      if (area < textArea * 3) continue
      // Le cadre d'une planche entoure aussi les autres bulles : ce n'est pas
      // un contour de bulle. Une bulle n'englobe jamais une autre bulle.
      const wrapsBubble = (bubbles || []).some((bubble) => {
        const bx = (bubble.bbox.x0 + bubble.bbox.x1) / 2
        const by = (bubble.bbox.y0 + bubble.bbox.y1) / 2
        if (Math.abs(bx - textX) < 2 && Math.abs(by - textY) < 2) return false
        return bx > region.x0 && bx < region.x1 && by > region.y0 && by < region.y1
      })
      if (wrapsBubble) continue
      if (!best || area < best.area) best = { frame: region, area }
    }
    if (!best) return null
    const frame = best.frame

    let seed = -1
    let bestValue = -1
    for (let y = Math.max(frame.y0, Math.floor(box.y0)); y <= Math.min(frame.y1, Math.ceil(box.y1)); y += 1) {
      for (let x = Math.max(frame.x0, Math.floor(box.x0)); x <= Math.min(frame.x1, Math.ceil(box.x1)); x += 1) {
        const value = lum[y * width + x]
        if (value > bestValue) {
          bestValue = value
          seed = y * width + x
        }
      }
    }
    if (seed < 0) return null

    const mask = new Uint8Array(lum.length)
    const stack = [seed]
    let area = 0
    let sumX = 0
    let sumY = 0
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0
    while (stack.length) {
      const index = stack.pop()
      if (mask[index]) continue
      const x = index % width
      const y = (index - x) / width
      if (x < frame.x0 || x > frame.x1 || y < frame.y0 || y > frame.y1) continue
      if (ink[index]) continue
      mask[index] = 1
      area += 1
      sumX += x
      sumY += y
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (x > frame.x0) stack.push(index - 1)
      if (x < frame.x1) stack.push(index + 1)
      if (y > frame.y0) stack.push(index - width)
      if (y < frame.y1) stack.push(index + width)
    }
    if (area < 800) return null

    // Le texte est de l'encre à l'intérieur de la bulle : ce sont des trous du
    // masque. Sans ce rebouchage, aucun rectangle de texte ne peut s'y loger et
    // tout déborde. Le trait du contour, lui, touche le bord : il reste exclu.
    const seen = new Uint8Array(lum.length)
    const queue = []
    for (let x = frame.x0; x <= frame.x1; x += 1) queue.push(frame.y0 * width + x, frame.y1 * width + x)
    for (let y = frame.y0; y <= frame.y1; y += 1) queue.push(y * width + frame.x0, y * width + frame.x1)
    while (queue.length) {
      const index = queue.pop()
      if (seen[index] || mask[index]) continue
      seen[index] = 1
      const x = index % width
      const y = (index - x) / width
      if (x > frame.x0) queue.push(index - 1)
      if (x < frame.x1) queue.push(index + 1)
      if (y > frame.y0) queue.push(index - width)
      if (y < frame.y1) queue.push(index + width)
    }
    for (let y = frame.y0; y <= frame.y1; y += 1) {
      for (let x = frame.x0; x <= frame.x1; x += 1) {
        const index = y * width + x
        if (mask[index] || seen[index]) continue
        mask[index] = 1
        area += 1
        sumX += x
        sumY += y
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
    return { mask, width, height, area, cx: sumX / area, cy: sumY / area, minX, minY, maxX, maxY }
  }

  /** Recadre la zone et efface son texte ; renvoie la plaque et le masque. */
  function plateFor(canvas, zone, bubbles) {
    const box = zone.bbox
    const lineHeight = zone.lineHeight || (box.y1 - box.y0)
    const pad = Math.max(8, Math.round(lineHeight * 0.8))
    const crop = cropBox(canvas, box, pad)
    if (!crop) return null

    const build = (part) => {
      const context = part.canvas.getContext('2d', { willReadFrequently: true })
      return {
        plate: part.canvas,
        context,
        image: context.getImageData(0, 0, part.sw, part.sh),
        sx: part.sx,
        sy: part.sy,
        sw: part.sw,
        sh: part.sh
      }
    }

    let work = build(crop)
    let region = null
    let fond = 'aucun'
    if (zone.mask) {
      region = regionFromMask(zone.mask, work.sx, work.sy, work.sw, work.sh)
      if (region) fond = 'masque'
    }
    if (!region) {
      region = interiorMask(work.image, { x0: box.x0 - work.sx, y0: box.y0 - work.sy, x1: box.x1 - work.sx, y1: box.y1 - work.sy })
      fond = 'remplissage'
    }
    if (!region || region.area > work.sw * work.sh * 0.9) {
      // Fuite (contour ouvert) ou bulle invisible : on récupère le vrai contour.
      const wide = contourRegion(canvas, box, bubbles)
      const next = wide && cropBox(canvas, { x0: wide.minX, y0: wide.minY, x1: wide.maxX, y1: wide.maxY }, 8)
      if (next) {
        const rebuilt = build(next)
        const mask = new Uint8Array(next.sw * next.sh)
        let area = 0
        let sumX = 0
        let sumY = 0
        let minX = next.sw
        let minY = next.sh
        let maxX = 0
        let maxY = 0
        for (let y = 0; y < next.sh; y += 1) {
          for (let x = 0; x < next.sw; x += 1) {
            if (!wide.mask[(y + next.sy) * wide.width + (x + next.sx)]) continue
            mask[y * next.sw + x] = 1
            area += 1
            sumX += x
            sumY += y
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
        if (area >= 400) {
          work = rebuilt
          region = { mask, width: next.sw, height: next.sh, area, cx: sumX / area, cy: sumY / area, minX, minY, maxX, maxY }
          fond = 'contour'
        }
      }
      if (fond !== 'contour') {
        return { ...work, region: null, fond: 'plaque arrondie', warning: 'contour introuvable : plaque arrondie' }
      }
    }
    const gradient = inpaint(work.context, work.image, region)
    return { ...work, region, fond, warning: '', gradient }
  }

  /** Plaque arrondie de secours, avec une pastille visible sur la capture. */
  function drawPlain(layer, bubble, text, scaleX, scaleY, width, height, pad, warning) {
    const node = document.createElement('div')
    node.className = 'vt-bubble'
    node.dataset.mode = 'cover'
    node.textContent = text
    node.title = bubble.text
    node.style.left = `${bubble.bbox.x0 * scaleX - pad}px`
    node.style.top = `${bubble.bbox.y0 * scaleY - pad}px`
    node.style.width = `${width + pad * 2}px`
    node.style.minHeight = `${height + pad * 2}px`
    node.style.fontFamily = CFG.font
    node.style.fontSize = `${Math.min(22, Math.max(11, height * 0.5))}px`
    if (warning) {
      console.warn('[BD]', warning, '—', String(bubble.text).slice(0, 40))
      const badge = document.createElement('span')
      badge.className = 'vt-warn'
      badge.textContent = `⚠ ${warning}`
      node.appendChild(badge)
    }
    layer.appendChild(node)
    return node
  }

  /**
   * Pose une zone sur le calque : plaque au contour d'origine, texte contenu,
   * corps choisi par recherche dichotomique, corrections manuelles appliquées.
   */
  function drawZone(layer, img, zone, canvas, edit, bubbles) {
    if (!zone.traduit) return false
    const text = (edit && edit.texte) || zone.traduit
    if (!text) return false
    const sourceWidth = canvas.width || img.naturalWidth || layer.clientWidth || 1
    const sourceHeight = canvas.height || img.naturalHeight || layer.clientHeight || 1
    const scaleX = (layer.clientWidth || 1) / sourceWidth
    const scaleY = (layer.clientHeight || 1) / sourceHeight
    const width = (zone.bbox.x1 - zone.bbox.x0) * scaleX
    const height = (zone.bbox.y1 - zone.bbox.y0) * scaleY
    if (width < 6 || height < 6) return false
    const pad = Math.max(3, Math.min(10, height * 0.16))

    if (CFG.mode === 'below') {
      drawPlain(layer, zone, text, scaleX, scaleY, width, height, pad, '')
      return true
    }

    const work = plateFor(canvas, zone, bubbles)
    if (!work) return false
    const dx = Number(edit && edit.dx) || 0
    const dy = Number(edit && edit.dy) || 0
    const echelle = Math.max(0.5, Math.min(2.5, Number(edit && edit.echelle) || 1))

    if (!work.region) {
      drawPlain(layer, zone, text, scaleX, scaleY, width, height, pad, work.warning)
      report().push({
        id: zone.id,
        type: zone.kind,
        texte: zone.text,
        traduit: text,
        taille: 0,
        plafond: 0,
        fits: true,
        overflow: 0,
        region: 0,
        boite: zone.bbox,
        toile: { w: canvas.width, h: canvas.height },
        fond: work.fond,
        warning: work.warning,
        gradient: null,
        lu: Boolean(zone.text)
      })
      return true
    }

    const rect = inscribedRect(work.region)
    const drawRect = { ...rect, cx: rect.cx + dx, cy: rect.cy + dy }
    const original = zone.lineHeight || (zone.bbox.y1 - zone.bbox.y0)
    const cap = Math.max(10, Math.round(original * 1.3))
    const ceiling = Math.min(cap, Math.max(9, Math.floor(rect.h / 1.18)))
    const weight = zone.kind === 'eclat' ? 800 : 600
    const overflowAt = (size) => {
      const probe = document.createElement('canvas')
      probe.width = work.plate.width
      probe.height = work.plate.height
      paintText(probe, text, drawRect, size, '#111', CFG.font, { weight })
      return overflowPixels(probe, work.region)
    }
    let low = 9
    let high = Math.max(9, Math.round(ceiling * echelle))
    let best = 0
    while (low <= high) {
      const mid = Math.round((low + high) / 2)
      if (overflowAt(mid) === 0) {
        best = mid
        low = mid + 1
      } else {
        high = mid - 1
      }
    }
    const fits = best > 0
    const size = best || 9
    paintText(work.plate, text, drawRect, size, '#111', CFG.font, { weight, angle: zone.angle || 0 })

    work.plate.className = 'vt-bubble'
    work.plate.title = zone.text
    work.plate.setAttribute('role', 'img')
    work.plate.setAttribute('aria-label', text)
    work.plate.style.left = `${work.sx * scaleX}px`
    work.plate.style.top = `${work.sy * scaleY}px`
    work.plate.style.width = `${work.sw * scaleX}px`
    work.plate.style.height = `${work.sh * scaleY}px`
    layer.appendChild(work.plate)

    report().push({
      id: zone.id,
      type: zone.kind,
      texte: zone.text,
      traduit: text,
      taille: size,
      plafond: cap,
      fits,
      overflow: fits ? 0 : overflowAt(size),
      region: work.region.area,
      rect: { w: Math.round(rect.w), h: Math.round(rect.h) },
      plaque: { w: work.plate.width, h: work.plate.height },
      boite: zone.bbox,
      toile: { w: canvas.width, h: canvas.height },
      gradient: work.gradient,
      fond: work.fond,
      warning: work.warning,
      lu: Boolean(zone.text)
    })
    return true
  }

  function clearOverlays() {
    document.querySelectorAll('.vt-layer').forEach((layer) => layer.remove())
    window.__vtReport = []
    done = new WeakMap()
    analysed.clear()
    activeState = null
    activeLayer = null
    setStatus('calques effacés')
  }

  // Corrections manuelles : elles ne touchent qu'à l'affichage et aux textes,
  // jamais à la clé de traduction. L'éditeur local s'en sert pour relire et
  // corriger bulle par bulle, puis réimporter le fichier JSON.
  window.__vtEdits = {
    list: () => report(),
    set: (id, patch) => {
      saveEdit(activeSource, id, patch)
      return repaint()
    },
    get: () => JSON.parse(JSON.stringify(editsOf(activeSource))),
    loadFromDisk: async () => {
      const disque = await restoreEdits(activeSource)
      return {
        ok: Boolean(disque),
        disque,
        corrections: JSON.parse(JSON.stringify(editsOf(activeSource)))
      }
    },
    export: exportEdits,
    import: (json) => {
      importEdits(json)
      return repaint()
    }
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
    // Une planche déjà lue est redessinée depuis son analyse : une relance
    // n'écrase pas les corrections et ne relance pas tout l'OCR.
    let redrawn = 0
    for (const img of document.images) {
      const source = panelSource(img)
      if (!source || !analysed.has(source)) continue
      const layer = layerFor(img)
      if (!layer) continue
      activeSource = source
      activeLayer = layer
      activeImg = img
      activeState = analysed.get(source)
      repaint(false)
      redrawn += 1
    }
    const panels = findPanels()
    if (!panels.length) {
      setStatus(redrawn ? `${redrawn} planche(s) redessinée(s) avec les corrections` : 'aucune planche détectée')
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
