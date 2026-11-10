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
export type HomeBackground = 'gradient' | 'sky' | 'plain' | 'image'
/** Présence du fond derrière l'accueil : discret, normal, marqué. */
export type HomeIntensity = 'discreet' | 'normal' | 'marked'
export type ResolvedMode = 'light' | 'dark'
/** Densité de l'interface : l'espace autour des rangées, pas la taille du texte. */
export type Density = 'compact' | 'normal' | 'airy'
export type TextSize = 'small' | 'normal' | 'large'
export type SidebarSide = 'left' | 'right'
/** « Système » suit le réglage du Mac ou de Windows ; les deux autres forcent. */
export type MotionPreference = 'system' | 'reduce' | 'full'
/** Les deux ciels de l'accueil, réservés au thème Braise. */
export type SkyVariant = 'braise' | 'nuit-etoilee'

/**
 * Portée d'une ambiance : « page » la laisse courir derrière l'accueil et le
 * châssis, « chrome » la réserve au verre des barres et des panneaux.
 */
export type AmbienceScope = 'page' | 'chrome'
export const DEFAULT_AMBIENCE_SCOPE: AmbienceScope = 'page'
export const DEFAULT_AMBIENCE_INTENSITY = 80
export const MAX_AMBIENCE_INTENSITY = 100

/** Heures par défaut du thème automatique : clair de 7 h à 19 h. */
export const HOUR_START = 7
export const HOUR_END = 19

/**
 * Ambiances animées du châssis. Elles sont indépendantes du thème d'accent :
 * un tweak règle la couleur des contrôles, une ambiance règle l'atmosphère
 * derrière le verre. `none` laisse le fond sobre du produit.
 */
export type AmbienceId =
  | 'none'
  | 'glace-feu'
  | 'multivers'
  | 'reve-etolie'
  | 'voie-lactee'
  | 'horizon-martien'
  | 'aura-tech'
  | 'cyber-neon'
  | 'sanctuaire-zen'

export type AmbiencePresetId = Exclude<AmbienceId, 'none'>

export interface AmbiencePreset {
  id: AmbiencePresetId
  label: string
  tagline: string
  /** Ce qui bouge, en une ligne : promesse et garde-fou de performance. */
  motion: string
  /** Deux teintes pures, indépendantes de l'accent des tweaks. */
  light: [string, string]
  dark: [string, string]
}

/** Les huit ambiances, dans l'ordre de la grille des réglages. */
export const AMBIENCE_PRESETS: AmbiencePreset[] = [
  {
    id: 'glace-feu',
    label: 'Givre & Braise',
    tagline: 'Le froid et la lueur, côte à côte.',
    motion: 'Pulsation lente · braises et givre',
    light: ['#2d6fa8', '#c0392b'],
    dark: ['#7fb6e8', '#ff6b4a']
  },
  {
    id: 'multivers',
    label: 'Multivers',
    tagline: 'Pop art, cases nettes.',
    motion: 'Trame en parallaxe · contours francs',
    light: ['#f0357e', '#f5b700'],
    dark: ['#ff5c9e', '#ffd23f']
  },
  {
    id: 'reve-etolie',
    label: 'Rêve Étoilé',
    tagline: 'Poussière d’étoiles dorée.',
    motion: 'Scintillement organique · flou gaussien',
    light: ['#7b61c9', '#e0a93b'],
    dark: ['#b49bff', '#f7d98b']
  },
  {
    id: 'voie-lactee',
    label: 'Voie Lactée',
    tagline: 'Nébuleuse en dérive.',
    motion: 'Pan lent · profondeur infinie',
    light: ['#6e52c9', '#2c6fd6'],
    dark: ['#9d7bff', '#5c8dff']
  },
  {
    id: 'horizon-martien',
    label: 'Horizon Martien',
    tagline: 'Cuivre et air chaud.',
    motion: 'Mirage atmosphérique · teintes cuivrées',
    light: ['#b4632f', '#d9915a'],
    dark: ['#ff9a5c', '#ffd3a8']
  },
  {
    id: 'aura-tech',
    label: 'Aura',
    tagline: 'Ivoire, silence, précision.',
    motion: 'Lumière ultra-douce · ondulation au clic',
    light: ['#8c8474', '#c7bea9'],
    dark: ['#f4efe4', '#cfc4ae']
  },
  {
    id: 'cyber-neon',
    label: 'Cyber-Néon',
    tagline: 'Balayages magenta et cyan.',
    motion: 'Scanlines · bordures néon pulsantes',
    light: ['#d3007c', '#00939c'],
    dark: ['#ff2fb5', '#2be6f0']
  },
  {
    id: 'sanctuaire-zen',
    label: 'Sanctuaire Zen',
    tagline: 'Soie mate, minéral.',
    motion: 'Dérive très lente · matière papier',
    light: ['#7c8c6d', '#b7a992'],
    dark: ['#a9c09a', '#d6c8ae']
  }
]

