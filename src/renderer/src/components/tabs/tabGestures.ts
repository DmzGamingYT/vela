import type { DragEvent, KeyboardEvent, MouseEvent } from 'react'
import type { TabView } from '@shared/types'

/**
 * Gestes d'une ligne d'onglet : glisser, menu contextuel, réordonnancement au
 * clavier.
 *
 * Ils voyageaient en props de `TabRow` et `PinnedTabTile`, recréés à chaque
 * rendu de la barre latérale — `memo` ne pouvait donc rien retenir : une ligne
 * d'onglet se redessinait à chaque diffusion d'état, jusqu'à huit fois par
 * message. La barre publie ici l'implémentation du rendu courant, et ces
 * fonctions gardent leur identité d'un rendu à l'autre.
 */
export interface TabGestures {
  startDrag(event: DragEvent<HTMLElement>, tab: TabView): void
  endDrag(): void
  overTab(event: DragEvent<HTMLElement>, tab: TabView): void
  dropOnTab(event: DragEvent<HTMLElement>, tab: TabView): void
  overTile(event: DragEvent<HTMLElement>, tab: TabView): void
  dropOnTile(event: DragEvent<HTMLElement>, tab: TabView): void
  openMenu(event: MouseEvent<HTMLElement>, tab: TabView): void
  keyTile(event: KeyboardEvent<HTMLElement>, tab: TabView): void
}

function nothing(): void {
  /* aucune barre latérale montée : le geste ne fait rien */
}

const NOTHING: TabGestures = {
  startDrag: nothing,
  endDrag: nothing,
  overTab: nothing,
  dropOnTab: nothing,
  overTile: nothing,
  dropOnTile: nothing,
  openMenu: nothing,
  keyTile: nothing
}

let current: TabGestures = NOTHING

/** Appelé par la barre latérale à chaque rendu : les gestes suivent son état. */
export function bindTabGestures(next: TabGestures | null): void {
  current = next ?? NOTHING
}

/** Identité stable : c'est elle que les lignes importent et que `memo` retient. */
export const tabGestures: TabGestures = {
  startDrag: (event, tab) => current.startDrag(event, tab),
  endDrag: () => current.endDrag(),
  overTab: (event, tab) => current.overTab(event, tab),
  dropOnTab: (event, tab) => current.dropOnTab(event, tab),
  overTile: (event, tab) => current.overTile(event, tab),
  dropOnTile: (event, tab) => current.dropOnTile(event, tab),
  openMenu: (event, tab) => current.openMenu(event, tab),
  keyTile: (event, tab) => current.keyTile(event, tab)
}
