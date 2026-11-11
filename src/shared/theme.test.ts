import { describe, expect, it } from 'vitest'
import {
  ACCENT_THEMES,
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
  resolveAccent,
  resolveMode,
  resolveMotion,
  resolveThemeId,
  sanitizeAmbienceIntensity,
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

describe('contrastes des 10 couleurs et de Braise, × 2 modes', () => {
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
        const paper = tokens['--paper']

        // Texte d'accent (liens, libellés) sur le fond de page.
        expect(contrast(tokens['--link'], paper)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(tokens['--accent-label'], paper)).toBeGreaterThanOrEqual(4.5)
        // Texte posé sur un bouton plein.
        expect(contrast(tokens['--accent-contrast'], tokens['--accent'])).toBeGreaterThanOrEqual(
          4.5
        )
        // L'anneau de focus et la bordure de sélection restent visibles.
        expect(contrast(tokens['--accent-label'], paper)).toBeGreaterThanOrEqual(4.5)
      })
    }
  }
})

/* Compose une couleur `rgba(...)` sur un fond opaque, puis renvoie le hex. */
function composeOver(color: string, backdrop: string): string {
  const match = color.match(/rgba?\(([^)]+)\)/)
  if (!match) return color
  const parts = match[1].split(',').map((part) => Number(part.trim()))
  const [r, g, b] = parts
  const alpha = Math.max(0, Math.min(1, parts[3] ?? 1))
  const base = hexToRgbLocal(backdrop)
  const clamp = (value: number): string =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, '0')
  return `#${clamp(r * alpha + base.r * (1 - alpha))}${clamp(g * alpha + base.g * (1 - alpha))}${clamp(
    b * alpha + base.b * (1 - alpha)
  )}`
}

function hexToRgbLocal(hex: string): { r: number; g: number; b: number } {
  const clean = (parseHex(hex) ?? '#000000').slice(1)
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  }
}

/* Le wordmark de la barre latérale : encre pleine + point d'accent, posés sur
   le verre de la barre (lui-même sur le papier), avec le reflet blanc du haut. */
describe('contraste du wordmark dans la barre latérale', () => {
  for (const preset of THEME_PRESETS) {
    for (const mode of MODES) {
      for (const ambience of [{ id: 'none' as const }, ...AMBIENCE_PRESETS]) {
        it(`${preset.label} en ${mode}, ambiance ${ambience.id}`, () => {
          const tokens = appearanceTokens({
            themeId: preset.id,
            customAccent: DEFAULT_CUSTOM_ACCENT,
            mode,
            glass: 'normal',
            highContrast: false,
            ambience: ambience.id
          })
          const glass = composeOver(tokens['--glass'], tokens['--paper'])
          const background = composeOver('rgba(255, 255, 255, 0.05)', glass)

          expect(contrast(tokens['--ink'], background)).toBeGreaterThanOrEqual(4.5)
          expect(contrast(tokens['--wordmark-accent'], background)).toBeGreaterThanOrEqual(4.5)
        })
      }
    }
  }
})

