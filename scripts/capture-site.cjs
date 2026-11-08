/* Recapture des images de la page d’accueil du site.

   Usage :
     node scripts/capture-site.cjs                     les cinq scènes
     node scripts/capture-site.cjs --only=atelier      une seule scène
     node scripts/capture-site.cjs --keep              réutilise le profil précédent

   Produit, dans site/captures-src/ : accueil-clair.jpg, accueil-sombre.jpg,
   espaces.jpg, coup-d-oeil.jpg, atelier.jpg — en 1440 × 900.

   La capture passe par `screencapture -l` : le coup d’œil est une vue native
   posée au-dessus du renderer, une capture CDP laisserait un trou à sa place,
   et les feux macOS font partie de l’image. macOS uniquement.
*/
const { execFileSync, spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'site', 'captures-src')
const OUT = path.join(ROOT, 'screenshots', 'site')
const DATA = path.join(OUT, 'data')
const PORT = 9573
const INSPECT = PORT + 1
const WIDTH = 1440
const HEIGHT = 900

const only = (process.argv.find((arg) => arg.startsWith('--only=')) || '').slice(7)
const keep = process.argv.includes('--keep')
const scenes = only ? only.split(',').map((name) => name.trim()) : null
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const SWIFT_SOURCE = `
import CoreGraphics
import Foundation

let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
var windows: [[String: Any]] = []
if let info = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] {
  for w in info {
    let owner = w[kCGWindowOwnerName as String] as? String ?? ""
    let name = w[kCGWindowName as String] as? String ?? ""
    let layer = w[kCGWindowLayer as String] as? Int ?? -1
    if layer == 0 && (owner.lowercased().contains("electron") || owner.lowercased().contains("vela")) {
      windows.append([
        "id": w[kCGWindowNumber as String] as? Int ?? 0,
        "pid": w[kCGWindowOwnerPID as String] as? Int ?? 0,
        "owner": owner,
        "name": name,
        "bounds": w[kCGWindowBounds as String] as? [String: Any] ?? [:]
      ])
    }
  }
}
if let data = try? JSONSerialization.data(withJSONObject: windows),
   let text = String(data: data, encoding: .utf8) {
  print(text)
}
`

function windowTool() {
  const cache = path.join(ROOT, 'node_modules', '.cache')
  fs.mkdirSync(cache, { recursive: true })
  const source = path.join(cache, 'vela-site-window.swift')
  const binary = path.join(cache, 'vela-site-window')
  fs.writeFileSync(source, SWIFT_SOURCE)
  if (!fs.existsSync(binary) || fs.statSync(binary).mtimeMs <= fs.statSync(source).mtimeMs) {
    execFileSync('swiftc', ['-O', source, '-o', binary], { stdio: 'ignore' })
  }
  return binary
}

/* Une fenêtre « Vela » peut déjà être ouverte à côté : seule la fenêtre du
   processus lancé ici doit être capturée, sinon on photographie une autre
   instance et le profil neuf ne sert à rien. */
function windowId(pid) {
  const output = execFileSync(windowTool(), { encoding: 'utf8' })
  const windows = JSON.parse(output || '[]')
  const mine = windows.filter((entry) => entry.pid === pid)
  const match = mine.find((entry) => entry.name === 'Vela') ?? mine[0]
  if (!match) throw new Error(`fenêtre de la capture introuvable (pid ${pid}) : ${output.trim()}`)
  return match.id
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    const send = (method, params = {}) =>
      new Promise((callResolve, callReject) => {
        const id = Math.floor(Math.random() * 1e6)
        const onMessage = (event) => {
          const message = JSON.parse(event.data)
          if (message.id !== id) return
          ws.removeEventListener('message', onMessage)
          if (message.error) callReject(new Error(message.error.message))
          else callResolve(message.result)
        }
        ws.addEventListener('message', onMessage)
        ws.send(JSON.stringify({ id, method, params }))
      })
    ws.onopen = () =>
      resolve({
        send,
        evaluate: async (expression) => {
          const result = await send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true
          })
          if (result.exceptionDetails) {
            throw new Error(result.exceptionDetails.exception?.description || 'exception dans la page')
          }
          return result.result ? result.result.value : undefined
        },
        close: () => ws.close()
      })
    ws.onerror = (event) => reject(new Error(event.message || 'WebSocket en erreur'))
  })
}

async function waitForTarget(url, pick, attempts = 600) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const list = await (await fetch(url)).json()
      const target = list.find(pick)
      if (target) return target
    } catch {
      /* le port n'écoute pas encore */
    }
    await sleep(100)
  }
  throw new Error(`cible DevTools introuvable sur ${url}`)
}

