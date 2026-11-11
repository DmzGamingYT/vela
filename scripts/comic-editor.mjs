/* Éditeur local des bulles de BD.
   Liste les bulles lues par le banc (ou une planche analysée), affiche original
   et traduction, permet de corriger le texte, de décaler la zone, de changer le
   corps et de retraduire une seule bulle. Les corrections sont écrites dans un
   fichier JSON par image, sans jamais écraser une correction précédente.

   Usage : node scripts/comic-editor.mjs [--bubbles <json>] [--edits <json>] [--port 7788]
   Sans TRANSLATOR_API_KEY, la retraduction répond 503 « traduction non évaluée ».
*/
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const args = process.argv.slice(2)
const argOf = (name, fallback) => {
  const index = args.indexOf(name)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const BUBBLES = resolve(argOf('--bubbles', 'screenshots/comic-check/bubbles.json'))
const EDITS = resolve(argOf('--edits', 'screenshots/comic-check/edits-export.json'))
const PORT = Number(argOf('--port', process.env.EDITOR_PORT || 7788))
const KEY = (process.env.TRANSLATOR_API_KEY || '').trim()
const URL_API = process.env.TRANSLATOR_URL || 'https://api.openai.com/v1/chat/completions'
const MODEL = process.env.TRANSLATOR_MODEL || 'gpt-4o-mini'

const readJson = (file, fallback) => {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback
  } catch {
    return fallback
  }
}

const bubbles = readJson(BUBBLES, { planche: 'planche', zones: [] })
let edits = readJson(EDITS, { version: 1, planches: {} })
edits.planches = edits.planches || {}
const imageKey = Object.keys(edits.planches)[0] || 'planche'
edits.planches[imageKey] = edits.planches[imageKey] || {}

/** Un fichier par image, comme le pont de Vela, plus le fichier agrégé. */
function persist() {
  writeFileSync(EDITS, JSON.stringify(edits, null, 2))
  const dir = join(dirname(EDITS), 'edits')
  mkdirSync(dir, { recursive: true })
  for (const [key, value] of Object.entries(edits.planches)) {
    writeFileSync(join(dir, `${key}.json`), JSON.stringify(value, null, 2))
  }
}

function state() {
  const overrides = edits.planches[imageKey] || {}
  return {
    planche: bubbles.planche || 'planche',
    cle: imageKey,
    fichier: join(dirname(EDITS), 'edits', `${imageKey}.json`),
    zones: (bubbles.zones || []).map((zone) => ({
      ...zone,
      correction: overrides[zone.id] || null,
      texteFinal: (overrides[zone.id] && overrides[zone.id].texte) || zone.traduit || ''
    }))
  }
}

async function translateOne(texte) {
  if (!KEY) {
    return {
      status: 503,
      body: { ok: false, error: 'traduction non évaluée : TRANSLATOR_API_KEY absente' }
    }
  }
  const response = await fetch(URL_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'Tu es traducteur de bande dessinée vers le français. Traduis la réplique seule, registre parlé, ' +
            'phrase courte qui tient dans une bulle. Réponds uniquement par {"texte":"…"}.'
        },
        { role: 'user', content: JSON.stringify({ texte }) }
      ]
    })
  })
  if (!response.ok)
    return { status: 502, body: { ok: false, error: `traducteur HTTP ${response.status}` } }
  const body = await response.json()
  const content = body.choices?.[0]?.message?.content || ''
  const match = content.match(/\{[\s\S]*\}/)
  if (!match) return { status: 502, body: { ok: false, error: 'réponse illisible' } }
  const texte2 = String(JSON.parse(match[0]).texte || '').trim()
  return texte2
    ? { status: 200, body: { ok: true, texte: texte2 } }
    : { status: 502, body: { ok: false, error: 'réponse vide' } }
}

