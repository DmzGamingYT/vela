import {
  appearanceTokens,
  presetById,
  resolveMode,
  resolveMotion,
  resolveThemeId,
  type ResolvedMode,
  type Tokens,
  type ThemeId
} from '@shared/theme'
import type { Settings, Space } from '@shared/types'

const CACHE_KEY = 'vela.appearance'

export interface AppearanceState {
  themeId: ThemeId
  customAccent: string
  mode: ResolvedMode
  glass: Settings['glass']
  glassBlur: number
  ambience: Settings['ambience']
  highContrast: boolean
  density: Settings['density']
  textSize: Settings['textSize']
  sidebarSide: Settings['sidebarSide']
  /** Vrai quand les animations d'interface doivent être figées. */
  reduceMotion: boolean
}

interface CachedAppearance extends AppearanceState {
  tokens: Tokens
}

function systemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function systemReduce(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Combinaison effective : mode (clair/sombre/système/heure), thème global ou
 * celui de l'espace actif, et les réglages d'interface qui en découlent.
 */
export function appearanceState(settings: Settings, space?: Space | null): AppearanceState {
  return {
    themeId: resolveThemeId({
      globalTheme: settings.themeId,
      perSpace: settings.perSpaceThemes,
      spaceTheme: space?.theme ?? null
    }),
    customAccent: settings.customAccent,
    mode: resolveMode(settings.theme, {
      hourTheme: settings.hourTheme,
      hourStart: settings.hourStart,
      hourEnd: settings.hourEnd,
      systemDark: systemDark()
    }),
    glass: settings.glass,
    glassBlur: settings.glassBlur,
    ambience: settings.ambience,
    highContrast: settings.highContrast,
    density: settings.density,
    textSize: settings.textSize,
    sidebarSide: settings.sidebarSide,
    reduceMotion: resolveMotion(settings.reduceMotion, systemReduce())
  }
}

/**
 * Applique les jetons au document et garde une copie pour le prochain
 * démarrage : le script inline d'index.html la rejoue avant le premier pixel.
 */
export function applyAppearance(state: AppearanceState, options: { cache?: boolean } = {}): Tokens {
  const tokens = appearanceTokens(state)
  const root = document.documentElement
  root.dataset.mode = state.mode
  root.dataset.theme = state.themeId
  root.dataset.glass = state.glass
  root.dataset.ambience = state.ambience
  root.dataset.contrast = state.highContrast ? 'high' : 'normal'
  root.dataset.density = state.density
  root.dataset.text = state.textSize
  root.dataset.sidebar = state.sidebarSide
  root.dataset.motion = state.reduceMotion ? 'reduce' : 'full'
  root.style.colorScheme = state.mode
  for (const [name, value] of Object.entries(tokens)) root.style.setProperty(name, value)
  // Le glow d'accueil et l'indicateur d'onglet suivent le thème, plus la
  // couleur du profil : un seul accent pour tout le châssis.
  root.style.setProperty('--space-accent', tokens['--accent-label'])

  if (options.cache !== false) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ...state, tokens }))
    } catch {
      // stockage plein ou désactivé : le thème s'appliquera au prochain rendu
    }
  }
  return tokens
}

/** Rejoue le thème mémorisé avant que React ne monte. */
export function applyCachedAppearance(): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return
    const cached = JSON.parse(raw) as Partial<CachedAppearance>
    if (!cached || !cached.tokens || !cached.mode) return
    const root = document.documentElement
    root.dataset.mode = cached.mode
    root.dataset.theme = cached.themeId ?? 'indigo'
    root.dataset.glass = cached.glass ?? 'normal'
    root.dataset.ambience = cached.ambience ?? 'none'
    root.dataset.contrast = cached.highContrast ? 'high' : 'normal'
    root.dataset.density = cached.density ?? 'normal'
    root.dataset.text = cached.textSize ?? 'normal'
    root.dataset.sidebar = cached.sidebarSide ?? 'left'
    root.dataset.motion = cached.reduceMotion ? 'reduce' : 'full'
    root.style.colorScheme = cached.mode
    for (const [name, value] of Object.entries(cached.tokens)) {
      if (typeof value === 'string') root.style.setProperty(name, value)
    }
    root.style.setProperty('--space-accent', cached.tokens['--accent-label'] ?? '')
  } catch {
    // cache illisible : on repart du thème par défaut
  }
}

/** Couleur d'aperçu d'une carte de thème, dans le mode courant. */
export function swatchColor(themeId: ThemeId, customAccent: string, mode: ResolvedMode): string {
  if (themeId === 'custom') return customAccent
  const preset = presetById(themeId)
  if (!preset) return customAccent
  return mode === 'dark' ? preset.dark : preset.light
}
