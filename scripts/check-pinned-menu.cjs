/* Exerce le menu des onglets épinglés sur l'app réelle : clavier, souris,
   déplacement, veille, fermeture et annulation. Aucun réseau : pages `data:`.

   Usage : node scripts/check-pinned-menu.cjs */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const PORT = 9413
const OUT = path.join(ROOT, 'screenshots', 'menus', 'harness')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

;(async () => {
  fs.rmSync(OUT, { recursive: true, force: true })
  const data = path.join(OUT, 'data')
  fs.mkdirSync(data, { recursive: true })
  const child = spawn(require('electron'), ['.', `--remote-debugging-port=${PORT}`], {
    cwd: ROOT,
    env: { ...process.env, VELA_USER_DATA: data },
    stdio: 'ignore'
  })

  const failures = []
  const checks = []
  const notes = []
  const check = (name, ok, detail = '') => {
    checks.push({ name, ok: Boolean(ok), detail })
    if (!ok) failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
  }

  let ws
  try {
    let target = null
    for (let attempt = 0; attempt < 400 && !target; attempt += 1) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
        target = list.find((entry) => /index\.html/.test(entry.url))
      } catch {
        /* le port n'écoute pas encore */
      }
      if (!target) await sleep(100)
    }
    if (!target) throw new Error('pas de cible DevTools')

    ws = new WebSocket(target.webSocketDebuggerUrl)
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

    /** Une expression qui échoue ne doit pas arrêter le harnais : on note et on continue. */
    const evaluate = async (expression) => {
      try {
        const result = await send('Runtime.evaluate', {
          expression,
          awaitPromise: true,
          returnByValue: true
        })
        if (result.exceptionDetails) {
          notes.push(`exception évaluée : ${result.exceptionDetails.text} — ${expression.slice(0, 90)}`)
          return null
        }
        return result.result.value
      } catch (error) {
        notes.push(`évaluation en échec : ${error.message} — ${expression.slice(0, 90)}`)
        return null
      }
    }

    await evaluate(`window.vela.settings.update({ onboarded: true, theme: 'light' })`)
    await sleep(2600)
    await evaluate(`(() => {
      window.__velaErrors = []
      window.addEventListener('error', (event) => window.__velaErrors.push(String(event.message)))
      window.addEventListener('unhandledrejection', (event) => window.__velaErrors.push(String(event.reason)))
      return true
    })()`)

    await evaluate(`(async () => {
      const make = async (title) => {
        const html = '<title>' + title + '</title><h1>' + title + '</h1>'
        const tab = await window.vela.tabs.create({ url: 'data:text/html,' + encodeURIComponent(html) })
        await window.vela.tabs.pin(tab.id, true)
        return tab.id
      }
      await make('Alpha')
      await make('Bravo')
      await make('Charlie')
      await make('Delta')
      return true
    })()`)
    await sleep(1600)

    const pinned = async () => {
      const view = await evaluate(`window.vela.view()`)
      return view?.tabs.filter((tab) => tab.pinned) ?? []
    }
    const before = (await pinned()).map((tab) => tab.id)
    check('quatre épinglés créés', before.length === 4, before.join(','))
    notes.push(
      `états : ${JSON.stringify(
        (await pinned()).map((tab) => ({ m: tab.muted, a: tab.audible, s: tab.asleep }))
      )}`
    )

    // 1. Ouverture au clavier (touche Menu) sur la première tuile.
    await evaluate(`(() => {
      const tile = document.querySelector('.mini-tile[data-tab-id]')
      tile.focus()
      tile.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true }))
      return true
    })()`)
    await sleep(350)
    const keyboardMenu = await evaluate(`(() => {
      const menu = document.querySelector('[role="menu"]')
      return menu ? { items: menu.querySelectorAll('[role="menuitem"]').length, focused: document.activeElement?.getAttribute('role') } : null
    })()`)
    check('menu ouvert au clavier', Boolean(keyboardMenu), JSON.stringify(keyboardMenu))
    check('premier élément focalisé', keyboardMenu?.focused === 'menuitem')
    check('en-tête présent', (await evaluate(`Boolean(document.querySelector('.tile-menu-head-title'))`)) === true)
    const labels = await evaluate(`Array.from(document.querySelectorAll('[role="menuitem"]')).map((node) => node.textContent)`)
    check(
      'actions attendues dans le menu épinglé',
      ['Recharger', 'Copier comme lien Markdown', 'Ouvrir en vue scindée', 'Dupliquer dans un nouvel onglet', 'Désépingler', 'Fermer'].every(
        (label) => (labels ?? []).some((text) => String(text).includes(label))
      ),
      JSON.stringify(labels)
    )

    // 2. Échap referme et rend le focus à la tuile.
    await evaluate(`(() => {
      const menu = document.querySelector('[role="menu"]')
      if (!menu) return false
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      return true
    })()`)
    await sleep(250)
    const afterEscape = await evaluate(`(() => ({
      menu: Boolean(document.querySelector('[role="menu"]')),
      focusedTile: document.activeElement?.classList.contains('mini-tile') ?? false
    }))()`)
    check('Échap ferme le menu', afterEscape?.menu === false)
    check('focus rendu à la tuile', afterEscape?.focusedTile === true)

    // 3. Ouverture à la souris, puis « Déplacer à droite ».
    const openMouse = async () =>
      evaluate(`(() => {
        const tile = document.querySelector('.mini-tile[data-tab-id]')
        const rect = tile.getBoundingClientRect()
        tile.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 8, clientY: rect.top + 8 }))
        return true
      })()`)

    // La page épinglée doit être ouverte pour que la veille ait un objet.
    await evaluate(`document.querySelector('.mini-tile[data-tab-id]')?.click()`)
    await sleep(1000)
    await openMouse()
    await sleep(350)
    check('menu ouvert à la souris', (await evaluate(`Boolean(document.querySelector('[role="menu"]'))`)) === true)
    const beside = await evaluate(`(() => {
      const tile = document.querySelector('.mini-tile[data-tab-id]').getBoundingClientRect()
      const menu = document.querySelector('[role="menu"]')?.getBoundingClientRect()
      return menu ? menu.left >= tile.right : null
    })()`)
    check('menu à droite de la tuile', beside === true)

    const firstId = before[0]
    await evaluate(`document.querySelector('[data-item="move-right"]')?.click()`)
    await sleep(800)
    const movedIds = (await pinned()).map((tab) => tab.id)
    check('déplacement à droite', movedIds[0] === before[1] && movedIds[1] === firstId, movedIds.join(','))
    const announce = await evaluate(`document.querySelector('.sidebar [role="status"]')?.textContent ?? ''`)
    check('déplacement annoncé', /Épinglé déplacé en position 2 sur 4/.test(String(announce)), String(announce))
    check(
      'focus conservé sur la tuile déplacée',
      (await evaluate(`document.activeElement?.getAttribute('data-tab-id')`)) === firstId
    )

    // 4. Son : le groupe suit l'état réel de la vue (une page endormie n'a pas de son).
    const targetId = (await pinned())[0]?.id
    await evaluate(`document.querySelector('.mini-tile[data-tab-id="${targetId}"]')?.click()`)
    await sleep(1000)
    await evaluate(`window.vela.tabs.mute(${JSON.stringify(targetId)}, true)`)
    await sleep(400)
    const soundState = (await pinned()).find((tab) => tab.id === targetId)
    await openMouse()
    await sleep(350)
    const muteItem = await evaluate(`Boolean(document.querySelector('[data-item="mute"]'))`)
    check(
      'groupe Son cohérent avec l’état',
      muteItem === Boolean(soundState?.muted || soundState?.audible),
      `menu=${muteItem} état=${JSON.stringify({ muted: soundState?.muted, audible: soundState?.audible })}`
    )
    if (muteItem) {
      await evaluate(`document.querySelector('[data-item="mute"]')?.click()`)
      await sleep(600)
      check('son basculé', (await pinned()).find((tab) => tab.id === targetId)?.muted === false)
    }

    // 5. Mise en veille puis rechargement au clic.
    const awake = (await pinned()).find((tab) => tab.asleep === false)
    if (awake) await evaluate(`document.querySelector('.mini-tile[data-tab-id="${awake.id}"]')?.click()`)
    await sleep(900)
    await openMouse()
    await sleep(350)
    const sleepItem = await evaluate(`Boolean(document.querySelector('[data-item="sleep"]'))`)
    check('veille proposée sur une page chargée', sleepItem === true, `onglet ${targetId}`)
    await evaluate(`document.querySelector('[data-item="sleep"]')?.click()`)
    await sleep(800)
    const asleep = (await pinned()).find((tab) => tab.id === targetId)?.asleep
    check('page mise en veille', asleep === true, String(asleep))
    await evaluate(`document.querySelector('.mini-tile[data-tab-id="${targetId}"]')?.click()`)
    await sleep(1400)
    const awakeState = (await pinned()).find((tab) => tab.id === targetId)?.asleep
    check('page rechargée au clic', awakeState === false, String(awakeState))

    // 6. Fermeture annulable.
    await evaluate(`(() => {
      const tile = document.querySelector('.mini-tile[data-tab-id="${targetId}"]')
      const rect = tile.getBoundingClientRect()
      tile.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 8, clientY: rect.top + 8 }))
      return true
    })()`)
    await sleep(350)
    const closedUrl = (await pinned()).find((tab) => tab.id === targetId)?.url
    await evaluate(`document.querySelector('[data-item="close"]')?.click()`)
    await sleep(800)
    check('onglet fermé', !(await pinned()).some((tab) => tab.id === targetId))
    const toast = await evaluate(`(() => {
      const node = Array.from(document.querySelectorAll('.toast')).find((entry) => entry.textContent.includes('Onglet fermé'))
      return { text: node?.textContent ?? '', action: Boolean(node?.querySelector('.toast-action')) }
    })()`)
    check('toast de fermeture avec annulation', toast?.action === true, JSON.stringify(toast))
    await evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('.toast')).find((entry) => entry.textContent.includes('Onglet fermé'))?.querySelector('.toast-action')
      button?.click()
      return true
    })()`)
    await sleep(1800)
    // `reopen` recrée l'onglet sous un nouvel identifiant : on le retrouve par
    // son adresse, épinglé comme avant la fermeture.
    const restored = (await pinned()).find((tab) => tab.url === closedUrl)
    check('fermeture annulée', Boolean(restored), `url ${closedUrl}`)

    // 7. Désépingler ne ferme pas : l'onglet rejoint la liste normale.
    const restoredId = restored?.id
    await evaluate(`(() => {
      const tile = document.querySelector('.mini-tile[data-tab-id="${restoredId}"]')
      if (!tile) return false
      const rect = tile.getBoundingClientRect()
      tile.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 8, clientY: rect.top + 8 }))
      return true
    })()`)
    await sleep(350)
    await evaluate(`document.querySelector('[data-item="unpin"]')?.click()`)
    await sleep(900)
    const view = await evaluate(`window.vela.view()`)
    const unpinned = view?.tabs.find((tab) => tab.id === restoredId)
    check('désépingler conserve l’onglet', Boolean(unpinned) && unpinned.pinned === false, JSON.stringify({ exists: Boolean(unpinned), pinned: unpinned?.pinned }))

    const errors = await evaluate(`window.__velaErrors ?? []`)
    check('aucune exception', Array.isArray(errors) && errors.length === 0, JSON.stringify(errors))

    console.log(JSON.stringify({ checks, notes, failures }, null, 2))
    ws.close()
    if (failures.length) process.exitCode = 1
  } catch (error) {
    failures.push(`harnais interrompu : ${error.message}`)
    console.log(JSON.stringify({ checks, notes, failures }, null, 2))
    process.exitCode = 1
  } finally {
    await sleep(200)
    child.kill('SIGTERM')
  }
})()
