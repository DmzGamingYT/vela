import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CUSTOM_ACCENT,
  PAPER,
  THEME_PRESETS,
  adjustAccent,
  appearanceTokens,
  contrast,
  parseHex,
  presetById,
  resolveMode,
  resolveThemeId,
  sanitizeAppearance,
  type ResolvedMode,
  type ThemeId
} from './theme'

const MODES: ResolvedMode[] = ['light', 'dark']

describe('parseHex', () => {
  it('accepte trois ou six chiffres, avec ou sans dièse', () => {
    expect(parseHex('#ABC')).toBe('#aabbcc')
    expect(parseHex('5B5BD6')).toBe('#5b5bd6')
  })

  it('refuse le reste', () => {
    expect(parseHex('rouge')).toBeNull()
    expect(parseHex('#12345')).toBeNull()
    expect(parseHex('')).toBeNull()
  })
})

describe('contrastes des 10 thèmes × 2 modes', () => {
  for (const preset of THEME_PRESETS) {
    for (const mode of MODES) {
      it(`${preset.label} en ${mode}`, () => {
        const tokens = appearanceTokens({
          themeId: preset.id,
          customAccent: DEFAULT_CUSTOM_ACCENT,
          mode,
          glass: 'normal',
          highContrast: false
        })
        const paper = PAPER[mode]

        // Texte d'accent (liens, libellés) sur le fond de page.
        expect(contrast(tokens['--link'], paper)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(tokens['--accent-label'], paper)).toBeGreaterThanOrEqual(3)
        // Texte posé sur un bouton plein.
        expect(contrast(tokens['--accent-contrast'], tokens['--accent'])).toBeGreaterThanOrEqual(4.5)
        // L'anneau de focus reste visible.
        expect(contrast(tokens['--accent-label'], paper)).toBeGreaterThanOrEqual(3)
      })
    }
  }
})

describe('couleur personnalisée', () => {
  it('assombrit une couleur trop claire en mode clair et l’explique', () => {
    const result = adjustAccent('#FFF3B0', 'light')
    expect(result.adjusted).toBe(true)
    expect(contrast(result.color, PAPER.light)).toBeGreaterThanOrEqual(3)
    expect(result.reason).toContain('assombrie')
  })

  it('conserve une couleur déjà lisible', () => {
    const result = adjustAccent('#3F3FB0', 'light')
    expect(result.adjusted).toBe(false)
    expect(result.color).toBe('#3f3fb0')
  })

  it('revient à l’indigo si la valeur est invalide', () => {
    const result = adjustAccent('pas une couleur', 'dark')
    expect(result.color).toBe(DEFAULT_CUSTOM_ACCENT)
    expect(result.adjusted).toBe(true)
  })

  it('produit les mêmes jetons qu’un thème fourni', () => {
    const tokens = appearanceTokens({
      themeId: 'custom',
      customAccent: '#C2410C',
      mode: 'dark',
      glass: 'normal',
      highContrast: false
    })
    expect(tokens['--accent']).toBe('#c2410c')
    expect(tokens['--glow']).toBe('194, 65, 12')
  })
})

describe('résolution du mode', () => {
  it('suit le système', () => {
    expect(resolveMode('system', { systemDark: true })).toBe('dark')
    expect(resolveMode('system', { systemDark: false })).toBe('light')
  })

  it('garde le choix explicite', () => {
    expect(resolveMode('dark', { systemDark: false })).toBe('dark')
  })

  it('bascule selon l’heure quand l’option est active', () => {
    expect(resolveMode('dark', { hourTheme: true, hour: 10 })).toBe('light')
    expect(resolveMode('light', { hourTheme: true, hour: 21 })).toBe('dark')
    expect(resolveMode('light', { hourTheme: true, hour: 6 })).toBe('dark')
  })
})

describe('thème par espace', () => {
  const global: ThemeId = 'indigo'

  it('garde le thème global si l’option est désactivée', () => {
    expect(resolveThemeId({ globalTheme: global, perSpace: false, spaceTheme: 'rouge' })).toBe('indigo')
  })

  it('utilise le thème de l’espace quand l’option est active', () => {
    expect(resolveThemeId({ globalTheme: global, perSpace: true, spaceTheme: 'rouge' })).toBe('rouge')
  })

  it('retombe sur le global quand l’espace n’a pas de thème', () => {
    expect(resolveThemeId({ globalTheme: global, perSpace: true, spaceTheme: null })).toBe('indigo')
  })
})

describe('persistance des réglages', () => {
  it('assainit des valeurs inconnues sans perdre le reste', () => {
    const clean = sanitizeAppearance({
      themeId: 'chartreuse' as never,
      customAccent: 'rouge',
      glass: 'énorme' as never,
      homeBackground: 'image',
      homeImage: '/Users/alex/Images/fond.png',
      homeBlur: 999,
      highContrast: true,
      hourTheme: 'oui' as never,
      perSpaceThemes: true
    })
    expect(clean.themeId).toBe('indigo')
    expect(clean.customAccent).toBe(DEFAULT_CUSTOM_ACCENT)
    expect(clean.glass).toBe('normal')
    expect(clean.homeBackground).toBe('image')
    expect(clean.homeImage).toBe('/Users/alex/Images/fond.png')
    expect(clean.homeBlur).toBe(18)
    expect(clean.highContrast).toBe(true)
    expect(clean.hourTheme).toBe(false)
    expect(clean.perSpaceThemes).toBe(true)
  })

  it('est idempotent (relire ce qui a été écrit donne la même chose)', () => {
    const once = sanitizeAppearance({
      themeId: 'ambre',
      customAccent: '#C2410C',
      glass: 'strong',
      homeBackground: 'plain',
      homeImage: null,
      homeBlur: 6,
      highContrast: false,
      hourTheme: true,
      perSpaceThemes: false
    })
    expect(sanitizeAppearance(once)).toEqual(once)
  })

  it('refuse un chemin d’image démesuré', () => {
    expect(sanitizeAppearance({ homeImage: `data:image/png;base64,${'a'.repeat(4000)}` }).homeImage).toBeNull()
  })
})

describe('jetons', () => {
  it('ne laisse aucun indigo quand on choisit rouge', () => {
    const tokens = appearanceTokens({
      themeId: 'rouge',
      customAccent: DEFAULT_CUSTOM_ACCENT,
      mode: 'light',
      glass: 'normal',
      highContrast: false
    })
    expect(tokens['--accent'].toLowerCase()).not.toBe(presetById('indigo')?.light.toLowerCase())
    expect(tokens['--accent-a'].toLowerCase()).not.toBe('#8f8aff')
  })

  it('renforce les surfaces en contraste élevé', () => {
    const normal = appearanceTokens({
      themeId: 'indigo',
      customAccent: DEFAULT_CUSTOM_ACCENT,
      mode: 'dark',
      glass: 'normal',
      highContrast: false
    })
    const high = appearanceTokens({
      themeId: 'indigo',
      customAccent: DEFAULT_CUSTOM_ACCENT,
      mode: 'dark',
      glass: 'normal',
      highContrast: true
    })
    expect(high['--surface']).toContain('1.000')
    expect(normal['--surface']).not.toBe(high['--surface'])
  })
})
