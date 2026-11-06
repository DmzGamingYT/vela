/* Vela — thème et teinte, posés avant le premier rendu pour éviter le FOUC.

   Fichier séparé et non différé : le navigateur l'exécute avant de peindre le
   corps de la page, comme le script inline qu'il remplace, mais la CSP n'a plus
   besoin d'autoriser `'unsafe-inline'`. */

document.documentElement.classList.add('js')

;(() => {
  let theme = 'light'
  let accent = '#5b5bd6'
  try {
    const stored = localStorage.getItem('vela-theme')
    if (stored === 'light' || stored === 'dark') theme = stored
    else if (matchMedia('(prefers-color-scheme: dark)').matches) theme = 'dark'
    const storedAccent = localStorage.getItem('vela-site-accent')
    if (storedAccent && /^#[0-9a-f]{6}$/i.test(storedAccent)) accent = storedAccent
  } catch {
    /* stockage indisponible : thème clair, indigo */
  }
  document.documentElement.dataset.theme = theme
  document.documentElement.style.setProperty('--accent', accent)
})()
