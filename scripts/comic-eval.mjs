/* Évaluation du traducteur de BD.
   Fournisseur : TRANSLATOR_BASE_URL / TRANSLATOR_MODEL / TRANSLATOR_API_KEY
   (voir scripts/translator.cjs). Sans fournisseur joignable, le script sort en
   code 2 : il n'utilise jamais de traduction factice.
   Usage : TRANSLATOR_BASE_URL=http://localhost:11434/v1 TRANSLATOR_MODEL=qwen2.5:7b node scripts/comic-eval.mjs */
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { config, describe, ping, chat } = require('./translator.cjs')

const MAX_RATIO = Number(process.env.MAX_RATIO || 1.3)
const cfg = config()

if (!cfg.configured) {
  console.error(`TRADUCTION NON ÉVALUÉE — ${cfg.reason}.`)
  console.error('Rien n’est mesuré : aucune traduction factice n’est utilisée ici.')
  console.error(
    'Exemple local : TRANSLATOR_BASE_URL=http://localhost:11434/v1 TRANSLATOR_MODEL=qwen2.5:7b node scripts/comic-eval.mjs'
  )
  process.exit(2)
}

console.log(`fournisseur : ${describe(cfg)}`)
const reachable = await ping(cfg)
if (!reachable.ok) {
  console.error(`FOURNISSEUR INJOIGNABLE — ${reachable.error} (${cfg.url}).`)
  console.error('TRADUCTION NON ÉVALUÉE : aucune valeur de repli ne sera produite.')
  process.exit(2)
}
console.log(`connexion : OK en ${reachable.ms} ms${reachable.warning ? ` (${reachable.warning})` : ''}`)
if (Array.isArray(reachable.models) && reachable.models.length && !reachable.models.includes(cfg.model)) {
  console.log(`attention : « ${cfg.model} » n’apparaît pas dans la liste du serveur (${reachable.models.slice(0, 5).join(', ')})`)
}

const data = JSON.parse(readFileSync(new URL('../userscripts/comic-eval.json', import.meta.url), 'utf8'))
const bulles = data.bulles || []

const SYSTEM =
  'Tu es traducteur de bande dessinée vers le français. On te donne un JSON ' +
  '{"contexte":"…","repliques":[{"id":0,"texte":"…"}]} : « contexte » décrit l’œuvre ' +
  '(genre, personnages, registre) et vaut pour toute la planche. Traduis chaque réplique en ' +
  'gardant son id, en cohérence avec les répliques voisines du même envoi : mêmes personnes, ' +
  'mêmes tutoiements, mêmes noms. Registre parlé et naturel, phrases courtes qui tiennent dans ' +
  'une bulle, ponctuation de BD, noms propres inchangés, onomatopées rendues par un équivalent ' +
  'français. Corrige les erreurs d’OCR évidentes sans inventer de contenu. Réponds uniquement ' +
  'par {"traductions":[{"id":0,"texte":"…"}]}.'

/** Comptage de n-grammes de caractères, la base de chrF. */
function grams(text, size) {
  const clean = text.toLowerCase().replace(/\s+/g, ' ').trim()
  const counts = new Map()
  for (let index = 0; index + size <= clean.length; index += 1) {
    const gram = clean.slice(index, index + size)
    counts.set(gram, (counts.get(gram) || 0) + 1)
  }
  return counts
}

function fScore(hypothesis, reference, size) {
  const hyp = grams(hypothesis, size)
  const ref = grams(reference, size)
  let matches = 0
  let hypTotal = 0
  let refTotal = 0
  for (const [gram, count] of hyp) {
    hypTotal += count
    if (ref.has(gram)) matches += Math.min(count, ref.get(gram))
  }
  for (const count of ref.values()) refTotal += count
  if (!hypTotal || !refTotal || !matches) return 0
  const precision = matches / hypTotal
  const recall = matches / refTotal
  return (2 * precision * recall) / (precision + recall)
}

/** chrF approché : moyenne des F-scores de caractères pour n = 1…6. */
function chrf(hypothesis, reference) {
  let total = 0
  for (let size = 1; size <= 6; size += 1) total += fScore(hypothesis, reference, size)
  return total / 6
}

