/*
 * Boîte à outils du tournage de la bande-annonce.
 *
 * L'app est réellement lancée (données de démonstration isolées) et pilotée
 * par le protocole DevTools : la souris et le clavier passent par de vrais
 * événements d'entrée, donc les animations de l'interface sont celles du
 * produit. Les images viennent d'un « screencast » CDP, c'est-à-dire du
 * compositeur de Chromium : ni le bureau, ni le curseur du système, ni une
 * notification ne peuvent se retrouver dans la vidéo.
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '../..')
const ELECTRON = require('electron')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Client CDP minimal (WebSocket global de Node). */
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    let id = 0
    const pending = new Map()
    ws.onopen = () =>
      resolve({
        send(method, params = {}) {
          return new Promise((res, rej) => {
            const n = ++id
            pending.set(n, (m) => (m.error ? rej(new Error(`${method}: ${JSON.stringify(m.error)}`)) : res(m.result)))
            ws.send(JSON.stringify({ id: n, method, params }))
          })
        },
        on(method, handler) {
          ws.addEventListener('message', (event) => {
            const message = JSON.parse(event.data)
            if (message.method === method) handler(message.params)
          })
        },
        close: () => ws.close()
      })
    ws.onerror = reject
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.id) {
        pending.get(message.id)?.(message)
        pending.delete(message.id)
      }
    }
  })
}

/**
 * Lance l'app avec un dossier de données dédié et renvoie de quoi la piloter.
 * `size` est la taille logique de la fenêtre ; le screencast produit des
 * images à cette taille, sans facteur d'échelle.
 */
async function launchApp({ dataDir, port = 9371, width = 1440, height = 900, seed, extraEnv, resize = true } = {}) {
  fs.rmSync(dataDir, { recursive: true, force: true })
  fs.mkdirSync(dataDir, { recursive: true })

  const child = spawn(
    ELECTRON,
    [
      '.',
      `--remote-debugging-port=${port}`,
      // Sans ces drapeaux, Chromium arrête de peindre une fenêtre recouverte :
      // le tournage dépendrait alors de ce qui est visible à l'écran.
      '--disable-backgrounding-occluded-windows',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding'
    ],
    {
      cwd: ROOT,
      env: { ...process.env, VELA_USER_DATA: dataDir, ...(extraEnv || {}) },
      stdio: 'ignore'
    }
  )

  let target = null
  for (let i = 0; i < 600 && !target; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      target = list.find((t) => /index\.html/.test(t.url))
    } catch {
      /* le port n'écoute pas encore */
    }
    if (!target) await sleep(50)
  }
  if (!target) {
    child.kill('SIGTERM')
    throw new Error('la fenêtre de l’app n’est jamais apparue')
  }

  const client = await connect(target.webSocketDebuggerUrl)
  await client.send('Runtime.enable')
  await client.send('Page.enable')
  await client.send('DOM.enable')
  await client.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  if (resize) {
    // La fenêtre réelle est déjà à la bonne taille pendant un tournage : on ne
    // force les métriques que pour les captures d'écran rapides.
    await client.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false
    })
  }

  for (let i = 0; i < 300; i += 1) {
    const ready = await client.send('Runtime.evaluate', {
      expression: `!!document.querySelector('.sidebar')`,
      returnByValue: true
    })
    if (ready.result?.value) break
    await sleep(50)
  }

  if (seed) {
    // Première étape : marquer l'accueil comme déjà vu et installer la
    // démonstration, puisque l'app expose ses réglages au renderer.
    await client.send('Runtime.evaluate', { expression: seed, awaitPromise: true })
    await sleep(900)
  }

  return { child, client, width, height, port, close: () => child.kill('SIGTERM') }
}

