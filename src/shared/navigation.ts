/**
 * Règle d'ouverture des demandes de fenêtres web.
 *
 * Relevé des dispositions réellement émises par Chromium sur macOS (sonde sur
 * l'app, page locale) :
 *
 * | Geste sur un lien | disposition | features |
 * | --- | --- | --- |
 * | ⌘ + clic | `background-tab` | vide |
 * | ⌘⇧ + clic | `foreground-tab` | vide |
 * | ⇧ + clic | `new-window` | vide |
 * | ⌘⌥ + clic (Little Arc d'Arc) | `other` | vide |
 * | `window.open(url)` | `foreground-tab` | vide |
 * | `window.open(url, nom, « width=… »)` | `new-window` | non vides |
 * | ⌥ + clic | aucune : Chromium télécharge le lien |
 *
 * Une vraie popup de site (fenêtre OAuth) arrive donc en `new-window` **avec**
 * des features : c'est ce qui la distingue d'un ⇧ + clic, qui n'en a pas.
 */
export function shouldOpenAsPopup(disposition: string, features = ''): boolean {
  return disposition === 'new-window' && features.trim() !== ''
}

/**
 * Gestes qui ouvrent la petite fenêtre jetable plutôt qu'un onglet : ⌘⌥ + clic
 * (le geste d'Arc pour Little Arc) et ⇧ + clic, que Vela dirigera vers la même
 * petite fenêtre tant qu'il n'a pas de volet d'aperçu dans la page.
 */
export function opensMiniWindow(disposition: string, features = ''): boolean {
  return disposition === 'other' || (disposition === 'new-window' && features.trim() === '')
}
