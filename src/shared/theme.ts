/**
 * Thèmes de couleur de Vela.
 *
 * Un thème n'est pas une liste de couleurs par composant : c'est une seule
 * teinte d'accent dont on dérive tout le reste (survol, fond doux, texte sur
 * accent, verre, focus, sélection, liens). Une couleur personnalisée passe donc
 * par exactement la même logique que les thèmes fournis.
 *
 * Aucune dépendance à Electron ni à React : ce fichier est testable seul.
 */

export type ThemeId =
  | 'indigo'
  | 'rouge'
  | 'orange'
  | 'ambre'
  | 'vert'
  | 'turquoise'
  | 'bleu'
  | 'violet'
  | 'rose'
  | 'graphite'
  | 'braise'
  | 'custom'

export type ThemePresetId = Exclude<ThemeId, 'custom'>
export type GlassIntensity = 'light' | 'normal' | 'strong'
export type HomeBackground = 'gradient' | 'plain' | 'image'
export type ResolvedMode = 'light' | 'dark'

export interface ThemePreset {
  id: ThemePresetId
  label: string
  light: string
  dark: string
}

/** Les thèmes fournis, dans l'ordre de la grille des réglages. */
export const THEME_PRESETS: ThemePreset[] = [
  { id: 'indigo', label: 'Indigo', light: '#5B5BD6', dark: '#B3AEFF' },
  { id: 'rouge', label: 'Rouge', light: '#E5484D', dark: '#FF6369' },
  { id: 'orange', label: 'Orange', light: '#F76B15', dark: '#FF8B3E' },
  { id: 'ambre', label: 'Ambre', light: '#E5A100', dark: '#FFC53D' },
  { id: 'vert', label: 'Vert', light: '#30A46C', dark: '#3DD68C' },
  { id: 'turquoise', label: 'Turquoise', light: '#12A594', dark: '#0BD8B6' },
  { id: 'bleu', label: 'Bleu', light: '#0091FF', dark: '#52A9FF' },
  { id: 'violet', label: 'Violet', light: '#8E4EC6', dark: '#BF7AF0' },
  { id: 'rose', label: 'Rose', light: '#E93D82', dark: '#FF6BA7' },
  { id: 'graphite', label: 'Graphite', light: '#6E6E73', dark: '#A1A1A6' },
  // Braise : la teinte de l'ambiance dragons, seule à ouvrir une animation
  // (ciel parcouru et lueur sur les cases du rail).
  { id: 'braise', label: 'Braise', light: '#B4451F', dark: '#FF8F5E' }
]

/** Le thème qui porte l'animation des dragons. */
export const DRAGON_THEME: ThemePresetId = 'braise'

export const DEFAULT_THEME: ThemePresetId = 'indigo'
export const DEFAULT_CUSTOM_ACCENT = '#5B5BD6'

/** Fonds de page, alignés sur les neutres chauds de styles.css. */
export const PAPER: Record<ResolvedMode, string> = {
  light: '#faf8f5',
  dark: '#151518'
}

export const INK: Record<ResolvedMode, string> = {
  light: '#1b1a18',
  dark: '#f3f1ee'
}

export function presetById(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find((preset) => preset.id === id)
}

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (value === 'custom' || Boolean(presetById(value)))
}

/* ------------------------------------------------------------------ */
/* Couleurs                                                            */
/* ------------------------------------------------------------------ */

export function parseHex(input: string): string | null {
  if (typeof input !== 'string') return null
  const value = input.trim().replace(/^#/, '')
  if (!/^[0-9a-f]{3}$/i.test(value) && !/^[0-9a-f]{6}$/i.test(value)) return null
  const full =
    value.length === 3
      ? value
          .split('')
          .map((part) => part + part)
          .join('')
      : value
  return `#${full.toLowerCase()}`
}

export type Rgb = { r: number; g: number; b: number }

export function hexToRgb(hex: string): Rgb {
  const clean = parseHex(hex) ?? '#000000'
  return {
    r: parseInt(clean.slice(1, 3), 16),
    g: parseInt(clean.slice(3, 5), 16),
    b: parseInt(clean.slice(5, 7), 16)
  }
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const clamp = (value: number): string =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`
}

function channelLuminance(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
}

/** Rapport de contraste WCAG entre deux couleurs opaques. */
export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [light, dark] = la >= lb ? [la, lb] : [lb, la]
  return (light + 0.05) / (dark + 0.05)
}

export function mix(a: string, b: string, weight: number): string {
  const t = Math.max(0, Math.min(1, weight))
  const first = hexToRgb(a)
  const second = hexToRgb(b)
  return rgbToHex({
    r: first.r * (1 - t) + second.r * t,
    g: first.g * (1 - t) + second.g * t,
    b: first.b * (1 - t) + second.b * t
  })
}

export function alpha(hex: string, opacity: number): string {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, opacity)).toFixed(3)})`
}

type Hsl = { h: number; s: number; l: number }

export function hexToHsl(hex: string): Hsl {
  const { r, g, b } = hexToRgb(hex)
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === red) h = (green - blue) / d + (green < blue ? 6 : 0)
  else if (max === green) h = (blue - red) / d + 2
  else h = (red - green) / d + 4
  return { h: h * 60, s, l }
}

