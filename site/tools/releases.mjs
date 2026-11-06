/* Vela — pages de release du site.

   Une version, un fichier : `site/releases/<version>.json` décrit la page, ce
   script la rend. Il reprend la charpente de `nouveautes/index.html` (head,
   en-tête flottant, pied de page) pour que rien ne dérive entre les pages, puis
   écrit dans `site/public/nouveautes/<slug>/`.

   Il tient aussi le journal à jour : la ligne de chaque version pointe vers sa
   page locale, et son titre devient le lien de toute la ligne. Enfin il ajoute
   les adresses au sitemap. Tout est idempotent : relancer ne change rien.

   Usage : node site/tools/releases.mjs   (ou npm run site:releases) */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = fileURLToPath(new URL('..', import.meta.url))
const PUBLIC = join(SITE, 'public')
const RELEASES = join(SITE, 'releases')
const JOURNAL = join(PUBLIC, 'nouveautes/index.html')
const SITEMAP = join(PUBLIC, 'sitemap.xml')
const ORIGINE = 'https://site-cd854ef5da03437a8f42ade87147e33d.freebuff.page'

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

const echappe = (texte) =>
  String(texte)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const enFrancais = (iso) => {
  const [annee, mois, jour] = iso.split('-').map(Number)
  return `${jour} ${MOIS[mois - 1]} ${annee}`
}

const nombre = (valeur) => String(valeur).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

const sansBalises = (html) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const tronque = (texte, limite = 155) =>
  texte.length <= limite ? texte : `${texte.slice(0, limite - 1).replace(/[\s,;:.]+\S*$/, '')}…`

// --- Rendu des figures ------------------------------------------------------

const rendreFigure = (figure) => {
  if (!figure) return ''

  if (figure.type === 'capture') {
    return `<figure class="release-figure">
              <img
                src="${figure.src}"
                alt="${echappe(figure.alt)}"
                width="${figure.width}"
                height="${figure.height}"
                loading="lazy"
                decoding="async"
              />
              <figcaption>${figure.caption}</figcaption>
            </figure>`
  }

  if (figure.type === 'metrics') {
    const cartes = figure.items
      .map(
        (item) => `<div class="metric">
                <p class="metric-valeurs"><span class="avant">${item.before}</span><span class="fleche" aria-hidden="true">→</span><span class="apres">${item.after}</span></p>
                <p class="metric-legende">${item.label}</p>
              </div>`
      )
      .join('\n              ')
    return `<figure class="release-figure release-figure-mesures">
              <div class="release-metrics">
              ${cartes}
              </div>
              <figcaption>${figure.caption}</figcaption>
            </figure>`
  }

  if (figure.type === 'schema') {
    const etapes = figure.steps
      .map((etape) => `<li class="etape">${etape}</li>`)
      .join('\n                ')
    return `<figure class="release-figure cablage">
              <ol class="release-schema">
                ${etapes}
              </ol>
              <figcaption>${figure.caption}</figcaption>
            </figure>`
  }

  if (figure.type === 'diff') {
    const lignes = figure.lines
      .map(
        (ligne) =>
          `<span class="${ligne.kind === 'plus' ? 'plus' : 'moins'}">${echappe(ligne.text)}</span>`
      )
      .join('\n')
    return `<figure class="release-figure release-figure-diff">
              <pre class="release-diff"><code>${lignes}</code></pre>
              <figcaption>${figure.caption}</figcaption>
            </figure>`
  }

  throw new Error(`type de figure inconnu : ${figure.type}`)
}

// --- Page ------------------------------------------------------------------

