import { displayTitle } from './url'

/**
 * Règles du menu d'un onglet épinglé, sans dépendance à l'interface : ce qui
 * peut être proposé dépend uniquement de l'état de l'onglet et de sa place
 * dans la rangée. Le composant ne fait qu'afficher le résultat.
 */

/** Met en veille une page encore chargée ; inutile si elle l'est déjà. */
export function canSleep(tab: { asleep: boolean }): boolean {
  return !tab.asleep
}

/** Le son ne s'invite que si la page en émet ou si elle est déjà coupée. */
export function canToggleSound(tab: { audible: boolean; muted: boolean }): boolean {
  return tab.audible || tab.muted
}

/** Titre d'épingle nettoyé : sans compteur de notifications, jamais vide. */
export function pinnedTitle(title: string, fallback: string): string {
  const clean = displayTitle(title ?? '')
  return clean || (fallback ?? '').trim() || 'Page'
}

/**
 * Voisin visé par un déplacement dans la rangée (−1 à gauche, 1 à droite).
 * `null` aux extrémités : l'action correspondante est alors masquée.
 */
export function pinnedNeighbour(ids: string[], id: string, step: -1 | 1): string | null {
  const index = ids.indexOf(id)
  if (index < 0) return null
  return ids[index + step] ?? null
}
