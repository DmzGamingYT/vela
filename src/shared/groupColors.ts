/**
 * Couleurs d'un dossier, dans l'ordre du sélecteur.
 *
 * Bleu, vert, violet et ambre d'abord : un dossier neuf ne doit pas
 * ressembler à une alerte. Le rouge reste proposé, en dernier.
 *
 * La palette est partagée pour que la couleur attribuée à la création soit
 * exactement l'une de celles que le sélecteur propose.
 */
export const GROUP_COLORS = [
  '#4f8fd0',
  '#4fae7a',
  '#7a6fd0',
  '#d9b64a',
  '#4fb0b8',
  '#d1799a',
  '#e0913f',
  '#e0574f'
] as const

export type GroupColor = (typeof GROUP_COLORS)[number]

/** Glyphes proposés : assez pour distinguer des dossiers, pas une bibliothèque. */
export const GROUP_ICONS = ['folder', 'star', 'inbox', 'calendar', 'compass', 'moon'] as const

export type GroupIcon = (typeof GROUP_ICONS)[number]

export function isGroupIcon(value: unknown): value is GroupIcon {
  return typeof value === 'string' && (GROUP_ICONS as readonly string[]).includes(value)
}
