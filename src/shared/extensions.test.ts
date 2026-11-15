import { describe, expect, it } from 'vitest'
import { EXTENSION_CATEGORIES, EXTENSION_SUGGESTIONS, storeUrl } from './extensions'

describe('catalogue d’extensions', () => {
  it('range chaque fiche dans une catégorie connue, sans doublon', () => {
    const categories = new Set(EXTENSION_CATEGORIES.map((entry) => entry.id))
    const ids = new Set<string>()
    for (const entry of EXTENSION_SUGGESTIONS) {
      expect(categories.has(entry.category)).toBe(true)
      expect(entry.name.trim().length).toBeGreaterThan(0)
      expect(entry.blurb.trim().length).toBeGreaterThan(0)
      expect(entry.query.trim().length).toBeGreaterThan(0)
      expect(ids.has(entry.id)).toBe(false)
      ids.add(entry.id)
    }
  })

  it('n’a aucune catégorie vide', () => {
    for (const category of EXTENSION_CATEGORIES) {
      expect(EXTENSION_SUGGESTIONS.some((entry) => entry.category === category.id)).toBe(true)
    }
  })

  it('construit une recherche Chrome Web Store encodée', () => {
    expect(storeUrl('uBlock Origin')).toBe(
      'https://chromewebstore.google.com/search/uBlock%20Origin'
    )
    expect(storeUrl('a/b?c')).toBe('https://chromewebstore.google.com/search/a%2Fb%3Fc')
  })
})
