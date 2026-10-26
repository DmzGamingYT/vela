import { describe, expect, it } from 'vitest'
import {
  MAX_AVATAR_LENGTH,
  SPACE_AVATARS,
  SPACE_BACKGROUNDS,
  SPACE_PRESETS,
  avatarIcon,
  avatarImage,
  isSpaceBackground,
  sanitizeSpaceAvatar,
  sanitizeSpaceBackground
} from './space'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('avatars d’espace', () => {
  it('accepte le monogramme et les marques connues', () => {
    expect(sanitizeSpaceAvatar('monogram')).toBe('monogram')
    expect(sanitizeSpaceAvatar('icon:leaf')).toBe('icon:leaf')
    for (const mark of SPACE_AVATARS) expect(sanitizeSpaceAvatar(`icon:${mark.id}`)).toBe(`icon:${mark.id}`)
  })

  it('refuse une marque inconnue, une URL distante ou du HTML', () => {
    expect(sanitizeSpaceAvatar('icon:inconnu')).toBeNull()
    expect(sanitizeSpaceAvatar('https://exemple.fr/photo.png')).toBeNull()
    expect(sanitizeSpaceAvatar('<svg onload="alert(1)">')).toBeNull()
    expect(sanitizeSpaceAvatar('data:image/png;base64,AAAA')).toBeNull()
    expect(sanitizeSpaceAvatar(null)).toBeNull()
  })

  it('accepte une image locale et la borne en taille', () => {
    expect(sanitizeSpaceAvatar(`image:${PNG}`)).toBe(`image:${PNG}`)
    expect(sanitizeSpaceAvatar('image:data:text/html;base64,PHNjcmlwdD4=')).toBeNull()
    const huge = `image:data:image/png;base64,${'A'.repeat(MAX_AVATAR_LENGTH)}`
    expect(sanitizeSpaceAvatar(huge)).toBeNull()
  })

  it('retrouve l’image et l’icône stockées', () => {
    expect(avatarImage(`image:${PNG}`)).toBe(PNG)
    expect(avatarImage('icon:leaf')).toBeNull()
    expect(avatarIcon('icon:leaf')?.label).toBe('Feuille')
    expect(avatarIcon('monogram')).toBeNull()
  })
})

describe('ambiances d’espace', () => {
  it('retombe sur « aucune » pour une valeur inconnue', () => {
    expect(sanitizeSpaceBackground('aurora')).toBe('aurora')
    expect(sanitizeSpaceBackground('fluo')).toBe('none')
    expect(sanitizeSpaceBackground(undefined)).toBe('none')
    expect(isSpaceBackground('night')).toBe(true)
    expect(isSpaceBackground('')).toBe(false)
  })

  it('les vignettes livrées sont cohérentes', () => {
    const ids = SPACE_BACKGROUNDS.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('none')
  })
})

describe('modèles d’espace', () => {
  it('chaque modèle produit un espace valide', () => {
    const seen = new Set<string>()
    for (const preset of SPACE_PRESETS) {
      expect(preset.id).not.toBe('')
      expect(seen.has(preset.id)).toBe(false)
      seen.add(preset.id)
      expect(preset.name.length).toBeGreaterThan(0)
      expect(preset.color).toMatch(/^#[0-9a-f]{6}$/i)
      expect(sanitizeSpaceAvatar(preset.avatar)).toBe(preset.avatar)
      expect(isSpaceBackground(preset.background)).toBe(true)
    }
  })

  it('couvre les usages proposés', () => {
    const labels = SPACE_PRESETS.map((preset) => preset.label)
    expect(labels).toEqual(expect.arrayContaining(['Travail', 'Vie personnelle', 'Gaming', 'Études']))
  })
})