/** Le flou appliqué au verre, par cran historique (avant le curseur). */
export const GLASS_BLUR: Record<GlassIntensity, number> = { light: 8, normal: 18, strong: 30 }
export const DEFAULT_GLASS_BLUR = GLASS_BLUR.normal
export const MAX_GLASS_BLUR = 40

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
  // Braise : le thème du ciel de l'accueil, seul à ouvrir ses braises et sa
  // nuit étoilée (et la lueur sous les cases du rail).
  { id: 'braise', label: 'Braise', light: '#B4451F', dark: '#FF8F5E' }
]

/** Le thème qui porte le ciel de l'accueil ; les autres n'ouvrent pas « Ciel ». */
export const SKY_THEME: ThemePresetId = 'braise'

/**
 * Les dix thèmes de couleur de la grille : Braise n'en fait pas partie, il est
 * le thème du ciel et se choisit depuis le fond de l'accueil.
 */
export const ACCENT_THEMES: ThemePreset[] = THEME_PRESETS.filter(
  (preset) => preset.id !== SKY_THEME
)

export const DEFAULT_THEME: ThemePresetId = 'indigo'
// En minuscules, comme toute couleur relue par `parseHex` : la valeur par
// défaut doit survivre telle quelle à un aller-retour de persistance.
export const DEFAULT_CUSTOM_ACCENT = '#5b5bd6'

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

/** Valide le niveau du fond d'accueil relu depuis le disque ou l'IPC. */
export function isHomeIntensity(value: unknown): value is HomeIntensity {
  return value === 'discreet' || value === 'normal' || value === 'marked'
}

export function ambiencePreset(id: string): AmbiencePreset | undefined {
  return AMBIENCE_PRESETS.find((preset) => preset.id === id)
}

export function isAmbienceId(value: unknown): value is AmbienceId {
  return typeof value === 'string' && (value === 'none' || Boolean(ambiencePreset(value)))
}

/** Les deux teintes d'une ambiance pour le mode courant. */
export function ambienceColors(preset: AmbiencePreset, mode: ResolvedMode): [string, string] {
  return mode === 'dark' ? preset.dark : preset.light
}

/** Ramène une intensité de verre lue sur disque dans la plage du curseur. */
export function sanitizeGlassBlur(value: unknown, fallback: number = DEFAULT_GLASS_BLUR): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(MAX_GLASS_BLUR, Math.round(value)))
}

/** Ramène une présence d'ambiance lue sur disque dans la plage du curseur. */
export function sanitizeAmbienceIntensity(
  value: unknown,
  fallback: number = DEFAULT_AMBIENCE_INTENSITY
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(MAX_AMBIENCE_INTENSITY, Math.round(value)))
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
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, '0')
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
    const next = hslToHex({
      ...hsl,
      l: Math.max(0, Math.min(1, hsl.l + (towardsLight ? step : -step) / 100))
    })
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
 * courant, et explique le changement. Un accent trop clair ne peut pas servir
 * de texte ni de bordure : on l'assombrit (ou l'éclaircit) au minimum pour
 * atteindre 4,5:1 sur le fond de page.
 */
