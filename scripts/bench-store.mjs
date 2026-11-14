/**
 * Benchmark de la lecture/écriture de `vela.json` : TypeScript (JSON natif V8)
 * contre crate Rust NAPI (`native/vela-store`).
 *
 * Usage :
 *   node scripts/bench-store.mjs                     # crate + JSON V8
 *   node scripts/bench-store.mjs native/…/x.node     # autre binaire
 *
 * Corpus : l'état réel de l'application (`~/Library/Application Support/Vela/
 * vela.json`) gonflé jusqu'aux tailles visées en dupliquant ses propres
 * entrées — mêmes clés, mêmes types, mêmes longueurs d'URL. Rien n'est copié
 * dans le dépôt : le fichier est lu à l'exécution, et le corpus de repli est
 * synthétique si l'app n'a jamais tourné.
 *
 * Trois mesures par taille :
 *   parse      JSON.parse        ↔ native.parse      (texte → objet)
 *   stringify  JSON.stringify    ↔ native.stringify  (objet → texte)
 *   aller-retour string→string   ↔ native.roundTrip  (texte → texte, sans
 *               conversion d'objet : isole le coût de serde_json seul)
 *
 * Protocole : 3 échauffements, 15 mesures, médiane. Le GC est laissé tranquille
 * (pas de --expose-gc) : c'est le comportement réel du processus principal.
 */
import { createRequire } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'

const require = createRequire(import.meta.url)
const target = resolve(process.argv[2] ?? 'native/vela-store/vela-store.node')
const native = require(target)

const WARMUP = 3
const RUNS = 15

const REAL = join(homedir(), 'Library/Application Support/Vela/vela.json')

function synthetic() {
  const base = {
    version: 1,
    spaces: [{ id: 's1', name: 'Personnel', color: '#e8805a', partition: 'persist:space-s1' }],
    tabs: [{ id: 't1', spaceId: 's1', url: 'https://github.com/', title: 'GitHub', pinned: false }],
    groups: [],
    activeSpaceId: 's1',
    settings: { theme: 'dark', startupBehavior: 'restore', historyRetention: 'month' },
    history: [],
    closed: [],
    bookmarks: []
  }
  return base
}

/** Gonfle les listes en dupliquant les entrées existantes jusqu'à `bytes`. */
function inflate(state, bytes) {
  const copy = structuredClone(state)
  const history = Array.isArray(copy.history) && copy.history.length ? copy.history : [
    {
      id: 'h0',
      url: 'https://fr.wikipedia.org/wiki/Voile_(navire)',
      title: 'Voile (navire) — Wikipédia',
      visitedAt: 1763000000000,
      spaceId: 's1'
    }
  ]
  const seed = history.slice()
  let index = 0
  while (JSON.stringify(copy).length < bytes) {
    const entry = seed[index % seed.length]
    copy.history.push({ ...entry, id: `h-${index}`, visitedAt: 1763000000000 + index * 1000 })
    index += 1
    if (index > 40000) break
  }
  return copy
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function time(fn) {
  for (let i = 0; i < WARMUP; i += 1) fn()
  const samples = []
  for (let i = 0; i < RUNS; i += 1) {
    const start = performance.now()
    fn()
    samples.push(performance.now() - start)
  }
  return median(samples)
}

function format(ms) {
  if (ms < 1) return `${(ms * 1000).toFixed(0)} µs`
  return `${ms.toFixed(2)} ms`
}

const source = existsSync(REAL) ? JSON.parse(readFileSync(REAL, 'utf8')) : synthetic()
const cases = [
  { label: 'vela.json réel', state: source },
  { label: '400 Ko', state: inflate(source, 400 * 1024) },
  { label: '1,2 Mo', state: inflate(source, 1200 * 1024) },
  { label: '3 Mo', state: inflate(source, 3000 * 1024) }
]

console.log(`\nBinaire : ${target}`)
console.log(`Version : ${native.version?.() ?? '—'}\n`)

const rows = []
for (const { label, state } of cases) {
  const text = JSON.stringify(state)
  const kb = (Buffer.byteLength(text) / 1024).toFixed(0)

  const jsParse = time(() => JSON.parse(text))
  const rsParse = time(() => native.parse(text))
  const jsStringify = time(() => JSON.stringify(state))
  const rsStringify = time(() => native.stringify(state))
  const jsRoundTrip = time(() => JSON.stringify(JSON.parse(text)))
  const rsRoundTrip = time(() => native.roundTrip(text))
  // Parse seul, sans conversion vers un objet JS : isole serde_json.
  const rsParseOnly = time(() => native.nodeCount(text))

  rows.push({
    label,
    ko: Number(kb),
    jsParse,
    rsParse,
    jsStringify,
    rsStringify,
    jsRoundTrip,
    rsRoundTrip,
    rsParseOnly
  })
}

const ratio = (rust, js) => `${(rust / js).toFixed(2)}×`

console.log(
  'taille'.padEnd(16) +
    'parse V8'.padEnd(12) +
    'parse Rust'.padEnd(13) +
    'Rust/V8'.padEnd(10) +
    'str V8'.padEnd(11) +
    'str Rust'.padEnd(12) +
    'Rust/V8'.padEnd(10) +
    'A/R V8'.padEnd(11) +
    'A/R Rust'.padEnd(12) +
    'Rust/V8'
)
for (const row of rows) {
  console.log(
    `${row.label} (${row.ko} Ko)`.padEnd(16) +
      format(row.jsParse).padEnd(12) +
      format(row.rsParse).padEnd(13) +
      ratio(row.rsParse, row.jsParse).padEnd(10) +
      format(row.jsStringify).padEnd(11) +
      format(row.rsStringify).padEnd(12) +
      ratio(row.rsStringify, row.jsStringify).padEnd(10) +
      format(row.jsRoundTrip).padEnd(11) +
      format(row.rsRoundTrip).padEnd(12) +
      ratio(row.rsRoundTrip, row.jsRoundTrip)
  )
}
console.log('\nRapport > 1 = Rust plus lent. A/R = texte → texte, sans conversion d’objet.\n')

// Décomposition : sur la plus grosse charge, où passe le temps ?
const biggest = rows[rows.length - 1]
const state = cases[cases.length - 1].state
const text = JSON.stringify(state)
const nodes = native.nodeCount(text)
const perNode = (ms) => ((ms / nodes) * 1e6).toFixed(0)
const bridge = biggest.rsParse - biggest.rsParseOnly
console.log(`Nœuds JSON (3 Mo) : ${nodes.toLocaleString('fr-FR')}`)
console.log(`  JSON.parse V8                : ${perNode(biggest.jsParse)} ns`)
console.log(`  serde_json seul (parse)      : ${perNode(biggest.rsParseOnly)} ns`)
console.log(`  + conversion vers objet JS   : ${perNode(bridge)} ns`)
console.log(`  = parse natif complet        : ${perNode(biggest.rsParse)} ns\n`)
console.log(
  `Conversion seule (${perNode(bridge)} ns) = ${(bridge / biggest.jsParse).toFixed(1)}× le coût TOTAL de JSON.parse.`
)