function hslToHex({ h, s, l }: Hsl): string {
  const hue = ((h % 360) + 360) % 360
  const sat = Math.max(0, Math.min(1, s))
  const light = Math.max(0, Math.min(1, l))
  const c = (1 - Math.abs(2 * light - 1)) * sat
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = light - c / 2
  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x]
  return rgbToHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 })
}

/** Éclaircit (amount > 0) ou assombrit (amount < 0) une couleur. */
export function shift(hex: string, amount: number): string {
  const hsl = hexToHsl(hex)
  return hslToHex({ ...hsl, l: Math.max(0, Math.min(1, hsl.l + amount)) })
}

/** Déplace la luminosité par pas de 1 % jusqu'à atteindre le contraste voulu. */
export function ensureContrast(foreground: string, background: string, target = 4.5): string {
  if (contrast(foreground, background) >= target) return parseHex(foreground) ?? foreground
  const towardsLight = luminance(background) < 0.4
  const hsl = hexToHsl(foreground)
  for (let step = 1; step <= 100; step += 1) {
    const next = hslToHex({ ...hsl, l: Math.max(0, Math.min(1, hsl.l + (towardsLight ? step : -step) / 100)) })
    if (contrast(next, background) >= target) return next
  }
  return towardsLight ? '#ffffff' : '#000000'
}

/** Blanc ou noir, selon celui qui se lit le mieux sur la couleur. */
export function readableOn(background: string): string {
  return contrast('#ffffff', background) >= contrast(INK.light, background) ? '#ffffff' : INK.light
}

/**
 * Ajuste une teinte d'accent utilisée comme fond de bouton : le texte posé
dessus doit atteindre 4,5:1, même pour un rouge ou un orange moyen.
 */
export function fillAccent(accent: string): string {
  const white = contrast('#ffffff', accent)
  const ink = contrast(INK.light, accent)
  const useWhite = white >= ink
  if (Math.max(white, ink) >= 4.5) return accent
  const hsl = hexToHsl(accent)
  for (let step = 1; step <= 100; step += 1) {
    const lightness = Math.max(0, Math.min(1, hsl.l + (useWhite ? -step : step) / 100))
    const next = hslToHex({ ...hsl, l: lightness })
    if (contrast(useWhite ? '#ffffff' : INK.light, next) >= 4.5) return next
    if (lightness === 0 || lightness === 1) break
  }
  return useWhite ? '#' + '000000' : '#ffffff'
}

/**
 * Ramène une couleur personnalisée dans une plage utilisable pour le mode
 * courant, et explique le changement. Un accent très clair en mode clair ne
 * peut pas servir de lien ni de bordure : on l'assombrit au minimum nécessaire.
 */
export function adjustAccent(
  hex: string,
  mode: ResolvedMode
): { color: string; adjusted: boolean; reason?: string } {
  const parsed = parseHex(hex)
  if (!parsed) return { color: DEFAULT_CUSTOM_ACCENT, adjusted: true, reason: 'Couleur invalide : indigo conservé.' }
  const paper = PAPER[mode]
  const minimum = ensureContrast(parsed, paper, 3)
  if (contrast(parsed, paper) >= 3) return { color: parsed, adjusted: false }
  const tone = mode === 'light' ? 'assombrie' : 'éclaircie'
  return {
    color: minimum,
    adjusted: true,
    reason: `Couleur ${tone} pour rester visible sur le fond (contraste 3:1 minimum).`
  }
}

/* ------------------------------------------------------------------ */
/* Jetons                                                              */
/* ------------------------------------------------------------------ */

export interface ThemeChoice {
  themeId: ThemeId
  customAccent: string
}

export interface AppearanceInput extends ThemeChoice {
  mode: ResolvedMode
  glass: GlassIntensity
  highContrast: boolean
}

export type Tokens = Record<string, string>

export function accentColor({ themeId, customAccent, mode }: ThemeChoice & { mode: ResolvedMode }): string {
  if (themeId === 'custom') return adjustAccent(customAccent, mode).color
  const preset = presetById(themeId) ?? THEME_PRESETS[0]
  return mode === 'dark' ? preset.dark : preset.light
}

/**
 * Tous les jetons lus par l'interface. Les valeurs historiques (`--clay`,
 * `--accent-a/b/c`, `--glow`, `--tint`, `--sky-*`) sont dérivées de la même
 * teinte pour qu'aucun composant ne garde l'indigo d'origine.
 */
