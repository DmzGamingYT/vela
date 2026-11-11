/**
 * Élément à refocaliser quand une surface modale se ferme.
 *
 * Il doit être lu **avant** que le fond ne passe en `inert` : une image plus
 * tard, le navigateur a déjà rendu le focus au `body` et la feuille n'a plus
 * personne à qui le rendre. Un panneau déjà ouvert garde son déclencheur
 * d'origine, sinon on rendrait le focus à un élément de la feuille sortante.
 */
export function captureTrigger(previous: HTMLElement | null): HTMLElement | null {
  if (previous) return previous
  const active = typeof document === 'undefined' ? null : document.activeElement
  return active instanceof HTMLElement && active !== document.body ? active : null
}
