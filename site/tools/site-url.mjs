#!/usr/bin/env node
/**
 * Vela — change l’adresse publique du site en un seul geste.
 *
 * L’origine vit dans `src/shared/site.ts` (`SITE_URL`). Le site la répète dans
 * ses balises `canonical`, `og:url`, `og:image`, le JSON-LD, `sitemap.xml` et
 * `robots.txt`. Ce script remplace l’ancienne origine par la nouvelle partout,
 * sans toucher au reste.
 *
 *   node site/tools/site-url.mjs                       # affiche l’adresse actuelle
 *   node site/tools/site-url.mjs https://vela.app      # réécrit tout
 *
 * Sans changement, aucun fichier n’est réécrit : relancer la même commande ne
 * produit aucun diff.
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')
const siteSource = join(root, 'src/shared/site.ts')
const siteRoot = join(root, 'site')

/** Fichiers du site qui portent l’origine publique. */
const TARGETS = ['.html', '.xml', '.txt']
const EXTRA = [join(siteRoot, 'README.md')]

const fail = (message) => {
  console.error(`site-url : ${message}`)
  process.exit(1)
}

const readOrigin = () => {
  const source = readFileSync(siteSource, 'utf8')
  const match = source.match(/export const SITE_URL = '([^']+)'/)
  if (!match) fail(`SITE_URL introuvable dans ${relative(root, siteSource)}`)
  return match[1].replace(/\/+$/, '')
}

const normalise = (input) => {
  let url
  try {
    url = new URL(input)
  } catch {
    fail(`« ${input} » n’est pas une URL absolue`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    fail('l’adresse doit commencer par https:// (ou http:// en local)')
  }
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    fail('donnez seulement l’origine, par exemple https://vela.app')
  }
  return url.origin
}

const current = readOrigin()

const next = process.argv[2] ? normalise(process.argv[2]) : null
if (!next) {
  console.log(`Adresse actuelle : ${current}`)
  console.log('Pour la changer : node site/tools/site-url.mjs https://exemple.fr')
  process.exit(0)
}

if (next === current) {
  console.log(`Adresse déjà à jour : ${current}`)
  process.exit(0)
}

const files = []
const walk = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      walk(path)
      continue
    }
    if (TARGETS.includes(extname(entry.name))) files.push(path)
  }
}
walk(join(siteRoot, 'public'))
for (const path of EXTRA) {
  try {
    if (statSync(path).isFile()) files.push(path)
  } catch {
    /* fichier facultatif */
  }
}

const rewritten = []
for (const path of files) {
  const before = readFileSync(path, 'utf8')
  if (!before.includes(current)) continue
  const after = before.split(current).join(next)
  if (after !== before) {
    writeFileSync(path, after)
    rewritten.push(relative(root, path))
  }
}

const source = readFileSync(siteSource, 'utf8')
const updated = source.replace(
  /export const SITE_URL = '[^']+'/,
  `export const SITE_URL = '${next}'`
)
if (updated !== source) {
  writeFileSync(siteSource, updated)
  rewritten.push(relative(root, siteSource))
}

console.log(`${current} → ${next}`)
if (rewritten.length === 0) {
  console.log('Aucun fichier ne contenait l’ancienne adresse.')
} else {
  console.log(`${rewritten.length} fichier(s) réécrit(s) :`)
  for (const file of rewritten) console.log(`  · ${file}`)
}
