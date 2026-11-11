/*
 * Fournisseur de traduction et de vision pour les scripts hors application.
 *
 * Un seul endroit lit l'environnement : le banc et l'évaluation parlent donc
 * forcément au même serveur, avec le même modèle. Aucun repli factice ici.
 *
 * Variables :
 *   TRANSLATOR_BASE_URL  racine compatible OpenAI (ex. http://localhost:11434/v1)
 *   TRANSLATOR_MODEL     modèle de texte (obligatoire)
 *   TRANSLATOR_API_KEY   clé — facultative si le serveur est local
 *   VISION_MODEL         modèle de vision (facultatif, sinon TRANSLATOR_MODEL)
 *   TRANSLATOR_URL       URL complète de /chat/completions (prioritaire)
 */
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

const clean = (value) => String(value || '').trim()

function config() {
  const base = clean(process.env.TRANSLATOR_BASE_URL).replace(/\/+$/, '')
  const explicit = clean(process.env.TRANSLATOR_URL)
  const url =
    explicit || (base ? `${base}/chat/completions` : 'https://api.openai.com/v1/chat/completions')
  const model = clean(process.env.TRANSLATOR_MODEL)
  const key = clean(process.env.TRANSLATOR_API_KEY)
  const visionModel = clean(process.env.VISION_MODEL) || model
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    /* URL illisible : aucun hôte local à reconnaître, on garde la chaîne vide. */
  }
  const local = LOCAL_HOSTS.has(host)
  const configured = Boolean(model) && (Boolean(key) || local)
  let reason = ''
  if (!model) reason = 'TRANSLATOR_MODEL absente'
  else if (!key && !local) reason = 'TRANSLATOR_API_KEY absente et le serveur n’est pas local'
  return { url, base, model, visionModel, key, local, configured, reason, host }
}

function describe(cfg) {
  if (!cfg.configured) return `aucun fournisseur — ${cfg.reason}`
  const kind = cfg.local ? 'local' : 'distant'
  const vision =
    cfg.visionModel && cfg.visionModel !== cfg.model ? ` · vision ${cfg.visionModel}` : ''
  return `${kind} · ${cfg.host || cfg.url} · modèle ${cfg.model}${vision}`
}

function headers(cfg) {
  return {
    'content-type': 'application/json',
    ...(cfg.key ? { authorization: `Bearer ${cfg.key}` } : {})
  }
}

function modelsUrl(url) {
  return /\/chat\/completions$/.test(url)
    ? url.replace(/\/chat\/completions$/, '/models')
    : `${url.replace(/\/+$/, '')}/models`
}

/** Requête avec délai maximal : un serveur muet ne doit pas figer le script. */
async function request(url, init, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    return { response, ms: Date.now() - started }
  } catch (error) {
    const aborted = error && (error.name === 'AbortError' || error.code === 'ABORT_ERR')
    return {
      error: aborted
        ? `délai dépassé (${timeoutMs} ms)`
        : String((error && error.message) || error),
      ms: Date.now() - started
    }
  } finally {
    clearTimeout(timer)
  }
}

/** Le serveur répond-il ? Sert au démarrage, avant de promettre quoi que ce soit. */
async function ping(cfg, timeoutMs = 4000) {
  if (!cfg.configured) return { ok: false, error: cfg.reason, ms: 0 }
  const { response, error, ms } = await request(
    modelsUrl(cfg.url),
    { headers: headers(cfg) },
    timeoutMs
  )
  if (error) return { ok: false, error, ms }
  if (response.ok) {
    let models = []
    try {
      const body = await response.json()
      models = (body.data || body.models || [])
        .map((entry) => entry.id || entry.name)
        .filter(Boolean)
    } catch {
      /* liste illisible : le serveur répond quand même */
    }
    return { ok: true, ms, models }
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, error: `clé refusée (HTTP ${response.status})`, ms }
  }
  // Certains serveurs n'exposent pas /models : joignable ne veut pas dire cassé.
  return {
    ok: response.status < 500,
    error: response.status < 500 ? '' : `HTTP ${response.status}`,
    warning: `liste des modèles HTTP ${response.status}`,
    ms
  }
}

async function chat(cfg, messages, options = {}) {
  if (!cfg.configured) return { ok: false, error: cfg.reason, ms: 0 }
  const payload = {
    model: options.model || cfg.model,
    temperature: options.temperature ?? 0.2,
    stream: false,
    messages
  }
  const { response, error, ms } = await request(
    cfg.url,
    { method: 'POST', headers: headers(cfg), body: JSON.stringify(payload) },
    options.timeoutMs || 60_000
  )
  if (error) return { ok: false, error, ms }
  if (!response.ok)
    return { ok: false, error: `HTTP ${response.status}`, status: response.status, ms }
  let body
  try {
    body = await response.json()
  } catch {
    return { ok: false, error: 'réponse illisible', ms }
  }
  const content = body?.choices?.[0]?.message?.content
  const text = Array.isArray(content)
    ? content.map((part) => part.text || '').join('')
    : String(content || '')
  if (!text.trim()) return { ok: false, error: 'réponse vide', ms }
  return { ok: true, content: text, ms }
}

/** Lit un éclat : une image, un modèle de vision, une réponse JSON courte. */
async function vision(cfg, dataUrl, timeoutMs = 60_000) {
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(String(dataUrl || ''))) {
    return { ok: false, error: 'image illisible', ms: 0 }
  }
  const result = await chat(
    cfg,
    [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Lis le texte de cette case de bande dessinée. Réponds uniquement par {"texte":"…"}.'
          },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ],
    { model: cfg.visionModel || cfg.model, temperature: 0, timeoutMs }
  )
  if (!result.ok) return result
  const match = result.content.match(/\{[\s\S]*\}/)
  if (!match) return { ok: false, error: 'réponse de vision illisible', ms: result.ms }
  let texte
  try {
    texte = String(JSON.parse(match[0]).texte || '').trim()
  } catch {
    return { ok: false, error: 'JSON de vision invalide', ms: result.ms }
  }
  if (!texte) return { ok: false, error: 'aucun texte lu', ms: result.ms }
  return { ok: true, texte, ms: result.ms }
}

module.exports = { config, describe, ping, chat, vision }
