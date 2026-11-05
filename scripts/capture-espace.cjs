/* Captures de la fenêtre « Espace » : clair, sombre, haute et basse.
   Usage : node scripts/capture-espace.cjs <tag> */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const ROOT = path.resolve(__dirname, '..')
const TAG = process.argv[2] || 'apres'
const OUT = path.join(ROOT, 'screenshots', 'espace', TAG)
const PORT = 9394
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  fs.mkdirSync(path.join(OUT, 'data'), { recursive: true })
  const child = spawn(require('electron'), ['.', `--remote-debugging-port=${PORT}`], {
    cwd: ROOT,
    env: { ...process.env, VELA_USER_DATA: path.join(OUT, 'data') },
    stdio: 'ignore'
  })
  try {
    let target = null
    for (let i = 0; i < 500 && !target; i += 1) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
        target = list.find((t) => /index\.html/.test(t.url))
      } catch {}
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

    const evaluate = (expression) =>
      send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })

    // La fenêtre native n’est pas pilotable depuis la cible de page : on fixe
    // la taille de la vue, ce que captureScreenshot rend à l’identique.
    const resize = async (width, height) => {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false
      })
      await sleep(700)
    }
    const shoot = async (name) => {
      const shot = await send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(shot.data, 'base64'))
      console.log('capturé', name)
    }
    const setTheme = async (theme) => {
      await evaluate(`window.vela.settings.update({ theme: ${JSON.stringify(theme)} })`)
      await sleep(700)
      const label = theme === 'light' ? 'Clair' : 'Sombre'
      await evaluate(
        `(() => { const button = Array.from(document.querySelectorAll('.space-mode-btn')).find((node) => node.textContent.includes(${JSON.stringify(label)})); button?.click(); return Boolean(button) })()`
      )
      await sleep(500)
    }
    const openDialog = async () => {
      const open = await evaluate(
        `Boolean(document.querySelector('.space-sheet-v2')) || (document.querySelector('.space-add')?.click(), true)`
      )
      await sleep(800)
      return open
    }

    await evaluate(`window.vela.settings.update({ onboarded: true })`)
    await sleep(1800)
    await resize(1280, 980)
    await openDialog()
    // Un nom réel : l’aperçu montre le texte saisi, pas le nom de repli.
    await evaluate(
      `(() => {
        const input = document.querySelector('.space-name-input')
        if (!input) return false
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        setter.call(input, 'Veille')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.blur()
        return true
      })()`
    )
    await sleep(400)

    await setTheme('light')
    await shoot('haute-clair')
    await setTheme('dark')
    await shoot('haute-sombre')

    await resize(1280, 660)
    await shoot('basse-sombre')
    await setTheme('light')
    await shoot('basse-clair')

    ws.close()
    child.kill('SIGTERM')
  } catch (error) {
    child.kill('SIGTERM')
    throw error
  }
})().catch((error) => {
  console.error('ÉCHEC', error.message)
  process.exit(1)
})