export function adjustAccent(
  hex: string,
  mode: ResolvedMode
): { color: string; adjusted: boolean; reason?: string } {
  const parsed = parseHex(hex)
  if (!parsed)
    return {
      color: DEFAULT_CUSTOM_ACCENT,
      adjusted: true,
      reason: 'Couleur invalide : indigo conservé.'
    }
  const paper = PAPER[mode]
  if (contrast(parsed, paper) >= 4.5) return { color: parsed, adjusted: false }
  const tone = mode === 'light' ? 'assombrie' : 'éclaircie'
  return {
    color: ensureContrast(parsed, paper, 4.5),
    adjusted: true,
    reason: `Couleur ${tone} pour rester lisible sur le fond (contraste minimum de 4,5:1).`
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
  /** Optionnel : les appels historiques retombent sur le fond sobre. */
  ambience?: AmbienceId
  /** Portée de l'ambiance ; « page » par défaut. */
  ambienceScope?: AmbienceScope
  /** Présence de l'ambiance, de 0 à 100. */
  ambienceIntensity?: number
  /** Intensité du verre en pixels ; `glass` sert de repli. */
  glassBlur?: number
}

export type Tokens = Record<string, string>

export function accentColor({
  themeId,
  customAccent,
  mode
}: ThemeChoice & { mode: ResolvedMode }): string {
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

  // Le texte d'accent doit rester lisible sur le fond de page, y compris
  // quand il sert de bordure de sélection : 4,5:1 partout.
  const link = ensureContrast(accent, paper, 4.5)
  const label = ensureContrast(accent, paper, 4.5)
  const hover = dark ? shift(accent, 0.07) : shift(accent, -0.06)
  const contrastInk = readableOn(accent)
  const soft = alpha(accent, dark ? 0.18 : 0.13)
  const tint = alpha(accent, dark ? 0.13 : 0.1)
  const glassOpacity = highContrast
    ? 1
    : glass === 'light'
      ? 0.58
      : glass === 'strong'
        ? 0.92
        : 0.76
  const tintMix = highContrast ? 0.04 : glass === 'strong' ? 0.14 : glass === 'light' ? 0.07 : 0.1
  const blur = sanitizeGlassBlur(input.glassBlur, GLASS_BLUR[glass])
  // Le wordmark de la barre latérale est posé sur le verre (teinté par
  // l'accent) puis sur le reflet blanc du haut : le point final doit rester à
  // 4,5:1 même dans ce contexte, pas seulement sur le papier nu.
  const glassAlpha = Math.min(1, glassOpacity + 0.04)
  const glassSurface = mix(paper, mix(paper, accent, tintMix), glassAlpha)
  const wordmarkSurface = mix(glassSurface, '#ffffff', 0.05)
  const wordmarkAccent = ensureContrast(accent, wordmarkSurface, 4.5)
  // L'ambiance ne repeint jamais l'accent : elle ne fournit que les teintes
  // de ses calques. Sans ambiance, ce sont les teintes du thème qui servent
  // de repli pour que les feuilles de style n'aient jamais de valeur vide.
  const ambience = ambiencePreset(input.ambience ?? 'none')
  const ambA = ambience ? (dark ? ambience.dark[0] : ambience.light[0]) : accent
  const ambB = ambience ? (dark ? ambience.dark[1] : ambience.light[1]) : hover
  const ambMix = mix(ambA, ambB, 0.5)
  const rgb = (color: string): string => {
    const { r, g, b } = hexToRgb(color)
    return `${r}, ${g}, ${b}`
  }

  return {
    '--accent': accent,
    '--accent-hover': hover,
    '--accent-soft': soft,
    '--accent-contrast': contrastInk,
    // Teinte d'accent utilisable en texte ou en bordure sur le fond de page.
    '--accent-label': label,
    // Accent du point final du wordmark, tenu lisible sur le verre de la barre.
    '--wordmark-accent': wordmarkAccent,
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
    // Intensité du verre dépoli, lue par les calques qui portent
    // `backdrop-filter` (le flou seul est animé par le navigateur).
    '--glass-blur': `${blur}px`,
    '--glass-sat': `${Math.round(100 + blur * 2.2)}%`,
    '--glass-border': alpha(ambMix, dark ? 0.34 : 0.26),
    // Teintes des calques d'ambiance (voir 22-ambiances.css).
    '--amb-1': ambA,
    '--amb-2': ambB,
    '--amb-mix': ambMix,
    '--amb-rgb': rgb(ambA),
    '--amb-rgb-2': rgb(ambB),
    '--amb-line': alpha(ambMix, dark ? 0.42 : 0.3),
    '--amb-halo': alpha(ambMix, dark ? 0.22 : 0.16),
    // Présence de la scène derrière la page, lue par `.ambience-chrome`.
    '--amb-opacity': String(sanitizeAmbienceIntensity(input.ambienceIntensity) / 100),
    '--ink-strong': ink
  }
}

/* ------------------------------------------------------------------ */
/* Résolution                                                          */
/* ------------------------------------------------------------------ */

export function resolveMode(
  theme: 'light' | 'dark' | 'system',
  options: {
    hourTheme?: boolean
    hour?: number
    systemDark?: boolean
    /** Première heure claire du thème automatique (incluse). */
    hourStart?: number
    /** Heure de retour au sombre (exclue). */
    hourEnd?: number
  } = {}
): ResolvedMode {
  const hour = options.hour ?? new Date().getHours()
  if (options.hourTheme) {
    const start = options.hourStart ?? HOUR_START
    const end = options.hourEnd ?? HOUR_END
    const light = start < end ? hour >= start && hour < end : hour >= start || hour < end
    return light ? 'light' : 'dark'
  }
  if (theme === 'system') return options.systemDark ? 'dark' : 'light'
  return theme
}

/** « Réduire les animations » effectif : le choix explicite, sinon le système. */
export function resolveMotion(preference: MotionPreference, systemReduce: boolean): boolean {
  if (preference === 'reduce') return true
  if (preference === 'full') return false
  return systemReduce
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
  /** Intensité continue du verre dépoli, en pixels de flou. */
  glassBlur: number
  /** Ambiance animée du châssis ; `none` garde le fond sobre. */
  ambience: AmbienceId
  /** Toute la page (défaut), ou le verre du châssis seul. */
  ambienceScope: AmbienceScope
  /** Présence de l'ambiance, de 0 à 100. */
  ambienceIntensity: number
  homeBackground: HomeBackground
  /** Intensité du fond de l'accueil, indépendante de son style. */
  homeIntensity: HomeIntensity
  homeImage: string | null
  homeBlur: number
  /** Ciel de l'accueil, réservé au thème Braise. */
  skyVariant: SkyVariant
  highContrast: boolean
  reduceMotion: MotionPreference
  density: Density
  textSize: TextSize
  sidebarSide: SidebarSide
  hourTheme: boolean
  /** Première heure claire du thème automatique. */
  hourStart: number
  /** Heure du retour au sombre. */
  hourEnd: number
  perSpaceThemes: boolean
  /**
   * Marqueur de migration : dans la 0.3.24, le ciel s'affichait dès que le
   * thème Braise était actif. Une fois le fond converti en `sky`, on ne
   * reconvertit plus un « Dégradé » choisi ensuite.
   */
  skyMigrated: boolean
}

/**
 * Assainit les réglages d'apparence lus sur disque. Utilisé au chargement et
 * couvert par les tests de persistance : une valeur inconnue ne casse rien.
 */
export function sanitizeAppearance(
  raw: Partial<AppearancePrefs> | null | undefined
): AppearancePrefs {
  const input = raw ?? {}
  // Champs de la 0.3.24 : le ciel était une case à cocher, sa variante
  // portait un nom qui n'a plus cours. Les deux sont migrés une seule fois.
  const legacy = input as Partial<AppearancePrefs> & { dragonSky?: boolean }
  const themeId = isThemeId(input.themeId) ? input.themeId : DEFAULT_THEME
  const background: HomeBackground =
    input.homeBackground === 'sky' ||
    input.homeBackground === 'plain' ||
    input.homeBackground === 'image'
      ? input.homeBackground
      : 'gradient'
  const migrateSky =
    legacy.skyMigrated !== true &&
    legacy.dragonSky !== false &&
    themeId === SKY_THEME &&
    (input.homeBackground === undefined || input.homeBackground === 'gradient')
  const hourStart = sanitizeHour(input.hourStart, HOUR_START)
  const hourEnd = sanitizeHour(input.hourEnd, HOUR_END)

  return {
    themeId,
    customAccent: parseHex(input.customAccent ?? '') ?? DEFAULT_CUSTOM_ACCENT,
    glass: input.glass === 'light' || input.glass === 'strong' ? input.glass : 'normal',
    // Un fichier d'avant le curseur n'a que le cran : on en dérive le flou.
    glassBlur: sanitizeGlassBlur(
      input.glassBlur,
      GLASS_BLUR[input.glass === 'light' || input.glass === 'strong' ? input.glass : 'normal']
    ),
    ambience: isAmbienceId(input.ambience) ? input.ambience : 'none',
    ambienceScope: input.ambienceScope === 'chrome' ? 'chrome' : DEFAULT_AMBIENCE_SCOPE,
    ambienceIntensity: sanitizeAmbienceIntensity(input.ambienceIntensity),
    homeBackground: migrateSky ? 'sky' : background,
    homeIntensity:
      input.homeIntensity === 'discreet' || input.homeIntensity === 'marked'
        ? input.homeIntensity
        : 'normal',
    homeImage:
      typeof input.homeImage === 'string' && input.homeImage.trim() && input.homeImage.length < 2000
        ? input.homeImage
        : null,
    homeBlur:
      typeof input.homeBlur === 'number' && input.homeBlur >= 0 && input.homeBlur <= 40
        ? Math.round(input.homeBlur)
        : 18,
    skyVariant:
      input.skyVariant === 'nuit-etoilee' || (input.skyVariant as string) === 'westeros'
        ? 'nuit-etoilee'
        : 'braise',
    highContrast: input.highContrast === true,
    reduceMotion:
      input.reduceMotion === 'reduce' || input.reduceMotion === 'full'
        ? input.reduceMotion
        : 'system',
    density: input.density === 'compact' || input.density === 'airy' ? input.density : 'normal',
    textSize: input.textSize === 'small' || input.textSize === 'large' ? input.textSize : 'normal',
    sidebarSide: input.sidebarSide === 'right' ? 'right' : 'left',
    hourTheme: input.hourTheme === true,
    // Deux heures égales donneraient un mode figé : on revient aux valeurs sures.
    hourStart: hourStart === hourEnd ? HOUR_START : hourStart,
    hourEnd: hourStart === hourEnd ? HOUR_END : hourEnd,
    perSpaceThemes: input.perSpaceThemes === true,
    skyMigrated: true
  }
}

/** Heure entière de 0 à 23, ou le repli fourni. */
export function sanitizeHour(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const hour = Math.round(value)
  return hour >= 0 && hour <= 23 ? hour : fallback
}

/** Couleur d'aperçu d'un thème, pour les cartes des réglages et la palette. */
export function previewColor(themeId: ThemeId, customAccent: string, mode: ResolvedMode): string {
  return accentColor({ themeId, customAccent, mode })
}
