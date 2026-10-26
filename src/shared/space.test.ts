import { describe, expect, it } from 'vitest'
import {
  MAX_AVATAR_LENGTH,
  MAX_SHORTCUTS,
  SPACE_AVATARS,
  SPACE_BACKGROUNDS,
  SPACE_PRESETS,
  avatarIcon,
  avatarImage,
  isSpaceBackground,
  sanitizeSpaceAvatar,
  sanitizeSpaceBackground,
  sanitizeSpaceShortcuts,
  shortcutsForSet,
  suggestShortcutSet
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

describe('sites épinglés', () => {
  it('normalise une adresse sans schéma et retire les doublons', () => {
    const list = sanitizeSpaceShortcuts([
      { url: 'notion.so' },
      { url: 'https://notion.so/' },
      { url: 'https://github.com/vela', title: '  Vela  ' }
    ])
    expect(list).toHaveLength(2)
    expect(list[0].url).toBe('https://notion.so/')
    expect(list[0].title).toBe('notion.so')
    expect(list[1].title).toBe('Vela')
    expect(new Set(list.map((item) => item.id)).size).toBe(2)
  })

  it('refuse les schémas dangereux et les entrées cassées', () => {
    const list = sanitizeSpaceShortcuts([
      { url: 'javascript:alert(1)' },
      { url: 'file:///etc/passwd' },
      { url: 'https://localhost' },
      { url: 42 },
      null,
      { url: 'https://exemple.fr' }
    ])
    expect(list.map((item) => item.url)).toEqual(['https://exemple.fr/'])
  })

  it('borne la longueur de la barre', () => {
    const many = Array.from({ length: MAX_SHORTCUTS + 5 }, (_, index) => ({ url: `site${index}.fr` }))
    expect(sanitizeSpaceShortcuts(many)).toHaveLength(MAX_SHORTCUTS)
    expect(sanitizeSpaceShortcuts('nope')).toEqual([])
  })

  it('chaque modèle livre une barre valide et propre à son usage', () => {
    for (const preset of SPACE_PRESETS) {
      const shortcuts = shortcutsForSet(preset.id)
      expect(shortcuts.length).toBeGreaterThan(0)
      // Sans doublon à l'intérieur d'une même barre.
      expect(shortcuts).toEqual(sanitizeSpaceShortcuts(shortcuts))
      expect(new Set(shortcuts.map((item) => item.url)).size).toBe(shortcuts.length)
    }
    expect(shortcutsForSet('inconnu')).toEqual([])
  })

  it('reconnaît le type d’espace d’après son nom, accents compris', () => {
    expect(suggestShortcutSet('Travail')).toBe('work')
    expect(suggestShortcutSet('Études 2026')).toBe('study')
    expect(suggestShortcutSet('Gaming')).toBe('gaming')
    expect(suggestShortcutSet('Développement')).toBe('dev')
    expect(suggestShortcutSet('Jardinage')).toBeNull()
  })
})
