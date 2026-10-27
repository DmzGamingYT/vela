/**
 * Petite fenêtre « Little Arc » : une fenêtre réduite, jetable, pour regarder
 * une page sans créer d'onglet. Ce module ne contient que les règles — position
 * d'ouverture et raccourcis — pour qu'elles se testent sans Electron.
 */

/** Hauteur de la barre compacte, en points CSS : la page commence juste après. */
export const MINI_CHROME_HEIGHT = 44
/** Taille d'ouverture, bornée par la zone utile de l'écran. */
export const MINI_WIDTH = 560
export const MINI_HEIGHT = 660
export const MINI_MIN_WIDTH = 380
export const MINI_MIN_HEIGHT = 320
/** Marge gardée avec les bords de l'écran. */
const MINI_MARGIN = 16

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface MiniPlacement {
  /** Zone utile de l'écran qui porte la fenêtre principale (hors Dock et barre). */
  workArea: Rect
  width?: number
  height?: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

/**
 * Position d'ouverture : au milieu de l'écran, comme Little Arc, sur l'écran qui
 * porte Vela. Le résultat reste entièrement visible dans la zone utile (jamais
 * sous le Dock) et se réduit sur un petit écran sans passer sous le minimum.
 */
export function placeMiniWindow(placement: MiniPlacement): Rect {
  const { workArea } = placement
  const width = Math.round(
    Math.min(placement.width ?? MINI_WIDTH, Math.max(MINI_MIN_WIDTH, workArea.width - MINI_MARGIN * 2))
  )
  const height = Math.round(
    Math.min(placement.height ?? MINI_HEIGHT, Math.max(MINI_MIN_HEIGHT, workArea.height - MINI_MARGIN * 2))
  )
  const centered = (start: number, span: number, size: number): number =>
    start + Math.round((span - size) / 2)
  return {
    x: Math.round(
      clamp(
        centered(workArea.x, workArea.width, width),
        workArea.x + MINI_MARGIN,
        workArea.x + workArea.width - MINI_MARGIN - width
      )
    ),
    y: Math.round(
      clamp(
        centered(workArea.y, workArea.height, height),
        workArea.y + MINI_MARGIN,
        workArea.y + workArea.height - MINI_MARGIN - height
      )
    ),
    width,
    height
  }
}

export type MiniKeyAction =
  | 'close'
  | 'address'
  | 'reload'
  | 'back'
  | 'forward'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'

export interface MiniKeyInput {
  type: string
  key: string
  meta: boolean
  control: boolean
  shift: boolean
  alt: boolean
}

/**
 * Raccourcis de la petite fenêtre. Le menu natif ne les enregistre pas : tout
 * passe par `before-input-event`, comme pour la fenêtre principale.
 * `isMac` décide de la touche de commande, jamais les deux à la fois.
 */
export function miniKeyAction(input: MiniKeyInput, isMac: boolean): MiniKeyAction | null {
  if (input.type !== 'keyDown') return null
  if (input.key === 'Escape' && !input.meta && !input.control && !input.alt) return 'close'
  if (input.alt || input.shift) return null
  const mod = isMac ? input.meta : input.control
  if (!mod) return null
  const table: Record<string, MiniKeyAction> = {
    w: 'close',
    l: 'address',
    r: 'reload',
    '[': 'back',
    ']': 'forward',
    '=': 'zoom-in',
    '+': 'zoom-in',
    '-': 'zoom-out',
    '0': 'zoom-reset'
  }
  return table[input.key.toLowerCase()] ?? null
}
