/* Vela — thème posé avant le premier rendu pour éviter le FOUC.

   Fichier séparé et non différé : le navigateur l'exécute avant de peindre le
   corps de la page, comme le script inline qu'il remplace, mais la CSP n'a plus
   besoin d'autoriser `'unsafe-inline'`.

   La teinte n'est plus réglable : c'est le corail de l'icône, posé par base.css.
   L'ancien choix enregistré sous `vela-site-accent` est simplement ignoré. */

document.documentElement.classList.add('js')

;(() => {
  let theme = 'light'
  try {
    const stored = localStorage.getItem('vela-theme')
    if (stored === 'light' || stored === 'dark') theme = stored
    else if (matchMedia('(prefers-color-scheme: dark)').matches) theme = 'dark'
  } catch {
    /* stockage indisponible : thème clair, comme l’icône */
  }
  document.documentElement.dataset.theme = theme
})()