const PAGE = `<!doctype html><meta charset="utf-8"><title>Corrections BD</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 20px; font: 13px/1.45 -apple-system, system-ui, sans-serif; background: #f7f6f3; color: #1b1a17; }
  h1 { font-size: 15px; margin: 0 0 4px; }
  .meta { color: #6b675f; font-size: 11px; margin-bottom: 16px; }
  .zone { background: #fff; border: 1px solid #e2ded4; border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; }
  .head { display: flex; gap: 10px; align-items: baseline; font-size: 11px; color: #6b675f; }
  .id { font-family: ui-monospace, monospace; }
  .orig { margin: 6px 0 8px; font-weight: 600; }
  textarea { width: 100%; box-sizing: border-box; min-height: 48px; padding: 7px 9px; border-radius: 8px; border: 1px solid #d8d3c8; font: inherit; }
  .row { display: flex; gap: 10px; align-items: center; margin-top: 8px; flex-wrap: wrap; }
  label { font-size: 11px; color: #6b675f; display: flex; gap: 4px; align-items: center; }
  input[type=number] { width: 62px; padding: 4px 6px; border-radius: 6px; border: 1px solid #d8d3c8; font: inherit; }
  button { padding: 5px 11px; border-radius: 8px; border: 1px solid #cfc9bd; background: #fff; font: inherit; cursor: pointer; }
  button.primary { background: #5b5bd6; border-color: #5b5bd6; color: #fff; }
  .etat { font-size: 11px; color: #3f7d4f; }
  .erreur { color: #a33232; }
</style>
<h1>Corrections — <span id="planche"></span></h1>
<p class="meta">Clé <span class="id" id="cle"></span> · fichier <span class="id" id="fichier"></span></p>
<div id="liste"></div>
<script>
let etat = { zones: [] }
const api = (chemin, corps) =>
  fetch(chemin, corps ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) } : {})
    .then(async (reponse) => ({ status: reponse.status, ...(await reponse.json()) }))

async function charger() {
  etat = await api('/api/state')
  document.getElementById('planche').textContent = etat.planche
  document.getElementById('cle').textContent = etat.cle
  document.getElementById('fichier').textContent = etat.fichier
  const liste = document.getElementById('liste')
  liste.textContent = ''
  for (const zone of etat.zones) {
    const bloc = document.createElement('div')
    bloc.className = 'zone'
    bloc.innerHTML = \`
      <div class="head"><span class="id">\${zone.id}</span><span>\${zone.type}</span><span>\${zone.taille || 0} px</span></div>
      <p class="orig">\${zone.texte || '—'}</p>
      <textarea spellcheck="false"></textarea>
      <div class="row">
        <label>décalage x <input type="number" class="dx" step="1" value="0"></label>
        <label>y <input type="number" class="dy" step="1" value="0"></label>
        <label>corps × <input type="number" class="ech" step="0.05" min="0.5" max="2.5" value="1"></label>
        <button class="primary enregistrer">Enregistrer</button>
        <button class="retraduire">Retraduire cette bulle</button>
        <span class="etat"></span>
      </div>\`
    const champ = bloc.querySelector('textarea')
    const correction = zone.correction || {}
    champ.value = correction.texte || zone.texteFinal || ''
    bloc.querySelector('.dx').value = String(correction.dx || 0)
    bloc.querySelector('.dy').value = String(correction.dy || 0)
    bloc.querySelector('.ech').value = String(correction.echelle || 1)
    const etatBloc = bloc.querySelector('.etat')
    const flash = (texte, erreur) => {
      etatBloc.textContent = texte
      etatBloc.className = erreur ? 'etat erreur' : 'etat'
    }
    bloc.querySelector('.enregistrer').addEventListener('click', async () => {
      const reponse = await api('/api/edit', {
        id: zone.id,
        texte: champ.value,
        dx: Number(bloc.querySelector('.dx').value) || 0,
        dy: Number(bloc.querySelector('.dy').value) || 0,
        echelle: Number(bloc.querySelector('.ech').value) || 1
      })
      flash(reponse.ok ? 'enregistré' : reponse.error || 'échec', !reponse.ok)
    })
    bloc.querySelector('.retraduire').addEventListener('click', async () => {
      const reponse = await api('/api/retranslate', { id: zone.id, texte: zone.texte || '' })
      if (reponse.status === 200 && reponse.texte) {
        champ.value = reponse.texte
        flash('retraduit — à enregistrer')
      } else {
        flash(reponse.error || 'retraduction impossible', true)
      }
    })
    liste.appendChild(bloc)
  }
}

charger()
</script>`

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1')
  const send = (status, body, type = 'application/json') => {
    response.writeHead(status, {
      'content-type': `${type}; charset=utf-8`,
      'cache-control': 'no-store'
    })
    response.end(typeof body === 'string' ? body : JSON.stringify(body))
  }
  if (request.method === 'GET' && url.pathname === '/') return send(200, PAGE, 'text/html')
  if (request.method === 'GET' && url.pathname === '/api/state') return send(200, state())
  if (request.method === 'POST' && url.pathname === '/api/edit') {
    let raw = ''
    request.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 100_000) request.destroy()
    })
    request.on('end', () => {
      let body
      try {
        body = JSON.parse(raw || '{}') ?? {}
      } catch {
        return send(400, { ok: false, error: 'corps illisible' })
      }
      const id = String(body.id || '')
      if (!id) return send(400, { ok: false, error: 'identifiant manquant' })
      const table = edits.planches[imageKey]
      // Fusion : une relance ne remplace que les champs fournis.
      table[id] = {
        ...(table[id] || {}),
        ...(typeof body.texte === 'string' ? { texte: body.texte } : {}),
        ...(Number.isFinite(Number(body.dx)) ? { dx: Number(body.dx) } : {}),
        ...(Number.isFinite(Number(body.dy)) ? { dy: Number(body.dy) } : {}),
        ...(Number.isFinite(Number(body.echelle)) ? { echelle: Number(body.echelle) } : {}),
        manuel: true
      }
      persist()
      return send(200, { ok: true, correction: table[id] })
    })
    return undefined
  }
  if (request.method === 'POST' && url.pathname === '/api/retranslate') {
    let raw = ''
    request.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 20_000) request.destroy()
    })
    request.on('end', async () => {
      let body
      try {
        body = JSON.parse(raw || '{}') ?? {}
      } catch {
        return send(400, { ok: false, error: 'corps illisible' })
      }
      try {
        const result = await translateOne(String(body.texte || ''))
        return send(result.status, result.body)
      } catch (error) {
        return send(502, { ok: false, error: error.message })
      }
    })
    return undefined
  }
  return send(404, { ok: false, error: 'inconnu' })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`éditeur : http://127.0.0.1:${PORT}`)
  console.log('bulles :', BUBBLES)
  console.log('corrections :', EDITS, '· image', imageKey)
  if (!KEY)
    console.log(
      'TRANSLATOR_API_KEY absente : la retraduction répondra 503 « traduction non évaluée ».'
    )
})
