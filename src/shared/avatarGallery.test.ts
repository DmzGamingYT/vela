import { describe, expect, it } from 'vitest'
import { GALLERY_AVATARS, galleryAvatar } from './avatarGallery'
import { avatarFile, avatarGalleryId, sanitizeSpaceAvatar } from './space'

describe('galerie d’avatars', () => {
  it('propose au moins vingt-quatre avatars tous différents', () => {
    expect(GALLERY_AVATARS.length).toBeGreaterThanOrEqual(24)
    expect(new Set(GALLERY_AVATARS.map((entry) => entry.id)).size).toBe(GALLERY_AVATARS.length)
    expect(new Set(GALLERY_AVATARS.map((entry) => entry.label)).size).toBe(GALLERY_AVATARS.length)
  })

  it('décrit chaque avatar avec des couleurs valides et un dessin', () => {
    for (const entry of GALLERY_AVATARS) {
      expect(entry.from).toMatch(/^#[0-9a-f]{6}$/i)
      expect(entry.to).toMatch(/^#[0-9a-f]{6}$/i)
      expect(entry.ink).toMatch(/^#[0-9a-f]{6}$/i)
      expect(entry.shapes.length).toBeGreaterThan(0)
      for (const shape of entry.shapes) {
        if (shape.kind === 'path') expect(shape.d.length).toBeGreaterThan(4)
        if (shape.kind === 'circle') expect(shape.r).toBeGreaterThan(0)
        if (shape.kind === 'rect') {
          expect(shape.w).toBeGreaterThan(0)
          expect(shape.h).toBeGreaterThan(0)
        }
      }
    }
  })

  it('compte quatre variantes à initiales', () => {
    expect(GALLERY_AVATARS.filter((entry) => entry.initial).length).toBeGreaterThanOrEqual(4)
  })

  it('accepte chaque avatar de la galerie comme avatar d’espace', () => {
    for (const entry of GALLERY_AVATARS) {
      expect(sanitizeSpaceAvatar(`gallery:${entry.id}`)).toBe(`gallery:${entry.id}`)
      expect(avatarGalleryId(`gallery:${entry.id}`)).toBe(entry.id)
    }
  })

  it('refuse un identifiant de galerie inconnu', () => {
    expect(sanitizeSpaceAvatar('gallery:licorne')).toBeNull()
    expect(galleryAvatar('licorne')).toBeNull()
    expect(avatarGalleryId('icon:spark')).toBeNull()
  })
})

describe('photos d’avatar sur disque', () => {
  it('accepte un nom de fichier d’avatar produit par l’app', () => {
    const name = '0123456789abcdef01234567.jpg'
    expect(sanitizeSpaceAvatar(`image:file:${name}`)).toBe(`image:file:${name}`)
    expect(avatarFile(`image:file:${name}`)).toBe(name)
  })

  it('refuse un chemin, une extension inconnue ou un nom trop court', () => {
    expect(sanitizeSpaceAvatar('image:file:../secret.jpg')).toBeNull()
    expect(sanitizeSpaceAvatar('image:file:0123456789abcdef01234567.svg')).toBeNull()
    expect(sanitizeSpaceAvatar('image:file:abc.jpg')).toBeNull()
    expect(avatarFile('image:data:image/png;base64,AAAA')).toBeNull()
  })
})
