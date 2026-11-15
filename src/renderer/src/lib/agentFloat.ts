/**
 * Sous cette largeur de fenêtre, le panneau Agent flotte au-dessus de la page
 * au lieu de la pousser. La coque et le panneau doivent répondre la même
 * chose : une vue native Electron passe toujours devant le DOM, donc le
 * passage en mode flottant doit aussi retirer la page de la scène.
 *
 * Un seul seuil, une seule fonction : deux `< 900` recopiés finissent toujours
 * par diverger (l'un mesurait la fenêtre, l'autre la place restante).
 */
export const AGENT_FLOAT_WIDTH = 900

export function agentFloats(windowWidth: number): boolean {
  return windowWidth < AGENT_FLOAT_WIDTH
}