export function appearanceTokens(input: AppearanceInput): Tokens {
  const { mode, glass, highContrast } = input
  const raw = accentColor(input)
  const accent = fillAccent(raw)
  const paper = PAPER[mode]
  const ink = INK[mode]
  const dark = mode === 'dark'

  // Le texte d'accent doit rester lisible sur le fond de page.
  const link = ensureContrast(accent, paper, 4.5)
  const label = ensureContrast(accent, dark ? paper : paper, 3)
  const hover = dark ? shift(accent, 0.07) : shift(accent, -0.06)
  const contrastInk = readableOn(accent)
  const soft = alpha(accent, dark ? 0.18 : 0.13)
  const tint = alpha(accent, dark ? 0.13 : 0.1)
  const glassOpacity = highContrast ? 1 : glass === 'light' ? 0.58 : glass === 'strong' ? 0.92 : 0.76
  const tintMix = highContrast ? 0.04 : glass === 'strong' ? 0.14 : glass === 'light' ? 0.07 : 0.1

  return {
    '--accent': accent,
    '--accent-hover': hover,
    '--accent-soft': soft,
    '--accent-contrast': contrastInk,
    // Teinte d'accent utilisable en texte ou en bordure sur le fond de page.
    '--accent-label': label,
    '--glass-tint': mix(paper, accent, tintMix),
    '--focus-ring': `0 0 0 2px ${paper}, 0 0 0 4px ${label}`,
    '--selection': alpha(accent, dark ? 0.32 : 0.24),
    '--link': link,
    // Alias historiques : le châssis existant lit encore ceux-ci.
    '--clay': link,
    '--indigo': link,
    '--accent-a': dark ? mix(accent, '#ffffff', 0.3) : mix(accent, '#ffffff', 0.32),
    '--accent-b': accent,
    '--accent-c': dark ? shift(accent, -0.1) : shift(accent, -0.14),
    '--glow': `${hexToRgb(accent).r}, ${hexToRgb(accent).g}, ${hexToRgb(accent).b}`,
    '--tint': tint,
    '--sky-1': alpha(accent, dark ? 0.14 : 0.06),
    '--sky-2': alpha(accent, dark ? 0.09 : 0.08),
    '--sky-3': alpha(accent, dark ? 0.07 : 0.06),
    // Surfaces : le verre prend la teinte du thème et l'intensité choisie.
    '--surface': alpha(mix(paper, accent, tintMix), glassOpacity),
    '--glass': alpha(mix(paper, accent, tintMix), Math.min(1, glassOpacity + 0.04)),
    '--ink-strong': ink
  }
}

/* ------------------------------------------------------------------ */
/* Résolution                                                          */
/* ------------------------------------------------------------------ */

export function resolveMode(
  theme: 'light' | 'dark' | 'system',
  options: { hourTheme?: boolean; hour?: number; systemDark?: boolean } = {}
): ResolvedMode {
  const hour = options.hour ?? new Date().getHours()
  if (options.hourTheme) return hour >= 7 && hour < 19 ? 'light' : 'dark'
  if (theme === 'system') return options.systemDark ? 'dark' : 'light'
  return theme
}

/**
 * Thème effectif : celui de l'espace s'il en a un et que l'option est active,
 * sinon le thème global.
 */
export function resolveThemeId(options: {
  globalTheme: ThemeId
  perSpace?: boolean
  spaceTheme?: ThemeId | null
}): ThemeId {
  if (options.perSpace && options.spaceTheme) return options.spaceTheme
  return options.globalTheme
}

export interface AppearancePrefs {
  themeId: ThemeId
  customAccent: string
  glass: GlassIntensity
  homeBackground: HomeBackground
  homeImage: string | null
  homeBlur: number
  highContrast: boolean
  hourTheme: boolean
  perSpaceThemes: boolean
}

/**
 * Assainit les réglages d'apparence lus sur disque. Utilisé au chargement et
 * couvert par les tests de persistance : une valeur inconnue ne casse rien.
 */
export function sanitizeAppearance(raw: Partial<AppearancePrefs> | null | undefined): AppearancePrefs {
  const input = raw ?? {}
  return {
    themeId: isThemeId(input.themeId) ? input.themeId : DEFAULT_THEME,
    customAccent: parseHex(input.customAccent ?? '') ?? DEFAULT_CUSTOM_ACCENT,
    glass: input.glass === 'light' || input.glass === 'strong' ? input.glass : 'normal',
    homeBackground:
      input.homeBackground === 'plain' || input.homeBackground === 'image' ? input.homeBackground : 'gradient',
    homeImage:
      typeof input.homeImage === 'string' && input.homeImage.trim() && input.homeImage.length < 2000
        ? input.homeImage
        : null,
    homeBlur:
      typeof input.homeBlur === 'number' && input.homeBlur >= 0 && input.homeBlur <= 40
        ? Math.round(input.homeBlur)
        : 18,
    highContrast: input.highContrast === true,
    hourTheme: input.hourTheme === true,
    perSpaceThemes: input.perSpaceThemes === true
  }
}

/** Couleur d'aperçu d'un thème, pour les cartes des réglages et la palette. */
export function previewColor(themeId: ThemeId, customAccent: string, mode: ResolvedMode): string {
  return accentColor({ themeId, customAccent, mode })
}
