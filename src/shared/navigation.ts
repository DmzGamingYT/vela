/**
 * Règle d'ouverture des demandes de fenêtres web.
 * - `new-window` (window.open / popup OAuth « Se connecter avec Google ») :
 *   vraie fenêtre popup avec opener intact, sinon le flux OAuth ne revient jamais.
 * - `foreground-tab` / `background-tab` (liens, target=_blank) : nouvel onglet Vela.
 * - `save-to-disk`, `other`, `default` sans URL http : refusé par l'appelant.
 */
export function shouldOpenAsPopup(disposition: string): boolean {
  return disposition === 'new-window'
}
