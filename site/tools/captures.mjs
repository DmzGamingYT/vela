#!/usr/bin/env node
/**
 * Vela — captures du site.
 *
 * Les captures d’origine vivent dans `site/captures-src/*.jpg` en 1440×900.
 * Elles ne sont pas publiées : ce script écrit dans `site/public/captures/`
 * les variantes servies par les balises <picture> :
 *
 *   nom.avif       1440×900
 *   nom-1080.avif  1080×675
 *   nom-720.avif    720×450
 *   nom.webp       1440×900  (repli)
 *   nom-1080.webp  1080×675
 *   nom-720.webp    720×450
 *
 * AVIF pèse ~6× moins que le JPEG d’origine pour la même capture d’interface ;
 * WebP sert de repli aux navigateurs qui ne lisent pas l’AVIF. Les fichiers
 * sont réécrits seulement si la source est plus récente.
 *
 *   node site/tools/captures.mjs [--force]
 *
 * Dépendances : `ffmpeg` avec l’encodeur SVT-AV1, et `cwebp`.
 */

import { execFileSync } from 'node:child_process'
import { readdirSync, statSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dir = join(here, '../captures-src')
const out = join(here, '../public/captures')
const force = process.argv.includes('--force')

const WIDTHS = [720, 1080]
const AVIF_CRF = 30
const WEBP_QUALITY = 82

const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'pipe' })

const kb = (path) => `${(statSync(path).size / 1024).toFixed(1)} Ko`
const fresh = (source, target) =>
  !force && existsSync(target) && statSync(target).mtimeMs >= statSync(source).mtimeMs

const avif = (source, target, width) => {
  if (fresh(source, target)) return false
  run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    source,
    '-vf',
    `scale=${width}:-2:flags=lanczos`,
    '-c:v',
    'libsvtav1',
    '-crf',
    String(AVIF_CRF),
    '-f',
    'avif',
    target
  ])
  return true
}

const webp = (source, target, width) => {
  if (fresh(source, target)) return false
  run('cwebp', [
    '-quiet',
    '-q',
    String(WEBP_QUALITY),
    '-resize',
    String(width),
    '0',
    source,
    '-o',
    target
  ])
  return true
}

mkdirSync(out, { recursive: true })
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
  for (const width of [1440, ...WIDTHS]) {
    const suffix = width === 1440 ? '' : `-${width}`
    outputs.push([`${base}${suffix}.avif`, avif(source, join(out, `${base}${suffix}.avif`), width)])
    outputs.push([`${base}${suffix}.webp`, webp(source, join(out, `${base}${suffix}.webp`), width)])
  }
  const written = outputs.filter(([, changed]) => changed).map(([file]) => file)
  made += written.length
  const total = outputs.reduce((sum, [file]) => sum + statSync(join(out, file)).size, 0)
  console.log(
    `${name.padEnd(22)} ${kb(source).padStart(9)} → ${(total / 1024).toFixed(0)} Ko de variantes` +
      (written.length ? `  (${written.length} réécrites)` : '  (à jour)')
  )
}

console.log(`\n${made} fichier(s) écrit(s) dans site/public/captures/`)
