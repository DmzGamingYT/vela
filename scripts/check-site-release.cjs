/* Vela — le site annonce une version et six empreintes SHA-256 : ce script
   vérifie qu’elles correspondent aux fichiers réellement publiés sur GitHub.

   C’est la dérive qui a fait afficher la 0.3.21 après la sortie de la 0.3.22 :
   rien ne reliait la page à la release. Sortie 0 si tout concorde, 1 sinon.

   Quand la version de package.json est en avance sur les releases — le commit
   de bump précède la construction — la release n’existe pas encore : le script
   le dit et laisse passer, la CI n’a pas à échouer sur l’ordre des étapes.

   Usage : node scripts/check-site-release.cjs   (ou npm run site:check)
   Variables : GITHUB_REPOSITORY, GH_TOKEN ou GITHUB_TOKEN (facultatif). */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const REPO = process.env.GITHUB_REPOSITORY || 'DmzGamingYT/vela'
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || ''

// La page d’accueil est la seule à porter le tableau des fichiers.
const lireSite = (fichier) => {
  const html = fs.readFileSync(fichier, 'utf8')
  const version = (html.match(/"softwareVersion":\s*"([^"]+)"/) || [])[1]
  const fichiers = [
    ...html.matchAll(
      /releases\/download\/v[\d.]+\/([^"]+)">[^<]*<\/a>[\s\S]{0,600}?data-copy="([0-9a-f]{64})"/g
    )
  ].map((m) => ({ nom: m[1], empreinte: m[2] }))
  return { version, fichiers }
}

const principal = async () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const index = path.join(ROOT, 'site/public/index.html')
  const { version, fichiers } = lireSite(index)

  const problemes = []
  if (!version) problemes.push('aucune version dans le JSON-LD de site/public/index.html')
  if (version && version !== pkg.version) {
    problemes.push(`le site annonce ${version}, package.json dit ${pkg.version}`)
  }
  if (fichiers.length !== 6) {
    problemes.push(
      `${fichiers.length} fichier(s) avec empreinte trouvé(s) dans le tableau, 6 attendus`
    )
  }

  const reponse = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/v${version}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {})
    }
  })

  if (reponse.status === 404) {
    console.log(`Release v${version} pas encore publiée — rien à comparer pour l’instant.`)
    for (const probleme of problemes) console.error(`  ✗ ${probleme}`)
    process.exit(problemes.length ? 1 : 0)
  }
  if (!reponse.ok) {
    console.error(`GitHub a répondu ${reponse.status} pour ${REPO} — vérification impossible.`)
    process.exit(1)
  }

  const release = await reponse.json()
  const assets = new Map(
    (release.assets || []).map((asset) => [asset.name, (asset.digest || '').replace('sha256:', '')])
  )

  for (const { nom, empreinte } of fichiers) {
    const reelle = assets.get(nom)
    if (!reelle) problemes.push(`${nom} n’est pas attaché à la release v${version}`)
    else if (reelle !== empreinte) {
      problemes.push(
        `${nom} : le site annonce ${empreinte.slice(0, 16)}…, la release a ${reelle.slice(0, 16)}…`
      )
    } else console.log(`  ✓ ${nom}`)
  }

  if (problemes.length) {
    console.error(`\n${problemes.length} problème(s) :`)
    for (const probleme of problemes) console.error(`  ✗ ${probleme}`)
    process.exit(1)
  }
  console.log(`\nSite et release v${version} concordent (${fichiers.length} empreintes).`)
}

principal().catch((error) => {
  console.error('Vérification interrompue :', error.message)
  process.exit(1)
})
