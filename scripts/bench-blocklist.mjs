/**
 * Benchmark du filtre de traqueurs : TypeScript vs crate Rust NAPI.
 *
 * Usage :
 *   # TypeScript (compilé par esbuild)
 *   ./node_modules/.bin/esbuild src/main/blocklist.ts --bundle --format=esm \
 *     --platform=node --outfile=/tmp/blocklist-ts.mjs
 *   node scripts/bench-blocklist.mjs /tmp/blocklist-ts.mjs
 *
 *   # Rust (binaire construit par `npm run native:build`)
 *   node scripts/bench-blocklist.mjs native/vela-blocklist/vela-blocklist.node
 *
 * Protocole identique pour les deux : même corpus, warmup, 7 répétitions,
 * médiane. 200 000 appels par fonction — le chemin chaud du filtre
 * (`onBeforeRequest`, appelé pour chaque ressource de chaque page).
 */
import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'

const require = createRequire(import.meta.url)
const target = process.argv[2]
if (!target) {
  console.error('usage: node scripts/bench-blocklist.mjs <module>')
  process.exit(2)
}
const mod = target.endsWith('.node')
  ? (() => {
      const m = require(target)
      return { isTracker: m.isTracker, isAuthPage: m.isAuthPage, shouldBlock: m.shouldBlock }
    })()
  : await import(target)

const URLS = [
  'https://www.google-analytics.com/g/collect?v=2',
  'https://stats.g.doubleclick.net/collect?v=1',
  'https://example.org/article',
  'https://static.adsafeprotected.com/jsv',
  'https://cdn.richaudience.com/script.js',
  'https://github.com/vela',
  'https://user:secret@doubleclick.net/x',
  'https://example.org/?u=doubleclick.net',
  'https://accounts.google.com/ServiceLogin',
  'https://cdn.example.fr/app.js',
  'https://delivery.mgid.com/feed',
  'https://notdoubleclick.net/'
]
const PAGE = 'https://example.fr/'
const TYPES = ['script', 'image', 'xhr', 'stylesheet', 'font', 'subFrame']
const N = 200_000

function bench(fn, label) {
  let sink = 0
  for (let i = 0; i < 2000; i++) sink += fn(i) ? 1 : 0
  const times = []
  for (let r = 0; r < 7; r++) {
    const s = performance.now()
    for (let i = 0; i < N; i++) sink += fn(i) ? 1 : 0
    times.push(performance.now() - s)
  }
  times.sort((a, b) => a - b)
  const median = times[3]
  console.log(
    `${label}: ${N} appels en ${median.toFixed(1)} ms → ${(median * 1e6 / N).toFixed(0)} ns/appel (sink=${sink})`
  )
  return median
}

const heapBefore = process.memoryUsage().heapUsed
const r1 = bench((i) => mod.isTracker(URLS[i % URLS.length]), 'isTracker')
const r2 = bench(
  (i) => mod.shouldBlock(URLS[i % URLS.length], PAGE, TYPES[i % TYPES.length], 'strict'),
  'shouldBlock(strict)'
)
const r3 = bench((i) => mod.isAuthPage(URLS[i % URLS.length]), 'isAuthPage')
const heapAfter = process.memoryUsage().heapUsed
console.log(
  `heapUsed: ${(heapBefore / 1048576).toFixed(1)} → ${(heapAfter / 1048576).toFixed(1)} Mo`
)
console.log(
  JSON.stringify({
    label: target,
    isTrackerMs: +r1.toFixed(1),
    shouldBlockMs: +r2.toFixed(1),
    isAuthPageMs: +r3.toFixed(1),
    isTrackerNs: Math.round(r1 * 1e6 / N),
    shouldBlockNs: Math.round(r2 * 1e6 / N),
    isAuthPageNs: Math.round(r3 * 1e6 / N),
    heapDeltaMo: +((heapAfter - heapBefore) / 1048576).toFixed(2)
  })
)
