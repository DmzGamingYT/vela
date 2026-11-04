import { describe, expect, it } from 'vitest'
import {
  AMBIENCE_PRESETS,
  DEFAULT_CUSTOM_ACCENT,
  DEFAULT_GLASS_BLUR,
  GLASS_BLUR,
  PAPER,
  THEME_PRESETS,
  adjustAccent,
  ambienceColors,
  appearanceTokens,
  contrast,
  isAmbienceId,
  parseHex,
  presetById,
  resolveMode,
  resolveThemeId,
  sanitizeAppearance,
  sanitizeGlassBlur,
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

describe('ambiances animées', () => {
  it('propose huit ambiances aux identifiants uniques et aux teintes valides', () => {
    expect(AMBIENCE_PRESETS).toHaveLength(8)
    expect(new Set(AMBIENCE_PRESETS.map((preset) => preset.id)).size).toBe(8)
    for (const preset of AMBIENCE_PRESETS) {
      expect(isAmbienceId(preset.id)).toBe(true)
      for (const color of [...preset.light, ...preset.dark]) {
        expect(parseHex(color)).not.toBeNull()
      }
    }
  })

  it('donne deux teintes par mode, sans jamais vider le repli', () => {
    const preset = AMBIENCE_PRESETS[0]
    expect(ambienceColors(preset, 'light')).toEqual(preset.light)
    expect(ambienceColors(preset, 'dark')).toEqual(preset.dark)
  })

  it('assainit une ambiance inconnue et borne le verre', () => {
    expect(sanitizeAppearance({ ambience: 'aurore' as never }).ambience).toBe('none')
    expect(sanitizeAppearance({ ambience: 'voie-lactee' }).ambience).toBe('voie-lactee')
    expect(sanitizeAppearance({ glassBlur: 96 }).glassBlur).toBe(40)
    expect(sanitizeAppearance({ glassBlur: -4 }).glassBlur).toBe(0)
    expect(sanitizeGlassBlur(Number.NaN, 12)).toBe(12)
    // Un fichier d’avant le curseur retrouve le flou de son cran.
    expect(sanitizeAppearance({ glass: 'strong' }).glassBlur).toBe(GLASS_BLUR.strong)
    expect(sanitizeAppearance({}).glassBlur).toBe(DEFAULT_GLASS_BLUR)
  })

  it('pose les teintes de l’ambiance et le flou du verre dans les jetons', () => {
    const tokens = appearanceTokens({
      themeId: 'indigo',
      customAccent: DEFAULT_CUSTOM_ACCENT,
      mode: 'dark',
      glass: 'normal',
      highContrast: false,
      ambience: 'cyber-neon',
      glassBlur: 26
    })
    expect(tokens['--amb-1']).toBe(AMBIENCE_PRESETS[6].dark[0])
    expect(tokens['--amb-2']).toBe(AMBIENCE_PRESETS[6].dark[1])
    expect(tokens['--glass-blur']).toBe('26px')
    expect(tokens['--amb-rgb']).toMatch(/^\d+, \d+, \d+$/)
  })

  it('garde l’accent intact quand une ambiance est choisie', () => {
    const plain = appearanceTokens({
      themeId: 'vert',
      customAccent: DEFAULT_CUSTOM_ACCENT,
      mode: 'light',
      glass: 'normal',
      highContrast: false
    })
    const themed = appearanceTokens({
      themeId: 'vert',
      customAccent: DEFAULT_CUSTOM_ACCENT,
      mode: 'light',
      glass: 'normal',
      highContrast: false,
      ambience: 'reve-etolie'
    })
    expect(themed['--accent']).toBe(plain['--accent'])
    expect(themed['--amb-1']).not.toBe(plain['--amb-1'])
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