const rendrePage = (version, charpente, voisines) => {
  const paragraphes = (corps) => corps.map((p) => `<p>${p}</p>`).join('\n            ')

  const sections = version.sections
    .map(
      (section) => `<section class="release-section">
            <h2>${section.title}</h2>
            ${paragraphes(section.body)}
            ${rendreFigure(section.figure)}
          </section>`
    )
    .join('\n\n          ')

  const verifier = version.verify?.length
    ? `<section class="release-section release-verifier">
            <h2>Comment vérifier</h2>
            <ul class="steps">
              ${version.verify.map((etape) => `<li>${etape}</li>`).join('\n              ')}
            </ul>
          </section>`
    : ''

  const lien = (autre, sens) =>
    autre
      ? `<a class="release-voisine" href="/nouveautes/${autre.slug}/">
              <span class="eyebrow">${sens === 'precedent' ? 'Version précédente' : 'Version suivante'}</span>
              <span class="release-voisine-titre">${autre.version} — ${autre.headline}</span>
            </a>`
      : '<span></span>'

  const description = tronque(sansBalises(version.intro))

  const corps = `${charpente.prefix}
      <section class="page-head">
        <div class="wrap">
          <p class="eyebrow">Nouveautés · ${enFrancais(version.date)}</p>
          <h1>${version.headline}</h1>
          <p class="lede">${version.intro}</p>
          <p class="meta">
            <span>Version ${version.version}</span>
            <span>${version.stats.commits} commit${version.stats.commits > 1 ? 's' : ''}</span>
            <span>${version.stats.files} fichiers</span>
            <span>+${nombre(version.stats.insertions)} / −${nombre(version.stats.deletions)}</span>
          </p>
          <p class="tags release-tags">
            ${version.tags.map((tag) => `<span>${tag}</span>`).join('')}
          </p>
        </div>
      </section>

      <div class="wrap section section-tete">
        <article class="release">
          ${sections}

          ${verifier}

          <p class="release-liens">
            <a class="btn btn-ghost" href="${version.compare}">Différentiel v${version.version} sur GitHub</a>
            <a class="btn btn-ghost" href="https://github.com/DmzGamingYT/vela/releases/tag/v${version.version}">Release et installateurs</a>
          </p>

          <nav class="release-nav" aria-label="Versions voisines">
            ${lien(voisines.precedent, 'precedent')}
            ${lien(voisines.suivante, 'suivante')}
          </nav>
        </article>
      </div>
    </main>${charpente.suffixe}`

  const head = corps
    .replace(
      /<title>[^<]*<\/title>/,
      `<title>Vela ${version.version} — ${echappe(version.headline)}</title>`
    )
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${echappe(description)}$2`)
    // Les attributs sont répartis sur plusieurs lignes dans la charpente : `\s+`
    // les traverse, sinon la page gardait le canonical du journal.
    .replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/, `$1${ORIGINE}/nouveautes/${version.slug}/$2`)
    .replace(
      /(<meta\s+property="og:url"\s+content=")[^"]*(")/,
      `$1${ORIGINE}/nouveautes/${version.slug}/$2`
    )
    .replace(
      /(<meta property="og:title" content=")[^"]*(")/,
      `$1Vela ${version.version} — ${echappe(version.headline)}$2`
    )
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${echappe(description)}$2`)

  return head
}

// --- Programme -------------------------------------------------------------

const charpenteDe = () => {
  const journal = readFileSync(JOURNAL, 'utf8')
  const debutMain = journal.indexOf('<main')
  const debutTete = journal.indexOf('<section', debutMain)
  const pied = journal.indexOf('<footer class="foot">')
  if (debutMain < 0 || debutTete < 0 || pied < 0) {
    throw new Error(
      'charpente introuvable dans nouveautes/index.html : <main>, <section> et <footer> attendus'
    )
  }
  return { prefix: journal.slice(0, debutTete), suffixe: journal.slice(pied) }
}

const versions = readdirSync(RELEASES)
  .filter((fichier) => fichier.endsWith('.json'))
  .map((fichier) => JSON.parse(readFileSync(join(RELEASES, fichier), 'utf8')))
  .sort((a, b) => b.version.localeCompare(a.version, 'fr', { numeric: true }))

const charpente = charpenteDe()

versions.forEach((version, index) => {
  const dossier = join(PUBLIC, 'nouveautes', version.slug)
  mkdirSync(dossier, { recursive: true })
  writeFileSync(
    join(dossier, 'index.html'),
    rendrePage(version, charpente, {
      suivante: versions[index - 1] ?? null,
      precedent: versions[index + 1] ?? null
    })
  )
})

// --- Journal : la ligne mène à la page locale -------------------------------

let journal = readFileSync(JOURNAL, 'utf8')
let liensJournal = 0
for (const version of versions) {
  const github = `href="https://github.com/DmzGamingYT/vela/releases/tag/v${version.version}">${version.version}<`
  const local = `href="/nouveautes/${version.slug}/">${version.version}<`
  if (journal.includes(github)) {
    journal = journal.replace(github, local)
    liensJournal += 1
  }
  const titreNu = `<h2>${version.headline}</h2>`
  const titreLie = `<h2><a href="/nouveautes/${version.slug}/">${version.headline}</a></h2>`
  if (journal.includes(titreNu)) journal = journal.replace(titreNu, titreLie)
}
writeFileSync(JOURNAL, journal)

// --- Sitemap ---------------------------------------------------------------

let sitemap = readFileSync(SITEMAP, 'utf8')
let ajoutees = 0
for (const version of versions) {
  const adresse = `${ORIGINE}/nouveautes/${version.slug}/`
  if (sitemap.includes(adresse)) continue
  const entree = `  <url>
    <loc>${adresse}</loc>
    <lastmod>${version.date}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.4</priority>
  </url>\n`
  sitemap = sitemap.replace('</urlset>', `${entree}</urlset>`)
  ajoutees += 1
}
writeFileSync(SITEMAP, sitemap)

console.log(
  `Pages de release : ${versions.length} rendues (${versions.map((v) => v.version).join(', ')})`
)
console.log(`Journal : ${liensJournal} lien(s) basculé(s) vers les pages locales`)
console.log(`Sitemap : ${ajoutees} adresse(s) ajoutée(s)`)
