import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { avatarDir, pruneAvatars, readAvatarDataUrl, saveAvatarDataUrl } from './avatars'

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vela-avatars-'))
  dirs.push(dir)
  return dir
}

function dataUrl(bytes: Buffer, mime = 'image/jpeg'): string {
  return `image:data:${mime};base64,${bytes.toString('base64')}`
}

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  dirs.length = 0
})

describe('photos d’avatar', () => {
  it('écrit la photo et renvoie une référence de fichier', () => {
    const dir = tempDir()
    const reference = saveAvatarDataUrl(dir, dataUrl(Buffer.from('une-photo-jpeg')))
    expect(reference).toMatch(/^image:file:[a-f0-9]{24}\.jpg$/)
    const name = reference?.slice(11) as string
    expect(existsSync(join(avatarDir(dir), name))).toBe(true)
    expect(readAvatarDataUrl(dir, name)).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('partage le même fichier pour une photo identique', () => {
    const dir = tempDir()
    const bytes = Buffer.from('meme-photo')
    const first = saveAvatarDataUrl(dir, dataUrl(bytes))
    const second = saveAvatarDataUrl(dir, dataUrl(bytes))
    expect(first).toBe(second)
    expect(readdirSync(avatarDir(dir))).toHaveLength(1)
  })

  it('refuse un format inconnu, une chaîne vide ou une photo trop lourde', () => {
    const dir = tempDir()
    expect(saveAvatarDataUrl(dir, 'image:data:image/svg+xml;base64,AAAA')).toBeNull()
    expect(saveAvatarDataUrl(dir, 'image:data:image/png;base64,')).toBeNull()
    expect(saveAvatarDataUrl(dir, 'pas une image')).toBeNull()
    expect(saveAvatarDataUrl(dir, dataUrl(Buffer.alloc(600 * 1024)))).toBeNull()
    expect(existsSync(avatarDir(dir))).toBe(false)
  })

  it('refuse un nom de fichier hors du dossier', () => {
    const dir = tempDir()
    expect(readAvatarDataUrl(dir, '../vela.json')).toBeNull()
  })

  it('élague les photos que plus aucun espace ne référence', () => {
    const dir = tempDir()
    const kept = saveAvatarDataUrl(dir, dataUrl(Buffer.from('gardee')))?.slice(11) as string
    const orphan = saveAvatarDataUrl(dir, dataUrl(Buffer.from('orpheline')))?.slice(11) as string
    expect(pruneAvatars(dir, new Set([kept]))).toBe(1)
    expect(existsSync(join(avatarDir(dir), kept))).toBe(true)
    expect(existsSync(join(avatarDir(dir), orphan))).toBe(false)
  })
})
