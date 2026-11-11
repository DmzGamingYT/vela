/* Capture de référence de l'en-tête de la barre latérale.
   Usage : node scripts/capture-sidebar.cjs <tag> [racine de l'app]

   Produit, dans screenshots/sidebar/<tag>/ :
     - depliee-clair.png / depliee-sombre.png
     - repliee-clair.png / repliee-sombre.png
     - plein-ecran-clair.png / plein-ecran-sombre.png
     - etroite-clair.png / etroite-sombre.png
     - rapport.json (géométrie mesurée + attentes)

   macOS uniquement pour les captures natives : `screencapture -l` inclut les
   feux de circulation, contrairement à une capture CDP. Le script compile un
   petit utilitaire Swift dans node_modules/.cache pour retrouver l'identifiant
   de la fenêtre. Aucun réseau, aucun commit.
*/
const { execFileSync, spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const TAG = process.argv[2] || 'apres'
const ROOT = path.resolve(__dirname, '..')
const APP_ROOT = path.resolve(process.argv[3] || ROOT)
const OUT = path.join(ROOT, 'screenshots', 'sidebar', TAG)
const DATA = path.join(OUT, 'data')
const PORT = Number(process.env.VELA_CAPTURE_PORT || 9567)
const INSPECT = PORT + 1
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/* Identifiant de fenêtre CoreGraphics : le seul moyen fiable de capturer une
   fenêtre précise (et pas ce qui la recouvre) avec ses feux macOS. */
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
  const source = path.join(cache, 'vela-window-id.swift')
  const binary = path.join(cache, 'vela-window-id')
  if (!fs.existsSync(binary) || fs.statSync(binary).mtimeMs < fs.statSync(source).mtimeMs) {
    fs.writeFileSync(source, SWIFT_SOURCE)
    execFileSync('swiftc', ['-O', source, '-o', binary], { stdio: 'ignore' })
  }
  return binary
}

function windowId(title) {
  const output = execFileSync(windowTool(), { encoding: 'utf8' })
  const windows = JSON.parse(output || '[]')
  const match = windows.find((entry) => entry.name === title)
  if (!match) throw new Error(`fenêtre « ${title} » introuvable (${output.trim()})`)
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
          return result.result ? result.result.value : undefined
        },
        close: () => ws.close()
      })
    ws.onerror = (event) => reject(new Error(event.message || 'WebSocket en erreur'))
  })
}

