export type TranslateTileState = 'rest' | 'hover' | 'focus' | 'active' | 'disabled'
export type TranslateTileMode = 'light' | 'dark'

export interface TranslateTileTokens {
  background: string
  color: string
  border: string
  /** Doit toujours être exactement la même valeur que `background`. */
  halo: string
  accent: string
}

const LIGHT_BG = '#ffffff'
const DARK_BG = '#211f1d'
const LIGHT_INK = '#1c1b1a'
const DARK_INK = '#f4f1ec'
const LIGHT_LINE = '#ddd8d1'
const DARK_LINE = '#3b3733'
/** Accent de l’application, déjà décliné pour les deux modes. */
const ACCENT = 'var(--clay)'
/** Variante profonde pour garder une icône blanche lisible en mode sombre. */
const DARK_ACTIVE = '#4a45c0'

/**
 * Palette unique de la tuile : le fond et `--halo` sortent de la même valeur,
 * ce qui rend impossible un liseré d’une autre couleur que le fond.
 */
export function translateTileTokens(
  state: TranslateTileState,
  mode: TranslateTileMode = 'light'
): TranslateTileTokens {
  const dark = mode === 'dark'
  const baseBackground = dark ? DARK_BG : LIGHT_BG
  const ink = dark ? DARK_INK : LIGHT_INK
  const line = dark ? DARK_LINE : LIGHT_LINE
  const accent = ACCENT

  if (state === 'active') {
    const background = dark ? DARK_ACTIVE : accent
    return { background, color: '#ffffff', border: background, halo: background, accent }
  }

  if (state === 'disabled') {
    return {
      background: baseBackground,
      color: dark
        ? 'color-mix(in srgb, #f4f1ec 40%, transparent)'
        : 'color-mix(in srgb, #1c1b1a 40%, transparent)',
      border: line,
      halo: baseBackground,
      accent
    }
  }

  if (state === 'hover' || state === 'focus') {
    const background = dark
      ? `color-mix(in srgb, ${accent} 16%, ${DARK_BG})`
      : `color-mix(in srgb, ${accent} 12%, ${LIGHT_BG})`
    return {
      background,
      color: accent,
      border: `color-mix(in srgb, ${accent} 40%, transparent)`,
      halo: background,
      accent
    }
  }

  return {
    background: baseBackground,
    color: ink,
    border: line,
    halo: baseBackground,
    accent
  }
}
