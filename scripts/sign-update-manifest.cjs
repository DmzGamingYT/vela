/* Signature Ed25519 du manifeste de mise à jour, en CI.

   Sans cette signature, Vela refuse le manifeste : l'empreinte SHA-512 publiée
   dans le même fichier que la charge utile ne prouve rien si le canal de
   distribution est compromis. La moitié privée vient du secret
   VELA_UPDATE_SIGNING_KEY, la moitié publique est épinglée dans le code.

   Usage : VELA_UPDATE_SIGNING_KEY=… node scripts/sign-update-manifest.cjs release/mac/latest-mac.yml
   Sortie : <manifeste>.sig, en base64 sur une ligne. */
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const target = process.argv[2]
const secret = (process.env.VELA_UPDATE_SIGNING_KEY || '').trim()
if (!target || !secret) {
  console.error('Usage : VELA_UPDATE_SIGNING_KEY=… node scripts/sign-update-manifest.cjs <manifeste>')
  process.exit(1)
}

const KEY_PATTERN = /export const UPDATE_SIGNING_PUBLIC_KEY = '([A-Za-z0-9+/=]*)'/

/** Clé publique brute (base64, 32 octets) dérivée de la moitié privée qui signe. */
function publicKeyOf(privateKey) {
  return crypto.createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64')
}

let privateKey
try {
  privateKey = crypto.createPrivateKey({ key: Buffer.from(secret, 'base64'), format: 'der', type: 'pkcs8' })
} catch {
  console.error('ERREUR : VELA_UPDATE_SIGNING_KEY n’est pas une clé Ed25519 en base64 (build/update-signing.key).')
  process.exit(1)
}

// La clé épinglée dans l'application doit être la moitié publique de celle qui
// signe ici. Publier sans cette coïncidence laisserait tous les clients bloqués
// sur leur version précédente, sans que rien ne le signale.
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'integrity.ts'), 'utf8')
const pinned = KEY_PATTERN.exec(source)
if (!pinned) {
  console.error('ERREUR : constante UPDATE_SIGNING_PUBLIC_KEY introuvable dans src/main/integrity.ts.')
  process.exit(1)
}
const signing = publicKeyOf(privateKey)
if (pinned[1] !== signing) {
  console.error(
    `ERREUR : la clé qui signe n'est pas la clé épinglée dans le code.\n` +
      `  épinglée  : ${pinned[1]}\n` +
      `  signature : ${signing}\n` +
      `  Génère les deux d'un coup : node scripts/make-update-key.cjs`
  )
  process.exit(1)
}

const signature = crypto.sign(null, fs.readFileSync(target), privateKey).toString('base64')
fs.writeFileSync(`${target}.sig`, `${signature}\n`)
console.log(`signé : ${target}.sig (clé ${signing.slice(0, 8)}…)`)