const startedAt = new Date()
const result = await chat(
  cfg,
  [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: JSON.stringify({
        contexte: data.contexte || '',
        repliques: bulles.map((bulle) => ({ id: bulle.id, texte: bulle.source }))
      })
    }
  ],
  { temperature: 0.2, timeoutMs: 120_000 }
)

if (!result.ok) {
  // Distinguer « rien au bout du fil » de « réponse mal formée ».
  const unreachable = /délai dépassé|fetch|ECONN|HTTP 5\d\d/.test(result.error)
  console.error(`${unreachable ? 'FOURNISSEUR INJOIGNABLE' : 'RÉPONSE INEXPLOITABLE'} — ${result.error}.`)
  console.error('TRADUCTION NON ÉVALUÉE : aucune valeur de repli ne sera produite.')
  process.exit(unreachable ? 2 : 3)
}

const match = result.content.match(/\{[\s\S]*\}/)
if (!match) {
  console.error('réponse du modèle illisible — TRADUCTION NON ÉVALUÉE')
  process.exit(3)
}
const list = JSON.parse(match[0]).traductions || []

const RED = '\u001b[31m'
const RESET = '\u001b[0m'
const pad = (text, size) => String(text).padEnd(size).slice(0, size)
const clip = (text, size) => String(text).padEnd(size).slice(0, size)

console.log('modèle :', cfg.model, `(${cfg.url})`)
console.log('date :', startedAt.toISOString())
console.log('latence :', `${result.ms} ms`)
console.log('contexte :', data.contexte || '—')
console.log('')
console.log(pad('#', 3), pad('source', 34), pad('traduction', 34), pad('référence', 34), pad('ratio', 6), 'chrf')
console.log('-'.repeat(132))

let totalRatio = 0
let totalChrf = 0
let longues = 0
let manquantes = 0
const lignes = []
for (const bulle of bulles) {
  const found = list.find((item) => Number(item.id) === bulle.id)
  const texte = found?.texte ?? ''
  if (!texte) manquantes += 1
  const ratio = bulle.source.length ? texte.length / bulle.source.length : 0
  const score = texte ? chrf(texte, bulle.reference) : 0
  const tooLong = ratio > MAX_RATIO
  if (tooLong) longues += 1
  totalRatio += ratio
  totalChrf += score
  const verdict = `${ratio.toFixed(2)}${tooLong ? ' ⚠' : ''}`
  const line = [
    pad(bulle.id, 3),
    pad(bulle.source, 34),
    pad(texte || '—', 34),
    pad(clip(bulle.reference, 34), 34),
    pad(verdict, 6),
    score.toFixed(3)
  ].join(' ')
  lignes.push({
    id: bulle.id,
    source: bulle.source,
    traduction: texte,
    reference: bulle.reference,
    ratio: Number(ratio.toFixed(3)),
    chrf: Number(score.toFixed(3)),
    trop_longue: tooLong
  })
  console.log(tooLong ? `${RED}${line}${RESET}` : line)
}

const moyenne = bulles.length ? totalRatio / bulles.length : 0
const chrfMoyen = bulles.length ? totalChrf / bulles.length : 0
console.log('')
console.log(`longueur moyenne traduit/original : ${moyenne.toFixed(2)} (seuil ${MAX_RATIO}, ${longues}/${bulles.length} au-dessus)`)
console.log(`chrF moyen (n = 1…6, approximation) : ${chrfMoyen.toFixed(3)}`)
if (manquantes) console.log(`traductions manquantes : ${manquantes}`)
console.log('')
console.log('Rappel : un chrF moyen ne prouve pas la fidélité d’une réplique. Relire chaque ligne.')

// Trace datée du rapport : le chiffre doit rester vérifiable après coup.
try {
  mkdirSync(new URL('../screenshots', import.meta.url), { recursive: true })
  writeFileSync(
    new URL('../screenshots/comic-eval.json', import.meta.url),
    JSON.stringify(
      {
        modele: cfg.model,
        url: cfg.url,
        vision: cfg.visionModel,
        date: startedAt.toISOString(),
        latence_ms: result.ms,
        ratio_moyen: Number(moyenne.toFixed(3)),
        chrf_moyen: Number(chrfMoyen.toFixed(3)),
        lignes
      },
      null,
      2
    )
  )
  console.log('rapport écrit : screenshots/comic-eval.json')
} catch {
  /* disque en lecture seule : le rapport affiché suffit */
}

process.exit(manquantes ? 3 : 0)
