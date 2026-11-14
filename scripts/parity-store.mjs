/**
 * Parité entre `JSON.parse` / `JSON.stringify` et la crate `native/vela-store`.
 *
 * Usage : node scripts/parity-store.mjs [chemin/vers/vela-store.node]
 *
 * Deux comparaisons par cas :
 *   parse      — `JSON.parse(texte)` et `native.parse(texte)` doivent donner le
 *                même objet (et le même ordre de clés) ;
 *   stringify  — `JSON.stringify(objet)` et `native.stringify(objet)` doivent
 *                produire les mêmes octets (le magasin compare les charges
 *                écrites pour éviter de réécrire un fichier identique).
 *
 * Les écarts connus et acceptés sont listés dans `KNOWN` : tout autre écart
 * fait sortir le script en erreur, pour que la crate ne dérive pas en silence.
 */
import { createRequire } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

const require = createRequire(import.meta.url)
const target = resolve(process.argv[2] ?? 'native/vela-store/vela-store.node')
const native = require(target)

const REAL = join(homedir(), 'Library/Application Support/Vela/vela.json')

/** Écarts connus, documentés dans native/vela-store/README.md. */
const KNOWN = new Set([
  'grands-entiers', // au-delà de 2^53 : Rust garde l'entier exact, JS arrondit
  'cles-numeriques', // ordre des clés « 1 », « 2 » : JS trie, Rust garde le fichier
  'surrogates-isoles', // « \ud800 » : JS accepte, serde refuse
  'undefined', // JSON.stringify saute la clé, la conversion Rust la rejette
  'toJSON', // JSON.stringify appelle toJSON, la conversion Rust lit la donnée brute
  'espaces-non-finis' // NaN / Infinity que JSON.stringify rend « null »
])

const cases = [
  { name: 'objet-plat', value: { a: 1, b: 'deux', c: true, d: null } },
  { name: 'tableaux-imbriques', value: { list: [1, [2, [3, [4]]]], vide: [], obj: {} } },
  { name: 'unicode', value: { url: 'https://fr.wikipedia.org/wiki/Voile_(navire)', titre: 'Voile — éàçù 😀' } },
  { name: 'echappements', text: String.raw`{"s":"a\"b\\c\td\ne","u":"\u2028\u2029"}` },
  { name: 'nombres-entiers', value: { a: 0, b: -1, c: 1763000000000, d: Number.MAX_SAFE_INTEGER } },
  { name: 'nombres-flottants', value: { ratio: 0.5, tier: 1 / 3, exp: 1e-7, grand: 1e21 } },
  { name: 'zero-negatif', text: '{"z":-0}' },
  { name: 'grands-entiers', text: '{"n":12345678901234567890}' },
  { name: 'cles-numeriques', text: '{"2":"b","1":"a","x":"c"}' },
  { name: 'surrogates-isoles', text: String.raw`{"s":"\ud800"}` },
  { name: 'undefined', value: { garde: 1, omis: undefined, tab: [1, undefined, 3] } },
  { name: 'toJSON', value: { date: new Date(1763000000000) } },
  { name: 'espaces-non-finis', value: { nan: NaN, inf: Infinity } },
  { name: 'booleens-et-null', value: { v: true, f: false, n: null, s: 'null' } },
  { name: 'profond', value: (() => { let v = { fin: true }; for (let i = 0; i < 50; i += 1) v = { n: i, sous: v }; return v })() }
]

function attempt(fn) {
  try {
    return { ok: true, value: fn() }
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

function sameValue(a, b) {
  // JSON.stringify compare aussi l'ordre des clés, ce que deepStrictEqual ignore.
  if (!isDeepStrictEqual(a, b)) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

const rows = []
for (const testCase of cases) {
  const source = testCase.text ?? JSON.stringify(testCase.value)
  const jsParse = attempt(() => JSON.parse(source))
  const rsParse = attempt(() => native.parse(source))
  const parseOk =
    jsParse.ok && rsParse.ok
      ? sameValue(jsParse.value, rsParse.value)
      : jsParse.ok === rsParse.ok
        ? true
        : false

  const input = testCase.text ? jsParse.value : testCase.value
  const jsStringify = attempt(() => JSON.stringify(input))
  const rsStringify = attempt(() => native.stringify(input))
  const stringifyOk =
    jsStringify.ok && rsStringify.ok
      ? jsStringify.value === rsStringify.value
      : jsStringify.ok === rsStringify.ok
        ? true
        : false

  rows.push({
    name: testCase.name,
    parseOk,
    stringifyOk,
    known: KNOWN.has(testCase.name),
    detail:
      (!parseOk && rsParse.ok ? `parse → ${JSON.stringify(rsParse.value).slice(0, 60)}` : '') ||
      (!stringifyOk && rsStringify.ok ? `stringify → ${rsStringify.value.slice(0, 60)}` : '') ||
      (!rsParse.ok ? `Rust refuse : ${rsParse.error.slice(0, 60)}` : '')
  })
}

// Le vrai fichier : le cas qui compte le plus.
if (existsSync(REAL)) {
  const text = readFileSync(REAL, 'utf8')
  const jsParse = attempt(() => JSON.parse(text))
  const rsParse = attempt(() => native.parse(text))
  const parseOk = jsParse.ok && rsParse.ok && sameValue(jsParse.value, rsParse.value)
  const jsStringify = attempt(() => JSON.stringify(jsParse.value))
  const rsStringify = attempt(() => native.stringify(jsParse.value))
  rows.push({
    name: 'vela.json réel',
    parseOk,
    stringifyOk: jsStringify.ok && rsStringify.ok && jsStringify.value === rsStringify.value,
    known: false,
    detail: ''
  })
}

console.log(`\nParité — ${target}\n`)
for (const row of rows) {
  const label = row.parseOk && row.stringifyOk ? 'identique' : row.known ? 'écart connu' : 'ÉCART'
  const marks = `parse ${row.parseOk ? '=' : '≠'} · stringify ${row.stringifyOk ? '=' : '≠'}`
  console.log(`${label.padEnd(12)} ${row.name.padEnd(22)} ${marks}${row.detail ? `  (${row.detail})` : ''}`)
}

const unexpected = rows.filter((row) => !(row.parseOk && row.stringifyOk) && !row.known)
console.log(
  unexpected.length === 0
    ? '\nTous les cas concordent, hors écarts documentés.\n'
    : `\n${unexpected.length} écart(s) non documenté(s).\n`
)
process.exit(unexpected.length === 0 ? 0 : 1)
