/* Évaluation du traducteur de BD.
   Lit la clé dans TRANSLATOR_API_KEY ; sans elle, le script s'arrête avec un
   message clair — il n'utilise jamais de traduction factice.
   Usage : TRANSLATOR_API_KEY=… node scripts/comic-eval.mjs */
import { readFileSync } from 'node:fs'

const KEY = (process.env.TRANSLATOR_API_KEY || '').trim()
const URL_API = process.env.TRANSLATOR_URL || 'https://api.openai.com/v1/chat/completions'
const MODEL = process.env.TRANSLATOR_MODEL || 'gpt-4o-mini'
const MAX_RATIO = Number(process.env.MAX_RATIO || 1.35)

if (!KEY) {
  console.error('TRANSLATOR_API_KEY absente.')
  console.error('Aucune évaluation possible : ce script n’utilise pas de traducteur factice.')
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

const pad = (text, size) => String(text).padEnd(size).slice(0, size)
console.log('modèle :', MODEL)
console.log('contexte :', data.contexte || '—')
console.log('')
console.log(pad('#', 3), pad('source', 44), pad('traduction', 44), 'référence')
console.log('-'.repeat(120))

let total = 0
let longues = 0
let manquantes = 0
for (const bulle of bulles) {
  const found = list.find((item) => Number(item.id) === bulle.id)
  const texte = found?.texte ?? ''
  if (!texte) manquantes += 1
  const ratio = bulle.source.length ? texte.length / bulle.source.length : 0
  if (ratio > MAX_RATIO) longues += 1
  total += ratio
  console.log(
    pad(bulle.id, 3),
    pad(bulle.source, 44),
    pad(texte || '—', 44),
    bulle.reference,
    ' ',
    `${ratio.toFixed(2)}${ratio > MAX_RATIO ? ' ⚠' : ''}`
  )
}

const moyenne = bulles.length ? total / bulles.length : 0
console.log('')
console.log(`longueur moyenne traduit/original : ${moyenne.toFixed(2)} (seuil ${MAX_RATIO})`)
console.log(`traductions plus longues que le seuil : ${longues}/${bulles.length}`)
if (manquantes) console.log(`traductions manquantes : ${manquantes}`)
console.log('')
console.log('Rappel : un ratio proche de 1 ne prouve pas la fidélité. Relire chaque ligne.')
process.exit(manquantes ? 3 : 0)
