/* Génère la paire Ed25519 qui ancre la chaîne de mise à jour.

   La moitié privée n'est jamais affichée : elle est écrite dans
   build/update-signing.key (ignoré par git), à copier telle quelle dans le
   secret GitHub Actions VELA_UPDATE_SIGNING_KEY. La moitié publique est posée
   dans src/main/integrity.ts, là où l'application la lit au démarrage.

   Usage : node scripts/make-update-key.cjs [--force] */
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const PRIVATE_FILE = path.join(ROOT, 'build', 'update-signing.key')
const INTEGRITY_FILE = path.join(ROOT, 'src', 'main', 'integrity.ts')

if (fs.existsSync(PRIVATE_FILE) && !process.argv.includes('--force')) {
  const publicKey = publicFromPrivate(fs.readFileSync(PRIVATE_FILE, 'utf8').trim())
  console.log(`La clé existe déjà : ${PRIVATE_FILE}`)
  console.log(`Clé publique épinglée : ${publicKey}`)
  console.log('Relance avec --force pour en créer une nouvelle (les manifestes déjà signés avec l’ancienne seront refusés).')
  process.exit(0)
}

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
const secret = privateKey
  .export({ format: 'der', type: 'pkcs8' })
  .toString('base64')
const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64')

fs.mkdirSync(path.dirname(PRIVATE_FILE), { recursive: true })
fs.writeFileSync(PRIVATE_FILE, `${secret}\n`, { mode: 0o600 })

const source = fs.readFileSync(INTEGRITY_FILE, 'utf8')
const pattern = /(export const UPDATE_SIGNING_PUBLIC_KEY = ')[A-Za-z0-9+/=]*(')/
if (!pattern.test(source)) {
  console.error('ERREUR : constante UPDATE_SIGNING_PUBLIC_KEY introuvable dans src/main/integrity.ts.')
  process.exit(1)
}
fs.writeFileSync(INTEGRITY_FILE, source.replace(pattern, `$1${raw}$2`))

console.log(`Clé privée : ${PRIVATE_FILE} (0600, jamais au dépôt, jamais affichée ici).`)
console.log(`Clé publique épinglée dans integrity.ts : ${raw}`)
console.log('')
console.log('À faire :')
console.log(`  1. gh secret set VELA_UPDATE_SIGNING_KEY --repo DmzGamingYT/vela < ${PRIVATE_FILE}`)
console.log('  2. commit src/main/integrity.ts')

/** Retire la moitié publique (base64 brut) d'une moitié privée encodée. */
function publicFromPrivate(secretBase64) {
  const key = crypto.createPrivateKey({ key: Buffer.from(secretBase64, 'base64'), format: 'der', type: 'pkcs8' })
  return crypto
    .createPublicKey(key)
    .export({ format: 'der', type: 'spki' })
    .subarray(-32)
    .toString('base64')
}
