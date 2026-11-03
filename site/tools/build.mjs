/* Vela — construction du site publié.

   Les sources de `site/public` restent lisibles (commentaires, mise en forme) ;
   ce script écrit dans `site/dist` ce qui part réellement chez l’hébergeur :

     · CSS et JS minifiés, dont le nom porte l’empreinte de leur contenu, donc
       servis `immutable` un an sans risque de version périmée ;
     · le HTML réécrit vers ces noms ;
     · les autres fichiers copiés tels quels (captures, icônes, polices) ;
     · le worker et un manifeste Sites prêts à déployer.

   Usage : node site/tools/build.mjs   (ou npm run site:build) */
import { createHash } from 'node:crypto'
import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from 'esbuild'

const SITE = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(SITE, 'public')
const OUT = join(SITE, 'dist')
const PUBLIC = join(OUT, 'public')

const MINIFIE = new Set(['.css', '.js'])

const empreinte = (contenu) => createHash('sha256').update(contenu).digest('hex').slice(0, 10)

const renommes = new Map()
const tailles = { avant: 0, apres: 0 }

const minifier = async (fichier) => {
  const ext = extname(fichier)
  const code = readFileSync(fichier, 'utf8')
  const resultat = await transform(code, {
    loader: ext === '.css' ? 'css' : 'js',
    minify: true,
    // utf8 : sans cela esbuild échappe chaque accent, ce qui grossit le fichier.
    charset: 'utf8',
    legalComments: 'none'
  })
  const nom = fichier.slice(SRC.length + 1).replace(ext, `.${empreinte(resultat.code)}.min${ext}`)
  const cible = join(PUBLIC, nom)
  mkdirSync(join(cible, '..'), { recursive: true })
  writeFileSync(cible, resultat.code)
  renommes.set(relative(SRC, fichier).split('\\').join('/'), nom.split('\\').join('/'))
  tailles.avant += Buffer.byteLength(code)
  tailles.apres += Buffer.byteLength(resultat.code)
  return nom
}

const copierHtml = (fichier) => {
  const html = readFileSync(fichier, 'utf8')
  const reecrit = html.replace(/\/([\w.-]+\.(?:css|js))/g, (tout, nom) => {
    const nouveau = renommes.get(nom)
    return nouveau ? `/${nouveau}` : tout
  })
  const cible = join(PUBLIC, relative(SRC, fichier))
  mkdirSync(join(cible, '..'), { recursive: true })
  writeFileSync(cible, reecrit)
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(PUBLIC, { recursive: true })

// CSS et JS d’abord : le HTML a besoin de leurs nouveaux noms. `transform` est
// asynchrone, d’où la collecte des promesses avant la seconde passe.
const taches = []
const parcourir = (dossier) => {
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, entree.name)
    if (entree.isDirectory()) parcourir(chemin)
    else if (MINIFIE.has(extname(entree.name))) taches.push(minifier(chemin))
  }
}
parcourir(SRC)
await Promise.all(taches)

const secondePasse = (dossier) => {
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, entree.name)
    if (entree.isDirectory()) secondePasse(chemin)
    else if (!MINIFIE.has(extname(entree.name))) {
      if (extname(entree.name) === '.html') copierHtml(chemin)
      else {
        const cible = join(PUBLIC, relative(SRC, chemin))
        mkdirSync(join(cible, '..'), { recursive: true })
        cpSync(chemin, cible)
      }
    }
  }
}
secondePasse(SRC)

cpSync(join(SITE, 'worker.js'), join(OUT, 'worker.js'))

writeFileSync(
  join(OUT, 'deploy.json'),
  `${JSON.stringify(
    {
      entrypoint: 'worker.js',
      compatibilityDate: '2026-10-25',
      modules: [{ name: 'worker.js', type: 'esm', path: './worker.js' }],
      assetsDirectory: './public'
    },
    null,
    2
  )}\n`
)

const octets = (dossier) =>
  readdirSync(dossier, { withFileTypes: true }).reduce((total, entree) => {
    const chemin = join(dossier, entree.name)
    return total + (entree.isDirectory() ? octets(chemin) : statSync(chemin).size)
  }, 0)

console.log('CSS/JS minifiés :', renommes.size)
for (const [avant, apres] of renommes) console.log(`  ${avant} -> ${apres}`)
console.log(
  `Poids CSS/JS : ${(tailles.avant / 1024).toFixed(1)} Ko -> ${(tailles.apres / 1024).toFixed(1)} Ko`
)
console.log('Dossier publié :', `${(octets(OUT) / 1024 / 1024).toFixed(2)} Mo dans site/dist`)
console.log('Manifeste : site/dist/deploy.json')
