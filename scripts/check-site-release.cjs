/* Vela — le site annonce une version et six empreintes SHA-256 : ce script
   vérifie qu’elles correspondent aux fichiers réellement publiés sur GitHub.

   C’est la dérive qui a fait afficher la 0.3.21 après la sortie de la 0.3.22 :
   rien ne reliait la page à la release. Sortie 0 si tout concorde, 1 sinon.

   Deux modes :

   · par défaut, il lit `site/public/index.html` et le compare à la release de
     la version annoncée par `package.json` ;
   · `--served` lit la page **réellement servie** (SITE_URL) et la compare à la
     dernière release publiée. C’est le seul mode qui voit une page oubliée :
     le fichier du dépôt peut être juste pendant que le site public reste
     bloqué sur une version antérieure — c’est arrivé six releases de suite,
     jusqu’à la 0.3.37 servie alors que la 0.3.43 était sortie.

   Quand la version de package.json est en avance sur les releases — le commit
   de bump précède la construction — la release n’existe pas encore : le script
   le dit et laisse passer, la CI n’a pas à échouer sur l’ordre des étapes.

   Usage :
     node scripts/check-site-release.cjs               (ou npm run site:check)
     node scripts/check-site-release.cjs --served      (ou npm run site:check:served)
   Variables : GITHUB_REPOSITORY, GH_TOKEN ou GITHUB_TOKEN (facultatif),
               SITE_URL (facultatif, défaut : le site de production). */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const REPO = process.env.GITHUB_REPOSITORY || 'DmzGamingYT/vela'
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || ''
const SERVI = process.argv.includes('--served')
const SITE_URL =
  process.env.SITE_URL || 'https://site-cd854ef5da03437a8f42ade87147e33d.freebuff.page/'

// La page d’accueil est la seule à porter la fiche des fichiers.
// Chaque ligne annonce son fichier dans `data-file` et son empreinte dans le
// bouton de copie : on apparie les deux dans la même ligne, sans dépendre de la
// forme exacte du HTML (le balisage peut changer, pas le fichier ni son hash).
const lireSite = (html, origine) => {
  const version = (html.match(/"softwareVersion":\s*"([^"]+)"/) || [])[1]
  const fichiers = [
    ...html.matchAll(/data-file="([^"]+)"[\s\S]{0,900}?data-copy="([0-9a-f]{64})"/g)
  ].map((m) => ({ nom: m[1], empreinte: m[2] }))
  return { version, fichiers, origine }
}

const entetes = {
  Accept: 'application/vnd.github+json',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {})
}

const release = async (chemin) => {
  const reponse = await fetch(`https://api.github.com/repos/${REPO}${chemin}`, {
    headers: entetes
  })
  if (reponse.status === 404) return null
  if (!reponse.ok) {
    console.error(`GitHub a répondu ${reponse.status} pour ${REPO} — vérification impossible.`)
    process.exit(1)
  }
  return reponse.json()
}

const principal = async () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  let site
  let reference

  if (SERVI) {
    const reponse = await fetch(SITE_URL, { headers: { 'cache-control': 'no-cache' } })
    if (!reponse.ok) {
      console.error(`Le site a répondu ${reponse.status} pour ${SITE_URL} — vérification impossible.`)
      process.exit(1)
    }
    site = lireSite(await reponse.text(), SITE_URL)
    // La page servie se compare à la dernière release publiée, pas à un
    // package.json local qui peut être en avance sur elle.
    const derniere = await release('/releases/latest')
    if (!derniere) {
      console.log('Aucune release publiée — rien à comparer pour l’instant.')
      process.exit(0)
    }
    reference = derniere
  } else {
    const fichier = path.join(ROOT, 'site/public/index.html')
    if (!fs.existsSync(fichier)) {
      console.error('site/public/index.html est absent.')
      process.exit(1)
    }
    site = lireSite(fs.readFileSync(fichier, 'utf8'), 'site/public/index.html')
    const existe = await release(`/releases/tags/v${site.version}`)
    if (!existe && site.version) {
      console.log(`Release v${site.version} pas encore publiée — rien à comparer pour l’instant.`)
      const manques = []
      if (!site.version) manques.push('aucune version dans le JSON-LD')
      if (site.version !== pkg.version) {
        manques.push(`le site annonce ${site.version}, package.json dit ${pkg.version}`)
      }
      for (const manque of manques) console.error(`  ✗ ${manque}`)
      process.exit(manques.length ? 1 : 0)
    }
    reference = existe
  }

  const attendue = String(reference.tag_name || '').replace(/^v/, '')
  const problemes = []
  if (!site.version) problemes.push(`aucune version dans le JSON-LD de ${site.origine}`)
  if (site.version && site.version !== attendue) {
    problemes.push(
      SERVI
        ? `la page servie annonce ${site.version}, la dernière release est ${attendue} — le site n’a pas été redéployé`
        : `le site annonce ${site.version}, package.json dit ${pkg.version}`
    )
  }
  if (site.fichiers.length !== 6) {
    problemes.push(
      `${site.fichiers.length} fichier(s) avec empreinte trouvé(s) dans le tableau, 6 attendus`
    )
  }

  const assets = new Map(
    (reference.assets || []).map((asset) => [asset.name, (asset.digest || '').replace('sha256:', '')])
  )

  for (const { nom, empreinte } of site.fichiers) {
    const reelle = assets.get(nom)
    if (!reelle) problemes.push(`${nom} n’est pas attaché à la release v${attendue}`)
    else if (reelle !== empreinte) {
      problemes.push(
        `${nom} : la page annonce ${empreinte.slice(0, 16)}…, la release a ${reelle.slice(0, 16)}…`
      )
    } else console.log(`  ✓ ${nom}`)
  }

  if (problemes.length) {
    console.error(`\n${problemes.length} problème(s) :`)
    for (const probleme of problemes) console.error(`  ✗ ${probleme}`)
    process.exit(1)
  }
  console.log(
    `\n${SERVI ? `Page servie (${SITE_URL})` : 'Site du dépôt'} et release v${attendue} concordent (${site.fichiers.length} empreintes).`
  )
}

principal().catch((error) => {
  console.error('Vérification interrompue :', error.message)
  process.exit(1)
})
