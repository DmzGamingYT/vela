/* Évaluation du traducteur de BD.
   Lit la clé dans TRANSLATOR_API_KEY ; sans elle, le script s'arrête avec un
   message clair — il n'utilise jamais de traduction factice.
   Usage : TRANSLATOR_API_KEY=… node scripts/comic-eval.mjs */
import { readFileSync } from 'node:fs'

const KEY = (process.env.TRANSLATOR_API_KEY || '').trim()
const URL_API = process.env.TRANSLATOR_URL || 'https://api.openai.com/v1/chat/completions'
const MODEL = process.env.TRANSLATOR_MODEL || 'gpt-4o-mini'
const MAX_RATIO = Number(process.env.MAX_RATIO || 1.3)

if (!KEY) {
  console.error('TRANSLATOR_API_KEY absente.')
  console.error('TRADUCTION NON ÉVALUÉE : ce script n’utilise pas de traducteur factice.')
  console.error('Relancez avec la clé : TRANSLATOR_API_KEY=… node scripts/comic-eval.mjs')
  process.exit(2)
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

const response = await fetch(URL_API, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
  body: JSON.stringify({
    model: MODEL,
    temperature: 0.2,
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: JSON.stringify({
          contexte: data.contexte || '',
          repliques: bulles.map((bulle) => ({ id: bulle.id, texte: bulle.source }))
        })
      }
    ]
  })
})

if (!response.ok) {
  console.error(`traducteur HTTP ${response.status}`)
  process.exit(3)
}
const body = await response.json()
const content = body.choices?.[0]?.message?.content || ''
const match = content.match(/\{[\s\S]*\}/)
if (!match) {
  console.error('réponse du modèle illisible')
  process.exit(3)
}
const list = JSON.parse(match[0]).traductions || []

const RED = '\u001b[31m'
const RESET = '\u001b[0m'
const pad = (text, size) => String(text).padEnd(size).slice(0, size)
const clip = (text, size) => String(text).padEnd(size).slice(0, size)

console.log('modèle :', MODEL)
console.log('contexte :', data.contexte || '—')
console.log('')
console.log(pad('#', 3), pad('source', 34), pad('traduction', 34), pad('référence', 34), 'ratio', 'chrf')
console.log('-'.repeat(126))

let totalRatio = 0
let totalChrf = 0
let longues = 0
let manquantes = 0
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
process.exit(manquantes ? 3 : 0)
