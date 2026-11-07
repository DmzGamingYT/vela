/**
 * Raccourcis du coup d'œil : la carte vit dans le DOM, mais la page qu'elle
 * affiche est une vue native. Celle-ci reçoit ses touches par
 * `before-input-event`, comme un onglet — ces règles restent donc testables
 * sans Electron.
 */

export type PeekKeyAction =
  | 'close'
  | 'address'
  | 'reload'
  | 'back'
  | 'forward'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'

export interface PeekKeyInput {
  type: string
  key: string
  meta: boolean
  control: boolean
  shift: boolean
  alt: boolean
}

/**
 * Raccourcis de la page du coup d'œil. Échap ferme, ⌘L remonte à l'adresse,
 * ⌘W ferme aussi, et le reste reprend les gestes d'un onglet.
 * `isMac` décide de la touche de commande, jamais les deux à la fois.
 */
export function peekKeyAction(input: PeekKeyInput, isMac: boolean): PeekKeyAction | null {
  if (input.type !== 'keyDown') return null
  // Échap ferme toujours la carte, qu’une commande traîne ou non.
  if (input.key === 'Escape') return 'close'
  if (input.alt || input.shift) return null
  const mod = isMac ? input.meta : input.control
  if (!mod) return null
  const table: Record<string, PeekKeyAction> = {
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