/** Outils d'interaction : de vrais événements souris et clavier. */
function makeInputs(client) {
  const evaluate = async (expression) => {
    const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    return result.result?.value
  }

  /** Attend qu'un sélecteur existe et soit visible. */
  const waitFor = async (selector, timeout = 8000) => {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      const found = await evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)})
        if (!el) return false
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      })()`)
      if (found) return true
      await sleep(80)
    }
    throw new Error(`sélecteur introuvable : ${selector}`)
  }

  const centerOf = (selector, index = 0) =>
    evaluate(`(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})]
      const el = els[${index}]
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    })()`)

  const moveRaw = (x, y) =>
    client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0, clickCount: 0 })

  /** Déplacement progressif : une souris qui « glisse » se voit à l'image. */
  const glide = async (from, to, steps = 18, stepMs = 16) => {
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps
      const eased = t * t * (3 - 2 * t)
      await moveRaw(Math.round(from.x + (to.x - from.x) * eased), Math.round(from.y + (to.y - from.y) * eased))
      await sleep(stepMs)
    }
  }

  let pointer = { x: 40, y: 60 }

  const click = async (x, y, { pause = 120 } = {}) => {
    await glide(pointer, { x, y })
    pointer = { x, y }
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
    await sleep(60)
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 })
    await sleep(pause)
  }

  const clickSelector = async (selector, options = {}) => {
    await waitFor(selector)
    const point = await centerOf(selector, options.index ?? 0)
    if (!point) throw new Error(`sélecteur cliquable introuvable : ${selector}`)
    await click(point.x, point.y, options)
    return point
  }

  const hoverSelector = async (selector, index = 0) => {
    await waitFor(selector)
    const point = await centerOf(selector, index)
    if (!point) throw new Error(`sélecteur survolable introuvable : ${selector}`)
    await glide(pointer, point)
    pointer = point
    await sleep(220)
    return point
  }

  const modifiers = { cmd: 4, shift: 8, alt: 1, ctrl: 2 }

  /* Touches nommées : le nom logique, le code virtuel et le caractère doivent
     concorder, sinon un formulaire ne voit pas la touche Entrée. */
  const NAMED = {
    Enter: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' },
    Escape: { key: 'Escape', code: 'Escape', vk: 27 },
    Tab: { key: 'Tab', code: 'Tab', vk: 9 },
    Backspace: { key: 'Backspace', code: 'Backspace', vk: 8 },
    ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
    ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
    Space: { key: ' ', code: 'Space', vk: 32, text: ' ' }
  }

  /** Raccourci clavier, par exemple `key('k', ['cmd'])` ou `key('Enter')`. */
  const key = async (keyName, mods = [], { pause = 200 } = {}) => {
    let mask = 0
    for (const mod of mods) mask |= modifiers[mod]
    const named = NAMED[keyName]
    const base = named
      ? {
          key: named.key,
          code: named.code,
          windowsVirtualKeyCode: named.vk,
          nativeVirtualKeyCode: named.vk,
          modifiers: mask
        }
      : { key: keyName, code: `Key${keyName.toUpperCase()}`, windowsVirtualKeyCode: keyName.toUpperCase().charCodeAt(0), modifiers: mask }
    await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base })
    // C'est l'événement de caractère qui valide un formulaire : sans lui, la
    // touche Entrée reste sans effet.
    if (named?.text && !mask) {
      await client.send('Input.dispatchKeyEvent', {
        type: 'char',
        ...base,
        text: named.text,
        unmodifiedText: named.text
      })
    }
    await sleep(40)
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
    await sleep(pause)
  }

  const type = async (text, { perChar = 45 } = {}) => {
    for (const char of text) {
      await client.send('Input.insertText', { text: char })
      await sleep(perChar)
    }
  }

  return { evaluate, waitFor, centerOf, glide, click, clickSelector, hoverSelector, key, type }
}

/**
 * Cadenceur : écrit les images du screencast dans `dir` à cadence fixe.
 * Quand la page ne peint pas, la dernière image est réécrite — la vidéo garde
 * donc le rythme réel, et les moments immobiles restent immobiles.
 */
function makePacer({ fps = 30, dir, quality = 92, width, height }) {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })

  let latest = null
  let count = 0
  let timer = null
  let stopAt = null

  const write = () => {
    if (!latest) return
    count += 1
    fs.writeFileSync(path.join(dir, `frame-${String(count).padStart(6, '0')}.jpg`), latest)
  }

  return {
    start() {
      timer = setInterval(write, Math.round(1000 / fps))
    },
    /** À brancher sur les images reçues du screencast. */
    push(base64) {
      latest = Buffer.from(base64, 'base64')
      if (!timer) write()
    },
    get frames() {
      return count
    },
    async stop(extraMs = 0) {
      if (extraMs) await sleep(extraMs)
      clearInterval(timer)
      timer = null
      clearInterval(stopAt)
      return count
    },
    options: { format: 'jpeg', quality, maxWidth: width, maxHeight: height, everyNthFrame: 1 }
  }
}

/*
 * Attache le protocole à l'onglet (la page web elle-même), pour agir dedans :
 * défiler une vraie page, c'est ce qui distingue une démonstration d'une suite
 * de captures. Les vues natives ne reçoivent pas les événements envoyés au
 * rendu de l'app, d'où cette seconde connexion.
 */
async function attachPage(port, pattern, timeout = 15000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const target = list.find((item) => pattern.test(item.url))
      if (target) {
        const client = await connect(target.webSocketDebuggerUrl)
        await client.send('Runtime.enable')
        await client.send('Page.enable')
        return {
          url: target.url,
          evaluate: async (expression) =>
            (await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value,
          /** Défilement réel : petites impulsions de molette, comme une main. */
          wheel: async (x, y, steps = 6, dy = 170, pause = 95) => {
            for (let i = 0; i < steps; i += 1) {
              await client.send('Input.dispatchMouseEvent', {
                type: 'mouseWheel',
                x,
                y,
                deltaX: 0,
                deltaY: dy,
                buttons: 0
              })
              await sleep(pause)
            }
          },
          close: () => client.close()
        }
      }
    } catch {
      /* le port n'écoute pas encore, ou l'onglet n'existe pas encore */
    }
    await sleep(200)
  }
  return null
}

module.exports = { ROOT, sleep, connect, launchApp, makeInputs, makePacer, attachPage }
