/**
 * Seuils de mise en page partagés entre le processus principal et la coque.
 *
 * Le processus principal possède la fenêtre (et donc sa largeur), la coque
 * possède le DOM (et donc la largeur réellement disponible pour les panneaux).
 * Les deux doivent prendre la même décision, sinon l'un installe une vue
 * scindée que l'autre refuse d'afficher.
 */

/** Largeur minimale lisible d'un panneau : en dessous, la barre d'adresse tronque tout. */
export const MIN_PANE_WIDTH = 320

/** Poignée de séparation entre les deux volets. */
export const SPLIT_HANDLE_WIDTH = 9

/** Place minimale pour deux volets côte à côte, poignée comprise. */
export const SPLIT_PANES_WIDTH = MIN_PANE_WIDTH * 2 + SPLIT_HANDLE_WIDTH

/**
 * La largeur **mesurée** du conteneur suffit-elle pour deux volets ?
 *
 * `window.innerWidth` ne suffit pas : la fenêtre a une largeur minimale de
 * 980 px, mais un tiroir (Notes/Agent) ou une barre latérale dépliée retirent
 * plusieurs centaines de pixels au workspace sans déclencher `resize`.
 * `0` signifie « pas encore mesuré » : au premier rendu on laisse passer, le
 * ResizeObserver corrige dès l'image suivante.
 */
export function panesCanSplit(width: number): boolean {
  return width <= 0 || width >= SPLIT_PANES_WIDTH
}

/**
 * Garde les deux volets au-dessus de leur largeur minimale.
 * Le ratio désigne la part du conteneur donnée au volet principal ; la poignée
 * est retirée du second volet en CSS, d'où sa prise en compte dans la borne.
 */
export function clampSplitRatio(ratio: number, width: number): number {
  if (width <= 0) return Math.min(0.75, Math.max(0.25, ratio))
  const min = Math.max(0.25, MIN_PANE_WIDTH / width)
  const max = Math.min(0.75, (width - MIN_PANE_WIDTH - SPLIT_HANDLE_WIDTH) / width)
  if (max < min) return 0.5
  return Math.min(max, Math.max(min, ratio))
}

/**
 * Largeur de fenêtre minimale pour deux panneaux : 2 × 320 px, plus le rail
 * d'espaces, la barre latérale repliée et la poignée de séparation.
 */
export const SPLIT_MIN_WIDTH = 900

/**
 * En dessous de cette largeur, la barre latérale (310 px) mange près de la
 * moitié de la fenêtre : elle se replie seule, sauf choix explicite inverse.
 */
export const AUTO_COLLAPSE_WIDTH = 900