;(async () => {
  if (process.platform !== 'darwin') throw new Error('captures natives : macOS uniquement')
  fs.mkdirSync(SRC, { recursive: true })
  if (!keep) fs.rmSync(DATA, { recursive: true, force: true })
  fs.mkdirSync(DATA, { recursive: true })
  fs.mkdirSync(OUT, { recursive: true })

  const child = spawn(
    require('electron'),
    ['.', `--inspect=${INSPECT}`, `--remote-debugging-port=${PORT}`],
    { cwd: ROOT, env: { ...process.env, VELA_USER_DATA: DATA }, stdio: 'ignore' }
  )

  let renderer
  let main
  try {
    const [pageTarget, mainTarget] = await Promise.all([
      waitForTarget(`http://127.0.0.1:${PORT}/json/list`, (entry) => /index\.html/.test(entry.url)),
      waitForTarget(`http://127.0.0.1:${INSPECT}/json/list`, (entry) => entry.type === 'node')
    ])
    renderer = await connect(pageTarget.webSocketDebuggerUrl)
    main = await connect(mainTarget.webSocketDebuggerUrl)

    const mainWindow = `process.mainModule.require("electron").BrowserWindow.getAllWindows().find((w) => w.getTitle() === "Vela")`
    const evaluate = (expression) => renderer.evaluate(expression)

    const resize = async () => {
      const bounds = await main.evaluate(
        `(() => { const w = ${mainWindow}; w.show(); w.focus(); w.setSize(${WIDTH}, ${HEIGHT}); w.center(); return w.getBounds() })()`
      )
      if (bounds && (bounds.width !== WIDTH || bounds.height !== HEIGHT)) {
        console.warn('  (fenêtre inattendue)', JSON.stringify(bounds))
      }
      await sleep(700)
    }

    const shoot = async (name) => {
      await sleep(350)
      await main
        .evaluate(`(() => { const w = ${mainWindow}; w.show(); w.focus(); return w.getBounds() })()`)
        .catch(() => {})
      await sleep(250)
      const png = path.join(OUT, `${name}.png`)
      execFileSync('screencapture', ['-x', '-o', `-l${windowId(child.pid)}`, png])
      const jpg = path.join(SRC, `${name}.jpg`)
      execFileSync('sips', [
        '-s', 'format', 'jpeg',
        '-s', 'formatOptions', '90',
        '--resampleHeightWidth', String(HEIGHT), String(WIDTH),
        png,
        '--out', jpg
      ], { stdio: 'ignore' })
      const size = fs.statSync(jpg).size
      console.log(`  ${name}.jpg  ${(size / 1024).toFixed(0)} Ko`)
      return jpg
    }

    const waitFor = async (label, expression, timeout = 20000, every = 400) => {
      const started = Date.now()
      while (Date.now() - started < timeout) {
        if (await evaluate(expression)) return true
        await sleep(every)
      }
      console.warn(`  (attente dépassée : ${label})`)
      return false
    }

    const pressEscape = async () => {
      for (const type of ['keyDown', 'keyUp']) {
        await renderer.send('Input.dispatchKeyEvent', {
          type,
          key: 'Escape',
          code: 'Escape',
          windowsVirtualKeyCode: 27,
          nativeVirtualKeyCode: 27
        })
      }
      await sleep(250)
    }
    const sheetOpen = () => evaluate(`Boolean(document.querySelector('.space-sheet-v2'))`)
    // Échap, puis « Abandonner » quand le dialogue signale des modifications
    // non enregistrées : sans ça, la fenêtre reste ouverte sur les scènes
    // suivantes et le coup d’œil comme l’atelier sont photographiés par-dessus.
    const closeSheet = async () => {
      if (!(await sheetOpen())) return true
      await pressEscape()
      await sleep(700)
      if (!(await sheetOpen())) return true
      await evaluate(
        `(() => {
          const button = [...document.querySelectorAll('.space-sheet-v2 button')].find((node) => /^abandonner$/i.test((node.textContent || '').trim()))
          if (button) { button.click(); return true }
          return false
        })()`
      )
      await sleep(900)
      if (!(await sheetOpen())) return true
      await pressEscape()
      await sleep(700)
      if (await sheetOpen()) console.warn('  (fenêtre « Espace » toujours ouverte)')
      return !(await sheetOpen())
    }

    const want = (name) => !scenes || scenes.includes(name)

    /* --- Préparation du profil -------------------------------------------- */

    await evaluate(`window.vela.settings.update({ onboarded: true, theme: 'light', sidebarCollapsed: false })`)
    await sleep(2400)
    await resize()

    // L’espace « Veille » se crée d’abord : sa création l’active, et les
    // onglets ouverts ensuite partiraient chez lui.
    const view = await evaluate(`window.vela.view()`)
    if (!view.spaces.some((space) => /veille/i.test(space.name))) {
      await evaluate(`window.vela.spaces.create({ name: 'Veille', color: '#E8805A' })`)
      await sleep(1200)
    }
    const seeded = await evaluate(`window.vela.view()`)
    const personnel = seeded.spaces.find((space) => /personnel/i.test(space.name)) ?? seeded.spaces[0]
    if (personnel) await evaluate(`window.vela.spaces.activate(${JSON.stringify(personnel.id)})`)
    await sleep(1000)

    // Deux onglets et une visite réelle : l’accueil montre alors des pages
    // récentes au lieu d’un profil vide.
    const before = await evaluate(`window.vela.view()`)
    const homeTab = before.tabs.find((tab) => /^vela:\/\/home|^about:start/.test(tab.url)) ?? before.tabs[0]
    await evaluate(`window.vela.tabs.create({ url: 'https://fr.wikipedia.org/wiki/Navigateur_web' })`)
    await sleep(4200)
    if (homeTab) await evaluate(`window.vela.tabs.activate(${JSON.stringify(homeTab.id)})`)
    await sleep(1200)

    const setTheme = async (theme) => {
      await evaluate(`window.vela.settings.update({ theme: '${theme}' })`)
      await sleep(1100)
    }

    /* --- Accueil, clair et sombre ----------------------------------------- */

    for (const [name, theme] of [
      ['accueil-clair', 'light'],
      ['accueil-sombre', 'dark']
    ]) {
      if (!want(name)) continue
      await setTheme(theme)
      await shoot(name)
    }

    /* --- Fenêtre « Espace » ------------------------------------------------ */

    if (want('espaces')) {
      await setTheme('light')
      const opened = await evaluate(
        `(() => { if (document.querySelector('.space-sheet-v2')) return true; const add = document.querySelector('.space-add'); if (!add) return false; add.click(); return true })()`
      )
      if (!opened) console.warn('  (bouton « nouvel espace » introuvable)')
      await sleep(1200)
      await evaluate(
        `(() => {
          const input = document.querySelector('.space-name-input')
          if (!input) return false
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
          setter.call(input, 'Recherche')
          input.dispatchEvent(new Event('input', { bubbles: true }))
          return true
        })()`
      )
      await sleep(900)
      await shoot('espaces')
      await closeSheet()
    }

    /* --- Coup d’œil -------------------------------------------------------- */

    if (want('coup-d-oeil')) {
      await closeSheet()
      await setTheme('light')
      const opened = await evaluate(
        `window.vela.peek.open({ url: 'https://fr.wikipedia.org/wiki/Navigateur_web' })`
      )
      if (!opened) console.warn('  (coup d’œil refusé)')
      await sleep(5200)
      await waitFor(
        'coup d’œil chargé',
        `Boolean(document.querySelector('.peek-card, .peek, [class*="peek"]'))`,
        8000
      )
      // Les vues natives sont calées sur la surface mesurée : un redimension-
      // nement force la carte à renvoyer sa géométrie définitive, sinon la page
      // reste au rectangle de son animation d’ouverture et couvre l’en-tête.
      await main.evaluate(
        `(() => { const w = ${mainWindow}; w.setSize(${WIDTH}, ${HEIGHT - 1}); w.setSize(${WIDTH}, ${HEIGHT}); return true })()`
      )
      await sleep(1400)
      await shoot('coup-d-oeil')
      await evaluate(`window.vela.peek.close()`)
      await sleep(800)
    }

    /* --- Atelier : un tunnel réel ----------------------------------------- */

    if (want('atelier')) {
      await closeSheet()
      await setTheme('light')
      const switched = await evaluate(
        `(() => { const button = document.querySelector('.rail-mode[title^="Atelier"]'); if (!button) return false; button.click(); return true })()`
      )
      if (!switched) console.warn('  (bouton Atelier introuvable)')
      await sleep(2600)
      const typed = await evaluate(
        `(() => {
          const input = document.querySelector('.tw-field input')
          if (!input) return false
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
          setter.call(input, 'Comparer les hébergeurs d’images libres')
          input.dispatchEvent(new Event('input', { bubbles: true }))
          return true
        })()`
      )
      if (!typed) console.warn('  (champ du tunnel introuvable)')
      await sleep(600)
      await evaluate(
        `(() => { const button = document.querySelector('.tw-field button[type="submit"]'); if (!button) return false; button.click(); return true })()`
      )
      // Le tunnel explore d’abord : les sources arrivent sur l’étape 2, la
      // carte ne se dessine qu’une fois « Carte » choisi.
      const explored = await waitFor(
        'sources explorées',
        `document.querySelectorAll('.tw-step') && Boolean([...document.querySelectorAll('.tw-step')].find((node) => /carte/i.test(node.textContent || ''))?.disabled === false)`,
        150000,
        1500
      )
      if (explored) {
        await sleep(2000)
        await evaluate(
          `(() => {
            const step = [...document.querySelectorAll('.tw-step')].find((node) => /carte/i.test(node.textContent || ''))
            if (step) step.click()
            return Boolean(step)
          })()`
        )
      } else {
        console.warn('  (tunnel vide : capture de l’état courant)')
      }
      const drawn = await waitFor('carte dessinée', `document.querySelectorAll('.tunnel-node').length > 3`, 30000, 800)
      if (!drawn) console.warn('  (carte non dessinée : capture de l’état courant)')
      await sleep(3000)
      await shoot('atelier')
    }

    console.log('\nTerminé. Dériver les variantes :')
    console.log('  node site/tools/captures.mjs --force')
  } finally {
    try {
      renderer?.close()
      main?.close()
    } catch {
      /* déjà fermé */
    }
    await sleep(200)
    child.kill('SIGTERM')
  }
})().catch((error) => {
  console.error('ÉCHEC', error.message)
  process.exit(1)
})
