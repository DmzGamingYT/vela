/*
 * Capture les écrans de l'onboarding de Vela, sur un profil vierge.
 *
 *   node scripts/capture-onboarding.cjs
 *
 * Sortie : screenshots/onboarding/01..05.png + une galerie autonome (images
 * embarquées) pour l'aperçu, sans serveur.
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'screenshots', 'onboarding')
const PORT = 9388
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const STEPS = [
  { file: '01-moteur.png', label: '1 · Moteur' },
  { file: '02-bruit.png', label: '2 · Bruit' },
  { file: '03-habitudes.png', label: '3 · Habitués' },
  { file: '04-teinte.png', label: '4 · Teinte' },
  { file: '05-rien-ne-sort.png', label: '5 · Rien ne sort' }
]

;(async () => {
  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(path.join(OUT, 'data'), { recursive: true })

  const child = spawn(
    require('electron'),
    ['.', `--remote-debugging-port=${PORT}`, '--disable-backgrounding-occluded-windows'],
    {
      cwd: ROOT,
      env: { ...process.env, VELA_USER_DATA: path.join(OUT, 'data') },
      stdio: 'ignore'
    }
  )

  try {
    let target = null
    for (let i = 0; i < 400 && !target; i += 1) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
        target = list.find((t) => /index\.html/.test(t.url))
      } catch {
        /* pas encore prêt */
      }
      if (!target) await sleep(100)
    }
    if (!target) throw new Error('pas de cible DevTools')

    const ws = new WebSocket(target.webSocketDebuggerUrl)
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = Math.floor(Math.random() * 1e6)
        const onMessage = (event) => {
          const message = JSON.parse(event.data)
          if (message.id !== id) return
          ws.removeEventListener('message', onMessage)
          if (message.error) reject(new Error(message.error.message))
          else resolve(message.result)
        }
        ws.addEventListener('message', onMessage)
        ws.send(JSON.stringify({ id, method, params }))
      })
    await new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = reject
    })

    // L'onboarding n'apparaît qu'une fois l'état chargé.
    let visible = false
    for (let i = 0; i < 120 && !visible; i += 1) {
      const check = await send('Runtime.evaluate', {
        expression: `Boolean(document.querySelector('.onboarding-sheet'))`,
        returnByValue: true
      })
      visible = check.result?.value === true
      if (!visible) await sleep(250)
    }
    if (!visible) throw new Error('onboarding absent (profil déjà marqué ?)')

    // Laisse l'animation d'ouverture se poser.
    await sleep(1200)

    for (const [index, step] of STEPS.entries()) {
      if (index > 0) {
        await send('Runtime.evaluate', {
          expression: `document.querySelector('.onboarding-next')?.click()`
        })
        await sleep(650)
      }
      const shot = await send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(path.join(OUT, step.file), Buffer.from(shot.data, 'base64'))
      console.log('capturé', step.file)
    }
    ws.close()
  } finally {
    await sleep(300)
    child.kill('SIGTERM')
  }

  const cards = STEPS.map((step) => {
    const data = fs.readFileSync(path.join(OUT, step.file)).toString('base64')
    return `<figure><figcaption>${step.label}</figcaption><img alt="${step.label}" src="data:image/png;base64,${data}"></figure>`
  }).join('\n')

  fs.writeFileSync(
    path.join(OUT, 'index.html'),
    `<!doctype html><html lang="fr"><meta charset="utf-8">
<title>Onboarding Vela</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 32px; background: #f2efe9; font: 14px/1.5 -apple-system, system-ui, sans-serif; color: #1b1a18; }
  h1 { margin: 0 0 4px; font: 400 28px/1.1 "Iowan Old Style", Georgia, serif; }
  p.lede { margin: 0 0 28px; color: #6b6862; }
  .grid { display: grid; gap: 26px; grid-template-columns: repeat(auto-fit, minmax(560px, 1fr)); }
  figure { margin: 0; background: #fff; border: 1px solid #e3ded5; border-radius: 16px; overflow: hidden; }
  figcaption { padding: 10px 14px; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; color: #6b6862; border-bottom: 1px solid #eee9e0; }
  img { display: block; width: 100%; height: auto; }
</style>
<h1>L’onboarding de Vela, écran par écran</h1>
<p class="lede">Captures réelles, profil vierge, 1380 × 880.</p>
<div class="grid">${cards}</div>`
  )
  console.log('galerie :', path.join('screenshots', 'onboarding', 'index.html'))
})().catch((error) => {
  console.error('ÉCHEC', error.message)
  process.exit(1)
})
