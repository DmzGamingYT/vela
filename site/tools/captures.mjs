#!/usr/bin/env node
/**
 * Vela — captures du site.
 *
 * Les captures d’origine vivent dans `site/public/captures/*.jpg` en 1440×900.
 * Ce script en dérive les variantes servies par les balises <picture> :
 *
 *   nom.jpg        1440×900  (l’original, gardé tel quel)
 *   nom-1080.jpg   1080×675  (repli JPEG pour les écrans denses)
 *   nom-720.jpg     720×450  (repli JPEG mobile)
 *   nom.avif       1440×900
 *   nom-1080.avif  1080×675
 *   nom-720.avif    720×450
 *
 * AVIF pèse ~6× moins que le JPEG d’origine pour la même capture d’interface.
 * Les fichiers sont réécrits seulement si la source est plus récente.
 *
 *   node site/tools/captures.mjs [--force]
 *
 * Dépendances : `sips` (macOS) et `ffmpeg` avec l’encodeur SVT-AV1.
 */

import { execFileSync } from 'node:child_process'
import { readdirSync, statSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dir = join(here, '../public/captures')
const force = process.argv.includes('--force')

const WIDTHS = [720, 1080]
const AVIF_CRF = 30
const JPEG_QUALITY = 78

const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'pipe' })

const kb = (path) => `${(statSync(path).size / 1024).toFixed(1)} Ko`
const fresh = (source, target) => !force && existsSync(target) && statSync(target).mtimeMs >= statSync(source).mtimeMs

const jpeg = (source, target, width) => {
  if (fresh(source, target)) return false
  run('sips', ['-Z', String(width), '-s', 'format', 'jpeg', '-s', 'formatOptions', String(JPEG_QUALITY), source, '--out', target])
  return true
}

const avif = (source, target, width) => {
  if (fresh(source, target)) return false
  run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', source,
    '-vf', `scale=${width}:-2:flags=lanczos`,
    '-c:v', 'libsvtav1',
    '-crf', String(AVIF_CRF),
    '-f', 'avif',
    target
  ])
  return true
}

const sources = readdirSync(dir).filter((name) => /\.jpg$/.test(name) && !/-\d+\.jpg$/.test(name))
if (!sources.length) {
  console.error('aucune capture source dans', dir)
  process.exit(1)
}

let made = 0
for (const name of sources) {
  const base = name.replace(/\.jpg$/, '')
  const source = join(dir, name)
  const outputs = []
  for (const width of WIDTHS) {
    outputs.push([`${base}-${width}.jpg`, jpeg(source, join(dir, `${base}-${width}.jpg`), width)])
  }
  for (const width of [1440, ...WIDTHS]) {
    const target = width === 1440 ? `${base}.avif` : `${base}-${width}.avif`
    outputs.push([target, avif(source, join(dir, target), width)])
  }
  const written = outputs.filter(([, changed]) => changed).map(([file]) => file)
  made += written.length
  const total = outputs.reduce((sum, [file]) => sum + statSync(join(dir, file)).size, 0)
  console.log(
    `${name.padEnd(22)} ${kb(source).padStart(9)} → ${(total / 1024).toFixed(0)} Ko de variantes` +
      (written.length ? `  (${written.length} réécrites)` : '  (à jour)')
  )
}

console.log(`\n${made} fichier(s) écrit(s) dans site/public/captures/`)
