/*
 * Repérage : lance l'app et imprime la structure réelle de l'interface ainsi
 * que l'API exposée au renderer. Sert à écrire un scénario sur des sélecteurs
 * qui existent vraiment, pas sur des suppositions.
 *
 *   node site/trailer/discover.cjs [codeJsÀÉvaluer]
 */
const path = require('node:path')

const { launchApp, makeInputs, sleep } = require('./lib.cjs')

const SEED = `(async () => {
  await window.vela.settings.update({ onboarded: true, theme: 'dark', mode: 'work' })
  return true
})()`

const INVENTORY = `(() => {
  const seen = new Map()
  const interesting = /(sidebar|space|tab|rail|pinned|shortcut|note|agent|tunnel|pane|title|address|omni|palette|command|folder|split|workspace|tile|menu|badge|stage|home)/i
  for (const el of document.querySelectorAll('*')) {
    const cls = typeof el.className === 'string' ? el.className : ''
    if (!cls || !interesting.test(cls)) continue
    const key = el.tagName.toLowerCase() + '.' + cls.trim().split(/\\s+/).join('.')
    if (!seen.has(key)) {
      const r = el.getBoundingClientRect()
      seen.set(key, { n: 1, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) })
    } else {
      seen.get(key).n += 1
    }
  }
  return [...seen.entries()].map(([k, v]) => k + '  ×' + v.n + '  ' + v.w + '×' + v.h + ' @' + v.x + ',' + v.y)
})()`

const API = `(() => {
  const walk = (obj, prefix = '', depth = 0) => {
    if (!obj || depth > 1) return []
    const out = []
    for (const key of Object.keys(obj)) {
      const value = obj[key]
      const type = typeof value
      const full = prefix ? prefix + '.' + key : key
      out.push(full + ': ' + type)
      if (type === 'object' && value && depth < 1) out.push(...walk(value, full, depth + 1))
    }
    return out
  }
  return walk(window.vela).join('\\n')
})()`

;(async () => {
  const dataDir = path.join(__dirname, '.record-data')
  const app = await launchApp({ dataDir, seed: SEED })
  const inputs = makeInputs(app.client)
  try {
    await sleep(1200)
    const custom = process.argv[2]
    if (custom) {
      console.log('— évaluation personnalisée —')
      console.log(await inputs.evaluate(custom))
      return
    }
    console.log('— API window.vela —')
    console.log(await inputs.evaluate(API))
    console.log('\n— interface —')
    const inventory = await inputs.evaluate(INVENTORY)
    console.log(inventory.join('\n'))
    console.log('\n— espaces —')
    console.log(await inputs.evaluate(`JSON.stringify(window.vela.spaces?.list?.() ?? null)`))
  } finally {
    app.close()
  }
})().catch((error) => {
  console.error('ÉCHEC', error.message)
  process.exit(1)
})
