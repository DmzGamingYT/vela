import type { TabState } from './types'

export interface TabMove {
  id: string
  targetId?: string | null
  position?: 'before' | 'after'
  /** Renseigné pour déposer dans un dossier ; `null` sort du dossier. */
  groupId?: string | null
  /** Force le passage épinglé ↔ normal, sans dépendre de la cible. */
  pinned?: boolean
}

/**
 * Déplace un onglet dans l'ordre global (l'ordre relatif de chaque espace et
 * de chaque dossier en découle) ou l'affecte à un dossier.
 *
 * Le changement d'état (épinglé ↔ normal) n'est fait que s'il est demandé
 * explicitement par `pinned` : sans cela, épinglés et onglets normaux ne se
 * mélangent pas, comme avant. Un onglet épinglé ne rejoint jamais un dossier.
 * Retourne le tableau d'origine si le déplacement est impossible.
 */
export function moveTab(tabs: TabState[], move: TabMove): TabState[] {
  const tab = tabs.find((item) => item.id === move.id)
  if (!tab) return tabs
  const rest = tabs.filter((item) => item.id !== move.id)
  const wantsPinned = move.pinned ?? tab.pinned

  if (move.targetId) {
    const target = rest.find((item) => item.id === move.targetId)
    if (!target || target.spaceId !== tab.spaceId) return tabs
    if (move.pinned === undefined && target.pinned !== tab.pinned) return tabs
    tab.pinned = wantsPinned
    tab.groupId = tab.pinned ? null : (target.groupId ?? null)
    const index = rest.findIndex((item) => item.id === target.id)
    rest.splice(move.position === 'after' ? index + 1 : index, 0, tab)
    return rest
  }

  if (move.groupId !== undefined) {
    if (tab.pinned && move.pinned !== false) return tabs
    tab.pinned = false
    tab.groupId = move.groupId ?? null
    let insertAt = -1
    rest.forEach((item, index) => {
      if (item.spaceId === tab.spaceId) insertAt = index
    })
    if (insertAt === -1) rest.push(tab)
    else rest.splice(insertAt + 1, 0, tab)
    return rest
  }

  if (move.pinned !== undefined) {
    // Aucune cible : l'onglet rejoint la fin de son nouveau groupe d'état.
    tab.pinned = wantsPinned
    tab.groupId = null
    let insertAt = -1
    rest.forEach((item, index) => {
      if (item.spaceId === tab.spaceId && item.pinned === tab.pinned) insertAt = index
    })
    if (insertAt === -1) {
      rest.forEach((item, index) => {
        if (item.spaceId === tab.spaceId) insertAt = index
      })
    }
    if (insertAt === -1) rest.push(tab)
    else rest.splice(insertAt + 1, 0, tab)
    return rest
  }

  return tabs
}