describe('couleur personnalisée', () => {
  it('assombrit une couleur trop claire en mode clair et l’explique', () => {
    const result = adjustAccent('#FFF3B0', 'light')
    expect(result.adjusted).toBe(true)
    expect(contrast(result.color, PAPER.light)).toBeGreaterThanOrEqual(4.5)
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
    // Une teinte déjà lisible en mode sombre : elle n’est pas corrigée.
    const tokens = appearanceTokens({
      themeId: 'custom',
      customAccent: '#FF7A59',
      mode: 'dark',
      glass: 'normal',
      highContrast: false
    })
    expect(tokens['--accent']).toBe('#ff7a59')
    expect(tokens['--glow']).toBe('255, 122, 89')
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
    expect(resolveThemeId({ globalTheme: global, perSpace: false, spaceTheme: 'rouge' })).toBe(
      'indigo'
    )
  })

  it('utilise le thème de l’espace quand l’option est active', () => {
    expect(resolveThemeId({ globalTheme: global, perSpace: true, spaceTheme: 'rouge' })).toBe(
      'rouge'
    )
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
    expect(
      sanitizeAppearance({ homeImage: `data:image/png;base64,${'a'.repeat(4000)}` }).homeImage
    ).toBeNull()
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
    // Portée et présence : « toute la page » par défaut, bornes 0–100.
    expect(sanitizeAppearance({}).ambienceScope).toBe('page')
    expect(sanitizeAppearance({ ambienceScope: 'autre' as never }).ambienceScope).toBe('page')
    expect(sanitizeAppearance({ ambienceScope: 'chrome' }).ambienceScope).toBe('chrome')
    expect(sanitizeAppearance({}).ambienceIntensity).toBe(80)
    expect(sanitizeAppearance({ ambienceIntensity: 240 }).ambienceIntensity).toBe(100)
    expect(sanitizeAppearance({ ambienceIntensity: -6 }).ambienceIntensity).toBe(0)
    expect(sanitizeAmbienceIntensity(Number.NaN)).toBe(80)
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
      ambienceIntensity: 42,
      glassBlur: 26
    })
    expect(tokens['--amb-1']).toBe(AMBIENCE_PRESETS[6].dark[0])
    expect(tokens['--amb-2']).toBe(AMBIENCE_PRESETS[6].dark[1])
    expect(tokens['--amb-opacity']).toBe('0.42')
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

describe('grille des couleurs', () => {
  it('propose dix thèmes, Braise restant le thème du ciel', () => {
    expect(ACCENT_THEMES).toHaveLength(10)
    expect(ACCENT_THEMES.some((preset) => preset.id === 'braise')).toBe(false)
  })
})

describe('thème automatique par heures', () => {
  it('suit les heures choisies', () => {
    expect(resolveMode('dark', { hourTheme: true, hour: 6, hourStart: 8, hourEnd: 18 })).toBe(
      'dark'
    )
    expect(resolveMode('dark', { hourTheme: true, hour: 8, hourStart: 8, hourEnd: 18 })).toBe(
      'light'
    )
    expect(resolveMode('light', { hourTheme: true, hour: 17, hourStart: 8, hourEnd: 18 })).toBe(
      'light'
    )
    expect(resolveMode('light', { hourTheme: true, hour: 18, hourStart: 8, hourEnd: 18 })).toBe(
      'dark'
    )
  })

  it('gère une plage qui passe minuit', () => {
    expect(resolveMode('dark', { hourTheme: true, hour: 23, hourStart: 22, hourEnd: 6 })).toBe(
      'light'
    )
    expect(resolveMode('light', { hourTheme: true, hour: 12, hourStart: 22, hourEnd: 6 })).toBe(
      'dark'
    )
  })

  it('retombe sur 7 h – 19 h sans réglage', () => {
    expect(resolveMode('dark', { hourTheme: true, hour: 7 })).toBe('light')
    expect(resolveMode('light', { hourTheme: true, hour: 19 })).toBe('dark')
  })
})

describe('mouvement réduit', () => {
  it('suit le système, ou force le choix', () => {
    expect(resolveMotion('system', true)).toBe(true)
    expect(resolveMotion('system', false)).toBe(false)
    expect(resolveMotion('reduce', false)).toBe(true)
    expect(resolveMotion('full', true)).toBe(false)
  })
})

describe('migration de l’apparence 0.3.24', () => {
  it('convertit la case ciel en fond, une seule fois', () => {
    const legacy = sanitizeAppearance({
      themeId: 'braise',
      homeBackground: 'gradient',
      dragonSky: true,
      skyVariant: 'westeros'
    } as never)
    expect(legacy.homeBackground).toBe('sky')
    expect(legacy.skyVariant).toBe('nuit-etoilee')
    expect(sanitizeAppearance(legacy)).toEqual(legacy)
  })

  it('ne rallume pas le ciel après un retour au dégradé', () => {
    const migrated = sanitizeAppearance({ themeId: 'braise', homeBackground: 'gradient' } as never)
    expect(migrated.homeBackground).toBe('sky')
    const back = sanitizeAppearance({
      ...migrated,
      homeBackground: 'gradient',
      dragonSky: true
    } as never)
    expect(back.homeBackground).toBe('gradient')
  })

  it('laisse le ciel éteint s’il l’était', () => {
    const off = sanitizeAppearance({
      themeId: 'braise',
      homeBackground: 'gradient',
      dragonSky: false
    } as never)
    expect(off.homeBackground).toBe('gradient')
  })

  it('garde les réglages d’interface et borne les heures', () => {
    const clean = sanitizeAppearance({
      density: 'airy',
      textSize: 'large',
      sidebarSide: 'right',
      reduceMotion: 'reduce',
      hourTheme: true,
      hourStart: 21,
      hourEnd: 8
    })
    expect(clean.density).toBe('airy')
    expect(clean.textSize).toBe('large')
    expect(clean.sidebarSide).toBe('right')
    expect(clean.reduceMotion).toBe('reduce')
    expect(clean.hourStart).toBe(21)
    expect(clean.hourEnd).toBe(8)
    expect(sanitizeAppearance({ hourStart: 30, hourEnd: 99 }).hourStart).toBe(7)
    expect(sanitizeAppearance({ hourStart: 7, hourEnd: 7 }).hourEnd).toBe(19)
  })

  it('refuse une variante de ciel inconnue', () => {
    expect(sanitizeAppearance({ skyVariant: 'aurore' as never }).skyVariant).toBe('braise')
  })
})

/* Les palettes de la tranche 77 : chaque thème a son papier, son encre et son
   lavis. Ces tests tiennent les deux promesses : distincts, et lisibles. */
describe('palettes de thème', () => {
  it('donne à chaque thème un papier et un lavis qui lui sont propres', () => {
    const papers = THEME_PRESETS.map(
      (preset) => `${preset.palette.light.paper}/${preset.palette.dark.paper}`
    )
    expect(new Set(papers).size).toBe(THEME_PRESETS.length)
    const washes = THEME_PRESETS.map((preset) => preset.palette.wash.light.join())
    expect(new Set(washes).size).toBe(THEME_PRESETS.length)
  })

  for (const preset of THEME_PRESETS) {
    for (const mode of MODES) {
      it(`${preset.label} en ${mode} : des neutres lisibles`, () => {
        const tokens = appearanceTokens({
          themeId: preset.id,
          customAccent: DEFAULT_CUSTOM_ACCENT,
          mode,
          glass: 'normal',
          highContrast: false
        })
        const paper = tokens['--paper']
        // L'encre de lecture, pas seulement le minimum légal.
        expect(contrast(tokens['--ink'], paper)).toBeGreaterThanOrEqual(7)
        // Les gris qui portent du texte réel.
        expect(contrast(composeOver(tokens['--muted'], paper), paper)).toBeGreaterThanOrEqual(5)
        // Les micro-libellés décoratifs : plancher de 4:1 (la tranche 76 a
        // remonté à 74 % d'encre ceux qui portent du sens).
        expect(contrast(composeOver(tokens['--faint'], paper), paper)).toBeGreaterThanOrEqual(4)
        // Le lavis vient bien de la palette, pas de l'accent.
        expect(tokens['--wash-1']).toBe(preset.palette.wash[mode][0])
        expect(tokens['--paper-deep']).toBe(preset.palette[mode].deep)
      })
    }
  }
})

/* Un accent libre se pose sur n'importe quel thème sans en changer la
   lumière : papier, surface profonde et lavis viennent toujours de la palette,
   et l'accent est corrigé contre le papier du thème, pas contre un neutre. */
describe('accent libre sur chaque thème', () => {
  // Les onze teintes du produit, plus les cas qui cassent un moteur naïf :
  // un jaune pâle, un quasi-noir, du blanc pur et un magenta saturé.
  const ACCENTS = [
    '#5b5bd6',
    '#e5484d',
    '#f76b15',
    '#e5a100',
    '#30a46c',
    '#12a594',
    '#0091ff',
    '#8e4ec6',
    '#e93d82',
    '#6e6e73',
    '#b4451f',
    '#fff3b0',
    '#0b0b0b',
    '#ffffff',
    '#ff00aa'
  ]

  const custom = (
    themeId: ThemeId,
    customAccent: string,
    mode: ResolvedMode
  ): ReturnType<typeof appearanceTokens> =>
    appearanceTokens({
      themeId,
      customAccent,
      accentOverride: true,
      mode,
      glass: 'normal',
      highContrast: false
    })

  for (const preset of THEME_PRESETS) {
    for (const mode of MODES) {
      it(`${preset.label} en ${mode} : l'accent libre laisse la palette intacte`, () => {
        for (const accent of ACCENTS) {
          const tokens = custom(preset.id, accent, mode)
          expect(tokens['--paper']).toBe(preset.palette[mode].paper)
          expect(tokens['--paper-deep']).toBe(preset.palette[mode].deep)
          expect(tokens['--ink']).toBe(preset.palette[mode].ink)
          expect(tokens['--wash-1']).toBe(preset.palette.wash[mode][0])
          expect(tokens['--wash-2']).toBe(preset.palette.wash[mode][1])
        }
      })

      it(`${preset.label} en ${mode} : chaque accent reste lisible sur ce papier`, () => {
        for (const accent of ACCENTS) {
          const tokens = custom(preset.id, accent, mode)
          const paper = tokens['--paper']
          expect(contrast(tokens['--accent-label'], paper)).toBeGreaterThanOrEqual(4.5)
          expect(contrast(tokens['--link'], paper)).toBeGreaterThanOrEqual(4.5)
          // Le texte posé sur l'aplat d'accent (boutons pleins) suit la même règle.
          expect(contrast(tokens['--accent-contrast'], tokens['--accent'])).toBeGreaterThanOrEqual(
            4.5
          )
        }
      })
    }
  }

  it('applique la teinte demandée, pas celle du thème', () => {
    const magenta = custom('vert', '#ff00aa', 'light')
    const cyan = custom('vert', '#00aaff', 'light')
    expect(magenta['--accent']).not.toBe(presetById('vert')?.light)
    expect(magenta['--accent']).not.toBe(cyan['--accent'])
  })

  it('laisse le thème intact quand l’accent libre est désactivé', () => {
    const themed = appearanceTokens({
      themeId: 'vert',
      customAccent: '#ff00aa',
      accentOverride: false,
      mode: 'light',
      glass: 'normal',
      highContrast: false
    })
    const plain = appearanceTokens({
      themeId: 'vert',
      customAccent: DEFAULT_CUSTOM_ACCENT,
      mode: 'light',
      glass: 'normal',
      highContrast: false
    })
    expect(themed['--accent']).toBe(plain['--accent'])
    expect(themed['--wash-1']).toBe(plain['--wash-1'])
  })

  it('corrige un accent trop clair contre le papier du thème', () => {
    const adjusted = adjustAccent('#fff3b0', 'light', '#f7faf5')
    expect(adjusted.adjusted).toBe(true)
    expect(contrast(adjusted.color, '#f7faf5')).toBeGreaterThanOrEqual(4.5)
  })
})

/* Un accent par espace suit le même contrat qu'un accent libre : il change la
   teinte, jamais le papier ni le lavis du thème de l'espace. */
describe('accent par espace', () => {
  const ACCENTS = [
    '#5b5bd6',
    '#e5484d',
    '#f76b15',
    '#e5a100',
    '#30a46c',
    '#12a594',
    '#0091ff',
    '#8e4ec6',
    '#e93d82',
    '#6e6e73',
    '#b4451f',
    '#fff3b0',
    '#0b0b0b',
    '#ffffff',
    '#ff00aa'
  ]

  it('suit la teinte de l’espace quand l’option est active', () => {
    expect(
      resolveAccent({ globalAccent: '#5b5bd6', perSpace: true, spaceAccent: '#E5484D' })
    ).toEqual({ customAccent: '#e5484d', accentOverride: true })
  })

  it('garde l’accent global sans option, sans teinte d’espace ou si elle est illisible', () => {
    expect(
      resolveAccent({ globalAccent: '#5b5bd6', perSpace: false, spaceAccent: '#e5484d' })
    ).toEqual({ customAccent: '#5b5bd6', accentOverride: false })
    expect(resolveAccent({ globalAccent: '#5b5bd6', perSpace: true, spaceAccent: null })).toEqual({
      customAccent: '#5b5bd6',
      accentOverride: false
    })
    expect(
      resolveAccent({ globalAccent: '#5b5bd6', perSpace: true, spaceAccent: 'rouge' })
    ).toEqual({ customAccent: '#5b5bd6', accentOverride: false })
  })

  it('conserve le remplacement global quand aucun espace ne le supplante', () => {
    expect(
      resolveAccent({
        globalAccent: '#e93d82',
        globalOverride: true,
        perSpace: true,
        spaceAccent: null
      })
    ).toEqual({ customAccent: '#e93d82', accentOverride: true })
  })

  for (const preset of THEME_PRESETS) {
    for (const mode of MODES) {
      it(`${preset.label} en ${mode} : l’accent d’espace ne touche pas la palette`, () => {
        for (const accent of ACCENTS) {
          const resolved = resolveAccent({
            globalAccent: DEFAULT_CUSTOM_ACCENT,
            perSpace: true,
            spaceAccent: accent
          })
          const tokens = appearanceTokens({
            themeId: preset.id,
            ...resolved,
            mode,
            glass: 'normal',
            highContrast: false
          })
          expect(tokens['--paper']).toBe(preset.palette[mode].paper)
          expect(tokens['--paper-deep']).toBe(preset.palette[mode].deep)
          expect(tokens['--ink']).toBe(preset.palette[mode].ink)
          expect(tokens['--wash-1']).toBe(preset.palette.wash[mode][0])
          expect(tokens['--wash-2']).toBe(preset.palette.wash[mode][1])
          expect(contrast(tokens['--accent-label'], tokens['--paper'])).toBeGreaterThanOrEqual(4.5)
          expect(contrast(tokens['--accent-contrast'], tokens['--accent'])).toBeGreaterThanOrEqual(
            4.5
          )
        }
      })
    }
  }
})
