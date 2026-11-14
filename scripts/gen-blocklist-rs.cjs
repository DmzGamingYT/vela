'use strict'
/**
 * Régénère `native/vela-blocklist/src/hosts.rs` depuis `src/main/blocklist.ts`.
 * La source de vérité reste le TS : on extrait les deux listes littérales pour
 * que la crate Rust ne puisse pas dériver du navigateur.
 */
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const src = fs.readFileSync(path.join(root, 'src/main/blocklist.ts'), 'utf8')

function extract(name) {
  const start = src.indexOf(name)
  if (start < 0) throw new Error(`liste introuvable : ${name}`)
  // Fin du littéral : la ligne qui ne contient que « ] ».
  const end = src.indexOf('\n]', start)
  if (end < 0) throw new Error(`fin introuvable : ${name}`)
  const body = src
    .slice(start, end)
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n')
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1])
}

const trackers = extract('TRACKER_HOSTS')
const auth = extract('AUTH_PAGE_HOSTS')

function rustList(name, items) {
  return `pub const ${name}: &[&str] = &[\n${items.map((i) => `    "${i}",`).join('\n')}\n];\n`
}

const out =
  '// Généré depuis src/main/blocklist.ts — ne pas éditer à la main.\n' +
  '// Régénérer : node scripts/gen-blocklist-rs.cjs\n\n' +
  rustList('TRACKER_HOSTS', trackers) +
  '\n' +
  rustList('AUTH_PAGE_HOSTS', auth)

fs.writeFileSync(path.join(root, 'native/vela-blocklist/src/hosts.rs'), out)
console.log(`hosts.rs : ${trackers.length} traqueurs, ${auth.length} pages d’auth`)
