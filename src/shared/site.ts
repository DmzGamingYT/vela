/**
 * Adresse publique de Vela, en un seul endroit.
 *
 * Le domaine de production est encore une adresse de preview Freebuff. Le jour
 * où un vrai domaine existe, changer `SITE_URL` ici suffit pour le menu, la
 * vérification de mise à jour et les raccourcis ; côté site, `site/tools/site-url.mjs`
 * réécrit les balises et le plan du site avec la même adresse.
 */

/** Origine du site, sans barre finale. */
export const SITE_URL = 'https://site-cd854ef5da03437a8f42ade87147e33d.freebuff.page'

/** Page « limites connues et signature ». */
export const SITE_FAQ_URL = `${SITE_URL}/#faq`

/** Hôte seul, pour les listes de destinations. */
export const SITE_HOST = new URL(SITE_URL).host

/** Dépôt public : versions et notes. */
export const RELEASES_URL = 'https://github.com/DmzGamingYT/vela/releases'

/** Dépôt public : rapports de bug. */
export const ISSUES_URL = 'https://github.com/DmzGamingYT/vela/issues'
