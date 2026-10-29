import { createHash, timingSafeEqual } from 'node:crypto'

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