async function waitForTarget(url, pick, attempts = 500) {
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
  if (process.platform !== 'darwin') {
    throw new Error(
      'les captures de référence avec feux macOS passent par screencapture (macOS uniquement)'
    )
  }
  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(DATA, { recursive: true })

  const child = spawn(
    require('electron'),
    ['.', `--inspect=${INSPECT}`, `--remote-debugging-port=${PORT}`],
    {
      cwd: APP_ROOT,
      env: { ...process.env, VELA_USER_DATA: DATA },
      stdio: 'ignore'
    }
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
    const mainEval = (expression) => main.evaluate(expression)
    const setTheme = async (theme) => {
      await renderer.evaluate(
        `window.vela.settings.update({ onboarded: true, themeId: 'indigo', theme: '${theme}' })`
      )
      await sleep(900)
    }
    const setCollapsed = async (collapsed) => {
      await renderer.evaluate(`window.vela.settings.update({ sidebarCollapsed: ${collapsed} })`)
      await sleep(650)
    }
    const setFullScreen = async (full) => {
      await mainEval(
        `(() => { const w = ${mainWindow}; if (!w) return false; w.setFullScreen(${full}); return true })()`
      )
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const state = await mainEval(`${mainWindow}.isFullScreen()`)
        if (state === full) break
        await sleep(100)
      }
      await sleep(900)
    }
    const resize = async (width, height, center = true) => {
      await mainEval(
        `(() => { const w = ${mainWindow}; w.show(); w.focus(); w.setSize(${width}, ${height}); ${center ? 'w.center();' : ''} return w.getBounds() })()`
      )
      await sleep(600)
    }
    const measure = async () =>
      renderer.evaluate(`(() => {
        const rect = (selector) => {
          const node = document.querySelector(selector)
          if (!node) return null
          const box = node.getBoundingClientRect()
          return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom }
        }
        return {
          platform: window.vela.platform,
          dpr: window.devicePixelRatio,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          sidebar: rect('.sidebar'),
          header: rect('.sidebar-top'),
          wordmark: rect('.sidebar-top .wordmark'),
          spaceHead: rect('.space-head'),
          avatar: rect('.space-head .space-avatar'),
          tabsHead: rect('.tabs-head')
        }
      })()`)
    const shoot = async (name) => {
      await sleep(300)
      mainEval(
        `(() => { const w = ${mainWindow}; w.show(); w.focus(); return w.getBounds() })()`
      ).catch(() => {})
      await sleep(200)
      const id = windowId('Vela')
      const file = path.join(OUT, `${name}.png`)
      execFileSync('screencapture', ['-x', '-o', `-l${id}`, file])
      const geometry = await measure()
      console.log('capturé', path.relative(ROOT, file))
      return geometry
    }

    const expectations = {
      /* Dernier feu macOS : il finit à 79,5 px. Le wordmark doit commencer au
         moins 11,5 px plus loin et rester centré sur la ligne (≈ 28 px). */
      macLastLight: 79.5,
      minGap: 11.5,
      sidebarInset: 24
    }
    const checks = []
    const strict = process.env.VELA_CAPTURE_STRICT !== '0'
    const check = (label, condition, detail) => {
      checks.push({ label, ok: Boolean(condition), detail })
      if (!condition && strict) throw new Error(`${label} — ${JSON.stringify(detail)}`)
      if (!condition)
        console.warn('  (état avant : attente non remplie)', label, JSON.stringify(detail))
    }

    await resize(1380, 880)
    await setCollapsed(false)

    for (const mode of ['light', 'dark']) {
      await setTheme(mode)
      const state = await shoot(`depliee-${mode === 'light' ? 'clair' : 'sombre'}`)
      check('dépliée : barre présente', Boolean(state.sidebar) && Boolean(state.wordmark), state)
      check(
        'dépliée : wordmark sur la marge du sélecteur',
        Math.abs(state.wordmark.x - state.avatar.x) < 0.6 &&
          Math.abs(state.wordmark.x - (state.sidebar.x + expectations.sidebarInset)) < 0.6,
        { wordmark: state.wordmark, avatar: state.avatar, sidebar: state.sidebar }
      )
      check(
        'dépliée : 12 px après le dernier feu macOS',
        state.wordmark.x - expectations.macLastLight >= expectations.minGap,
        { x: state.wordmark.x, lastLight: expectations.macLastLight }
      )
      check(
        'dépliée : centré verticalement avec les feux',
        Math.abs(state.wordmark.y + state.wordmark.height / 2 - 28) <= 1.5,
        state.wordmark
      )
    }

    for (const mode of ['light', 'dark']) {
      await setTheme(mode)
      await setCollapsed(true)
      const state = await shoot(`repliee-${mode === 'light' ? 'clair' : 'sombre'}`)
      check('repliée : plus de barre ni de wordmark', !state.sidebar && !state.wordmark, state)
    }

    await setCollapsed(false)
    for (const mode of ['light', 'dark']) {
      await setTheme(mode)
      await setFullScreen(true)
      const state = await shoot(`plein-ecran-${mode === 'light' ? 'clair' : 'sombre'}`)
      check(
        'plein écran : wordmark sur la marge du sélecteur',
        Boolean(state.wordmark) && Math.abs(state.wordmark.x - state.avatar.x) < 0.6,
        { wordmark: state.wordmark, avatar: state.avatar }
      )
      await setFullScreen(false)
    }

    for (const mode of ['light', 'dark']) {
      await setTheme(mode)
      await resize(980, 700)
      const state = await shoot(`etroite-${mode === 'light' ? 'clair' : 'sombre'}`)
      check(
        'étroite : barre toujours alignée',
        Boolean(state.wordmark) && Math.abs(state.wordmark.x - state.avatar.x) < 0.6,
        state
      )
      check(
        'étroite : pas de chevauchement avec les feux',
        state.wordmark.x - expectations.macLastLight >= expectations.minGap,
        state.wordmark
      )
    }

    await resize(1380, 880)
    const about = {}
    for (const mode of ['light', 'dark']) {
      await setTheme(mode)
      const opened = await renderer.evaluate(
        `(() => { const button = document.querySelector('button[title^="Réglages"]'); if (!button) return false; button.click(); return true })()`
      )
      check('Réglages : panneau ouvert', opened === true, opened)
      await sleep(1600)
      const selected = await renderer.evaluate(
        `(() => { const button = [...document.querySelectorAll('.settings-nav-item')].find((item) => item.textContent.includes('propos')); if (!button) return false; button.click(); return true })()`
      )
      check('Réglages : section À propos', selected === true, selected)
      await sleep(800)
      await shoot(`reglages-apropos-${mode === 'light' ? 'clair' : 'sombre'}`)
      about[mode] = await renderer.evaluate(`(() => {
        const version = document.querySelector('.about-version')
        const navVersion = document.querySelector('.settings-nav-version')
        const navMark = document.querySelector('.settings-nav-brand .vela-mark')
        return {
          aboutVersion: version ? version.textContent.trim() : null,
          navVersion: navVersion ? navVersion.textContent.trim() : null,
          navMark: Boolean(navMark)
        }
      })()`)
      await renderer.evaluate(
        `(() => { const button = document.querySelector('.settings-head .icon-btn'); if (button) button.click(); return true })()`
      )
      await sleep(600)
    }
    check(
      'Réglages › À propos : pastille de version déplacée',
      about.light.aboutVersion !== null &&
        about.light.navVersion === null &&
        about.light.navMark === false &&
        about.dark.aboutVersion !== null &&
        about.dark.navVersion === null &&
        about.dark.navMark === false,
      about
    )

    await resize(1380, 880)
    fs.writeFileSync(
      path.join(OUT, 'rapport.json'),
      JSON.stringify({ tag: TAG, appRoot: APP_ROOT, expectations, checks, about }, null, 2)
    )
    console.log(`\n${checks.length} vérifications géométriques OK · ${path.relative(ROOT, OUT)}`)
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
