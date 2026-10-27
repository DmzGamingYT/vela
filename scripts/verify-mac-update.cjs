/*
 * Vérifie le manifeste de mise à jour macOS produit par electron-builder.
 *
 * On interroge la vraie fonction de sélection d'electron-updater
 * (`MacUpdater.filterFilesForArch`) plutôt que d'en recopier la règle : si une
 * version future change le choix par architecture, ce script le verra.
 *
 * Usage : node scripts/verify-mac-update.cjs [chemin/latest-mac.yml]
 */
const { existsSync, readFileSync } = require('node:fs')
const { dirname, join } = require('node:path')

const manifest = process.argv[2] ?? join('release', 'mac', 'latest-mac.yml')
const base = dirname(manifest)

function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

if (!existsSync(manifest)) fail(`manifeste introuvable : ${manifest}`)

// `files:` est une liste d'objets YAML ; `url:` et `path:` suffisent ici, et
// évitent d'ajouter une dépendance YAML au projet.
const text = readFileSync(manifest, 'utf8')
const names = [...text.matchAll(/^\s*-\s*url:\s*(\S+)\s*$/gm)].map((match) => match[1])
const pathLine = text.match(/^path:\s*(\S+)\s*$/m)?.[1]
if (names.length === 0) fail('aucun fichier listé dans latest-mac.yml')

const zips = names.filter((name) => name.endsWith('.zip'))
if (!pathLine || !/\.zip$/.test(pathLine)) fail('le champ path ne pointe pas vers un .zip')

for (const name of names) {
  if (!existsSync(join(base, name))) {
    // Les blockmaps et dmg peuvent vivre à côté ; on ne tolère que l'absence
    // d'un fichier réellement publié.
    fail(`fichier annoncé mais absent du dossier de sortie : ${name}`)
  }
}

const { MacUpdater } = require('electron-updater/out/MacUpdater.js')
const toFile = (name) => ({ url: new URL(`https://example.invalid/${name}`), info: { url: name } })

const arm64Pick = MacUpdater.filterFilesForArch(zips.map(toFile), true)
const intelPick = MacUpdater.filterFilesForArch(zips.map(toFile), false)

const arm64Zip = arm64Pick.find((file) => file.url.pathname.endsWith('.zip'))
const intelZip = intelPick.find((file) => file.url.pathname.endsWith('.zip'))
if (!arm64Zip) fail('aucun .zip retenu pour Apple silicon')
if (!intelZip) fail('aucun .zip retenu pour Intel')

const nameOf = (file) => decodeURIComponent(file.url.pathname.split('/').pop())
const hasArm64 = zips.some((name) => name.includes('arm64'))
if (hasArm64 && !nameOf(arm64Zip).includes('arm64')) {
  fail(`Apple silicon devrait prendre le .zip arm64, il prend ${nameOf(arm64Zip)}`)
}
if (nameOf(intelZip).includes('arm64')) {
  fail(`Intel ne doit jamais recevoir un .zip arm64 (${nameOf(intelZip)})`)
}

const universal = zips.filter((name) => name.includes('universal'))
if (universal.length === 0) fail('aucun .zip universel dans le manifeste')

console.log(`Manifeste : ${manifest}`)
console.log(`  fichiers : ${names.join(', ')}`)
console.log(`  Apple silicon → ${nameOf(arm64Zip)}`)
console.log(`  Intel → ${nameOf(intelZip)}`)
console.log('✓ sélection de mise à jour cohérente pour les deux architectures')
