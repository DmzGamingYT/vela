/* Vela — la fiche d’identité de l’accueil.

   Six faits qu’on ne veut pas écrire à la main : ils changeaient à chaque
   release, et une fiche périmée est pire que pas de fiche. Ce script les
   déduit des sources réelles, puis réécrit le bloc entre les deux marqueurs
   de `site/public/index.html` — et seulement s’il y a quelque chose à
   changer, pour ne pas salir le dépôt à chaque build.

     · version, plateformes et licence : le JSON-LD de la page ;
     · poids par plateforme : la fiche de téléchargement, donc les tuiles ;
     · nombre de notes : les fichiers de `site/releases/` ;
     · date de sortie : l’API GitHub de la release, avec un cache local
       (`site/.cache/release.json`) pour que le build fonctionne hors ligne.
       Sans réseau ni cache, la date est omise plutôt qu’inventée.

   Usage : node site/tools/fiche.mjs   (appelé en tête de `npm run site:build`). */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = fileURLToPath(new URL('..', import.meta.url))
const PAGE = join(SITE, 'public', 'index.html')
const RELEASES = join(SITE, 'releases')
const CACHE = join(SITE, '.cache', 'release.json')

const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre'
]

const page = readFileSync(PAGE, 'utf8')

const champ = (nom) => {
  const trouve = page.match(new RegExp(`"${nom}"\\s*:\\s*"([^"]+)"`))
  return trouve ? trouve[1] : null
}

const version = champ('softwareVersion')
if (!version) {
  console.error('fiche : aucune version dans le JSON-LD — bloc laissé tel quel.')
  process.exit(0)
}

const systemes = champ('operatingSystem')
const licence = (champ('license') || '').match(/\/([A-Za-z0-9.-]+)$/)?.[1] ?? null

/* --- Les poids : la fiche de téléchargement fait foi ---------------------- */

const poids = []
for (const bloc of page.matchAll(
  /<li class="dl-tile"[\s\S]*?<p class="dl-os">([^<]+)<\/p>[\s\S]*?class="dl-file-meta">([\d,]+)\s*Mo/g
)) {
  poids.push({ os: bloc[1].trim(), taille: `${bloc[2]} Mo` })
}

/* --- Les notes : un fichier par version ---------------------------------- */

const notes = readdirSync(RELEASES).filter((f) => f.endsWith('.json')).length

/* --- La date : GitHub, sinon le cache, sinon rien ------------------------ */

const lireCache = () => {
  if (!existsSync(CACHE)) return null
  try {
    const cache = JSON.parse(readFileSync(CACHE, 'utf8'))
    return cache.version === version && cache.date ? cache : null
  } catch {
    return null
  }
}

const demanderDate = async () => {
  const cache = lireCache()
  if (cache) return cache.date

  // VELA_OFFLINE : build hors ligne volontaire (CI sans réseau, machine isolée).
  if (process.env.VELA_OFFLINE) {
    console.warn('fiche : VELA_OFFLINE — date de release omise.')
    return null
  }

  try {
    const reponse = await fetch(`https://api.github.com/repos/DmzGamingYT/vela/releases/tags/v${version}`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(5000)
    })
    if (!reponse.ok) throw new Error(`GitHub ${reponse.status}`)
    const release = await reponse.json()
    if (!release.published_at) throw new Error('pas de date publiée')
    mkdirSync(join(SITE, '.cache'), { recursive: true })
    writeFileSync(CACHE, JSON.stringify({ version, date: release.published_at }, null, 2) + '\n')
    return release.published_at
  } catch (erreur) {
    console.warn(`fiche : date de release indisponible (${erreur.message}) — omise.`)
    return null
  }
}

const date = await demanderDate()

const enFrancais = (iso) => {
  const [annee, mois, jour] = iso.slice(0, 10).split('-').map(Number)
  const jourCourt = jour === 1 ? '1er' : String(jour)
  return `${jourCourt} ${MOIS[mois - 1]} ${annee}`
}

/* --- Le bloc ------------------------------------------------------------- */

const faits = [
  ['Version', version],
  date ? ['Sortie', enFrancais(date)] : null,
  systemes ? ['Plateformes', systemes.replace(/,\s*/g, ' · ')] : null,
  licence ? ['Licence', licence] : null,
  ...poids.map((p) => [p.os, p.taille]),
  ['Notes de version', String(notes)]
].filter(Boolean)

const bloc = faits
  .map(
    ([label, valeur]) =>
      `            <div class="fact">\n              <dt>${label}</dt>\n              <dd>${valeur}</dd>\n            </div>`
  )
  .join('\n')

const contenu = `<dl class="facts">\n${bloc}\n          </dl>`

const DEBUT = '<!-- fiche:debut -->'
const FIN = '<!-- fiche:fin -->'
const debut = page.indexOf(DEBUT)
const fin = page.indexOf(FIN)

if (debut === -1 || fin === -1) {
  console.error('fiche : marqueurs absents de index.html — rien n’a été écrit.')
  process.exit(0)
}

const avant = page.slice(0, debut + DEBUT.length)
const apres = page.slice(fin)
const actuel = page.slice(debut + DEBUT.length, fin).trim()

if (actuel === contenu) {
  console.log('fiche : à jour (aucune écriture).')
} else {
  writeFileSync(PAGE, `${avant}\n          ${contenu}\n          ${apres}`)
  console.log(`fiche : réécrite (${faits.length} faits).`)
}
