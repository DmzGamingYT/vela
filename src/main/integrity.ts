import { createHash, createPublicKey, timingSafeEqual, verify, type KeyObject } from 'node:crypto'

/** Empreinte SHA-512 en base64, le format publié par electron-builder. */
export function sha512Base64(data: Buffer): string {
  return createHash('sha512').update(data).digest('base64')
}

/** Compare deux empreintes base64 sans laisser fuiter le premier octet différent. */
export function digestEquals(actual: string, expected: string): boolean {
  const left = Buffer.from(actual, 'base64')
  const right = Buffer.from(expected, 'base64')
  if (left.length !== right.length || left.length === 0) return false
  return timingSafeEqual(left, right)
}

/**
 * Vérifie un téléchargement contre l'entrée du manifeste : taille exacte et
 * empreinte SHA-512. Un fichier tronqué ou remplacé est rejeté.
 */
export function verifyDownload(input: {
  base64: string
  bytes: number
  expected: { sha512: string; size: number }
}): boolean {
  if (input.bytes !== input.expected.size) return false
  return digestEquals(input.base64, input.expected.sha512)
}

/**
 * Moitié publique de la clé qui signe les manifestes de mise à jour. La moitié
 * privée n'existe que dans le secret `VELA_UPDATE_SIGNING_KEY` de la CI : un
 * compte GitHub compromis ne peut plus pousser un `latest-mac.yml` qui sera
 * accepté, alors que ses empreintes SHA-512, publiées dans le même fichier que
 * la charge utile, se suivaient très bien entre elles.
 * Régénérée par `scripts/make-update-key.cjs`.
 */
export const UPDATE_SIGNING_PUBLIC_KEY = '9QBCxZ7LvT4j8xvhNK0j9p34GZlBM0URaOVd41pqGC8='

/** En-tête SPKI DER d'une clé Ed25519, suivi des 32 octets de la clé brute. */
const ED25519_SPKI_PREFIX = '302a300506032b6570032100'

function ed25519PublicKey(base64: string): KeyObject | null {
  const raw = Buffer.from(base64, 'base64')
  if (raw.length !== 32) return null
  try {
    return createPublicKey({
      key: Buffer.concat([Buffer.from(ED25519_SPKI_PREFIX, 'hex'), raw]),
      format: 'der',
      type: 'spki'
    })
  } catch {
    return null
  }
}

/**
 * true si `signature` (base64, 64 octets) est bien la signature Ed25519 de
 * `manifest` par la clé épinglée. Un manifeste sans signature, mal signé ou
 * tronqué est refusé : mieux vaut aucune mise à jour qu'une mise à jour dont
 * personne n'a signé le contenu.
 */
export function manifestSignatureValid(
  manifest: Buffer,
  signature: string,
  publicKey = UPDATE_SIGNING_PUBLIC_KEY
): boolean {
  const key = ed25519PublicKey(publicKey)
  if (!key) return false
  const bytes = Buffer.from(signature.trim(), 'base64')
  if (bytes.length !== 64) return false
  try {
    return verify(null, manifest, key, bytes)
  } catch {
    return false
  }
}
