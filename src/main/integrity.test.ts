import { describe, expect, it } from 'vitest'
import { generateKeyPairSync, sign as ed25519Sign } from 'node:crypto'
import {
  UPDATE_SIGNING_PUBLIC_KEY,
  digestEquals,
  manifestSignatureValid,
  sha512Base64,
  verifyDownload
} from './integrity'
import { manifestFile, parseMacManifest } from '@shared/update'

const MANIFEST = `version: 0.3.15
files:
  - url: Vela-0.3.15-x64.zip
    sha512: Z4cXEgHRWQvcYULte4oe7v9Zg/lgDuyjtnLhuOgXotB8vq1qZgqHO+3MrakL0kiIr77uyXgDWflDGivDWp4v9Q==
    size: 125308003
  - url: Vela-0.3.15-universal.dmg
    sha512: zGlrwTWpmu4OKw0Bgnb1bfiQ1YAqKfdMxhoE8lk37S644vn64xAUMx++AQJGfX+2Ulo5pIzlk9AMLh1ydbm9FQ==
    size: 226892797
path: Vela-0.3.15-x64.zip
sha512: Z4cXEgHRWQvcYULte4oe7v9Zg/lgDuyjtnLhuOgXotB8vq1qZgqHO+3MrakL0kiIr77uyXgDWflDGivDWp4v9Q==
`

describe('lecture du manifeste macOS', () => {
  it('retrouve la version et chaque fichier', () => {
    const manifest = parseMacManifest(MANIFEST)
    expect(manifest?.version).toBe('0.3.15')
    expect(manifest?.files).toHaveLength(2)
    expect(manifestFile(manifest, 'Vela-0.3.15-universal.dmg')?.size).toBe(226892797)
    expect(manifestFile(manifest, 'absent.dmg')).toBeNull()
  })

  it('refuse un manifeste sans version ou sans fichier complet', () => {
    expect(parseMacManifest('fichiers: rien')).toBeNull()
    expect(parseMacManifest('version: 1.0.0\nfiles:\n  - url: x.dmg\n    size: 12')).toBeNull()
  })
})

describe('empreintes de téléchargement', () => {
  it('calcule un SHA-512 base64 stable', () => {
    expect(sha512Base64(Buffer.from('vela'))).toBe(
      'xlKEo1qr3eQV9O68OA3Q769DTMs2n+PbqOdEpzR2e3R/v9SWjwceunBDhGGG815eA089jETny0SojQrWONrPgA=='
    )
  })

  it('accepte une taille et une empreinte exactes', () => {
    const data = Buffer.from('installateur')
    const base64 = sha512Base64(data)
    expect(
      verifyDownload({
        base64,
        bytes: data.length,
        expected: { sha512: base64, size: data.length }
      })
    ).toBe(true)
  })

  it('rejette une taille différente ou une empreinte remplacée', () => {
    const data = Buffer.from('installateur')
    const base64 = sha512Base64(data)
    expect(
      verifyDownload({
        base64,
        bytes: data.length + 1,
        expected: { sha512: base64, size: data.length }
      })
    ).toBe(false)
    const other = sha512Base64(Buffer.from('autre'))
    expect(
      verifyDownload({ base64, bytes: data.length, expected: { sha512: other, size: data.length } })
    ).toBe(false)
    expect(digestEquals('', '')).toBe(false)
  })
})

describe('signature du manifeste de mise à jour', () => {
  const pair = generateKeyPairSync('ed25519')
  const pinned = pair.publicKey
    .export({ format: 'der', type: 'spki' })
    .subarray(-32)
    .toString('base64')
  const sign = (bytes: Buffer): string =>
    ed25519Sign(null, bytes, pair.privateKey).toString('base64')
  const manifest = Buffer.from(MANIFEST, 'utf8')

  it('accepte la signature de la clé épinglée', () => {
    expect(manifestSignatureValid(manifest, sign(manifest), pinned)).toBe(true)
  })

  it('refuse un manifeste réécrit, même avec ses propres empreintes', () => {
    // C'est exactement l'attaque que la clé épinglée ferme : un compte GitHub
    // compromis publie un manifeste cohérent, versions et SHA-512 compris.
    const forged = Buffer.from(MANIFEST.replace('0.3.15', '0.9.9'), 'utf8')
    expect(manifestSignatureValid(forged, sign(manifest), pinned)).toBe(false)
  })

  it('refuse une signature absente, tronquée ou une clé malformée', () => {
    const good = sign(manifest)
    expect(manifestSignatureValid(manifest, '', pinned)).toBe(false)
    expect(manifestSignatureValid(manifest, good.slice(0, 60), pinned)).toBe(false)
    expect(manifestSignatureValid(manifest, good, '')).toBe(false)
    expect(manifestSignatureValid(manifest, good, Buffer.alloc(16).toString('base64'))).toBe(false)
  })

  it('ne laisse rien passer avec la clé épinglée dans le code', () => {
    // Toute signature étrangère est refusée contre la clé du dépôt, et cette clé
    // est bien une Ed25519 : une constante vide bloquerait les mises à jour, un
    // fichier mal formé aussi — les deux dans le sens sûr.
    expect(Buffer.from(UPDATE_SIGNING_PUBLIC_KEY, 'base64')).toHaveLength(32)
    expect(manifestSignatureValid(manifest, sign(manifest), UPDATE_SIGNING_PUBLIC_KEY)).toBe(false)
    expect(manifestSignatureValid(manifest, sign(manifest), '')).toBe(false)
  })
})
