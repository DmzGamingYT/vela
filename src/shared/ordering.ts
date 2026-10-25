import type { TabState } from './types'

export interface TabMove {
  id: string
  targetId?: string | null
  position?: 'before' | 'after'
  /** Renseigné pour déposer dans un dossier ; `null` sort du dossier. */
  groupId?: string | null
}

/**
 * Déplace un onglet dans l'ordre global (l'ordre relatif de chaque espace et
 * de chaque dossier en découle) ou l'affecte à un dossier.
 *
 * Un onglet épinglé ne rejoint jamais un dossier et ne se mélange pas aux
 * onglets non épinglés. Retourne le tableau d'origine si le déplacement est
 * impossible.
 */
export function moveTab(tabs: TabState[], move: TabMove): TabState[] {
  const tab = tabs.find((item) => item.id === move.id)
  if (!tab) return tabs
  const rest = tabs.filter((item) => item.id !== move.id)

  if (move.targetId) {
    const target = rest.find((item) => item.id === move.targetId)
    if (!target || target.spaceId !== tab.spaceId || target.pinned !== tab.pinned) return tabs
    tab.groupId = target.pinned ? null : (target.groupId ?? null)
    const index = rest.findIndex((item) => item.id === target.id)
    rest.splice(move.position === 'after' ? index + 1 : index, 0, tab)
    return rest
  }

  if (move.groupId !== undefined) {
    tab.groupId = tab.pinned ? null : (move.groupId ?? null)
    let insertAt = -1
    rest.forEach((item, index) => {
      if (item.spaceId === tab.spaceId) insertAt = index
    })
    if (insertAt === -1) rest.push(tab)
    else rest.splice(insertAt + 1, 0, tab)
    return rest
  }

  return tabs
}
