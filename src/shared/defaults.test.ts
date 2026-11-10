import { describe, expect, it } from 'vitest'
import { SPACE_TINTS, spaceTintFor } from './defaults'
import { SPACE_BACKGROUNDS } from './space'
import { THEME_PRESETS } from './theme'

/**
 * Le thème « Braise » et l'ambiance « Braise » portaient le même nom dans la
 * fenêtre d'espace. La teinte s'appelle désormais « Brique » : la couleur
 * stockée ne change pas, donc aucun espace existant ne perd sa teinte.
 */
describe('teintes d’espace', () => {
  it('renomme la teinte Braise en Brique sans toucher à sa couleur', () => {
    const braise = THEME_PRESETS.find((preset) => preset.id === 'braise')!
    const tint = SPACE_TINTS.find((entry) => entry.id === 'braise')!
    expect(tint.label).toBe('Brique')
    expect(tint.color).toBe(braise.light)
  })

  it('garde des noms distincts entre teintes et ambiances', () => {
    const labels = [
      ...SPACE_TINTS.map((tint) => tint.label),
      ...SPACE_BACKGROUNDS.map((item) => item.label)
    ]
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('retrouve une teinte à partir de la couleur stockée', () => {
    const tint = SPACE_TINTS[3]
    expect(spaceTintFor(tint.color.toUpperCase())).toEqual(tint)
    expect(spaceTintFor('#123456')).toBeNull()
  })
})
