import { describe, expect, it } from 'vitest'
import { digestEquals, sha512Base64, verifyDownload } from './integrity'
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
    expect(verifyDownload({ base64, bytes: data.length, expected: { sha512: base64, size: data.length } })).toBe(true)
  })

  it('rejette une taille différente ou une empreinte remplacée', () => {
    const data = Buffer.from('installateur')
    const base64 = sha512Base64(data)
    expect(verifyDownload({ base64, bytes: data.length + 1, expected: { sha512: base64, size: data.length } })).toBe(false)
    const other = sha512Base64(Buffer.from('autre'))
    expect(verifyDownload({ base64, bytes: data.length, expected: { sha512: other, size: data.length } })).toBe(false)
    expect(digestEquals('', '')).toBe(false)
  })
})
