/* Azimut — accueil : l’aperçu clair/sombre de la capture. */

;(() => {
  const stage = document.querySelector('[data-stage]')
  const stageLabel = document.querySelector('[data-stage-label]')
  const stageButtons = [...document.querySelectorAll('[data-stage-theme]')]

  if (!stage || !stageButtons.length) return

  const labels = { light: 'Accueil, thème clair', dark: 'Accueil, thème sombre' }

  const paint = (theme) => {
    stage.classList.toggle('is-dark', theme === 'dark')
    for (const button of stageButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.stageTheme === theme))
    }
    if (stageLabel) stageLabel.textContent = labels[theme] ?? labels.light
  }

  for (const button of stageButtons) {
    button.addEventListener('click', () => paint(button.dataset.stageTheme))
    button.addEventListener('mouseenter', () => paint(button.dataset.stageTheme))
  }

  paint('light')
})()

/* Azimut — accueil : les trois gestes, une capture à la fois. */

;(() => {
  const tabs = [...document.querySelectorAll('[data-geste-tab]')]
  const panels = [...document.querySelectorAll('[data-geste-panel]')]

  if (!tabs.length || !panels.length) return

  const paint = (name) => {
    for (const tab of tabs) {
      const actif = tab.dataset.gesteTab === name
      tab.setAttribute('aria-selected', String(actif))
      tab.tabIndex = actif ? 0 : -1
    }
    for (const panel of panels) {
      panel.hidden = panel.dataset.gestePanel !== name
    }
  }

  tabs.forEach((tab, rang) => {
    tab.addEventListener('click', () => paint(tab.dataset.gesteTab))
    tab.addEventListener('keydown', (event) => {
      const dernier = tabs.length - 1
      let cible = null
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight')
        cible = tabs[rang === dernier ? 0 : rang + 1]
      else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft')
        cible = tabs[rang === 0 ? dernier : rang - 1]
      else if (event.key === 'Home') cible = tabs[0]
      else if (event.key === 'End') cible = tabs[dernier]
      if (!cible) return
      event.preventDefault()
      paint(cible.dataset.gesteTab)
      cible.focus()
    })
  })
})()

/* Azimut — accueil : la palette de navigation (⌘K).

   Elle n’a pas de liste propre : elle indexe ce que la page contient déjà —
   les sections de `main` et les trois tuiles de téléchargement. Une section
   ajoutée demain y entre toute seule.

   Le clavier est le chemin principal : ⌘K (ou Ctrl+K) ouvre, ↑ ↓ parcourent,
   Entrée ouvre le résultat, Échap ferme. Le <dialog> natif s’occupe du piège
   à focus et du retour du focus sur le bouton d’ouverture. */

;(() => {
  const dialog = document.querySelector('#palette')
  const input = document.querySelector('#palette-input')
  const list = document.querySelector('#palette-list')
  const empty = document.querySelector('[data-palette-empty]')

  if (!dialog || !input || !list || typeof dialog.showModal !== 'function') return

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
  const plier = (texte) =>
    texte
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()

  /* --- L’index ------------------------------------------------------------ */

  const entrees = []

  const sections = [...document.querySelectorAll('main > section')]
  sections.forEach((section, rang) => {
    const titre = section.querySelector('h1, h2')
    const chapeau = section.querySelector('.sec-index')
    // Le héros n’a pas de chapeau : il s’appelle « Haut de page », et c’est
    // sa surcouche qui le décrit.
    const nom = (
      (rang === 0 ? 'Haut de page' : chapeau?.textContent) ||
      titre?.textContent ||
      section.getAttribute('aria-label') ||
      ''
    ).trim()
    if (!nom) return
    const detail = rang === 0
      ? (section.querySelector('.hero-kicker')?.textContent.trim() ?? '')
      : chapeau && titre
        ? titre.textContent.trim()
        : ''
    entrees.push({ genre: 'Section', nom, detail, section })
  })

  for (const tuile of document.querySelectorAll('.dl-tile')) {
    const os = tuile.querySelector('.dl-os')?.textContent.trim()
    if (!os) continue
    const note = tuile.querySelector('.dl-os-note')?.textContent.trim() || ''
    // La tuile détaille « 224,9 Mo · universel » : la palette ne garde que le poids.
    const poids = tuile.querySelector('.dl-file-meta')?.textContent.split(' · ')[0].trim() || ''
    entrees.push({
      genre: 'Téléchargement',
      nom: os,
      detail: [note, poids].filter(Boolean).join(' · '),
      tuile
    })
  }

  for (const entree of entrees) {
    entree.fouille = plier(`${entree.nom} ${entree.detail} ${entree.genre}`)
  }

  /* --- Le rendu ----------------------------------------------------------- */

  let filtres = []
  let actif = 0

  const surligner = (rang) => {
    if (!filtres.length) return
    actif = Math.min(Math.max(rang, 0), filtres.length - 1)
    for (const option of list.children) {
      option.setAttribute('aria-selected', String(Number(option.dataset.rang) === actif))
    }
    input.setAttribute('aria-activedescendant', `palette-opt-${actif}`)
    list.children[actif]?.scrollIntoView({ block: 'nearest' })
  }

  const dessiner = (requete) => {
    const mots = plier(requete).split(' ').filter(Boolean)
    filtres = entrees.filter((entree) => mots.every((mot) => entree.fouille.includes(mot)))

    list.replaceChildren(
      ...filtres.map((entree, rang) => {
        const option = document.createElement('li')
        option.className = 'palette-item'
        option.id = `palette-opt-${rang}`
        option.dataset.rang = String(rang)
        option.setAttribute('role', 'option')
        option.setAttribute('aria-selected', 'false')

        const nom = document.createElement('span')
        nom.className = 'palette-item-nom'
        nom.textContent = entree.nom

        const detail = document.createElement('span')
        detail.className = 'palette-item-meta'
        detail.textContent = entree.detail

        const genre = document.createElement('span')
        genre.className = 'palette-item-genre'
        genre.textContent = entree.genre

        option.append(nom, detail, genre)
        return option
      })
    )

    const vide = filtres.length === 0
    empty.hidden = !vide
    list.hidden = vide
    input.setAttribute('aria-expanded', String(!vide))
    actif = 0
    if (!vide) surligner(0)
    else input.setAttribute('aria-activedescendant', '')
  }

  /* --- Ouvrir un résultat ------------------------------------------------- */

  const aller = (entree) => {
    if (!entree) return
    dialog.close()

    const comportement = reduce.matches ? 'auto' : 'smooth'
    const zone = entree.section || entree.tuile
    zone.scrollIntoView({ behavior: comportement, block: 'start' })

    let cible = null
    if (entree.tuile) {
      const details = entree.tuile.querySelector('details')
      if (details) details.open = true
      cible = entree.tuile.querySelector('.dl-cta')
    } else {
      cible = entree.section.querySelector('h1, h2')
      if (cible) cible.setAttribute('tabindex', '-1')
      if (entree.section.id) history.replaceState(null, '', `#${entree.section.id}`)
    }

    if (cible) setTimeout(() => cible.focus({ preventScroll: true }), 0)
  }

  /* --- Le clavier --------------------------------------------------------- */

  const ouvrir = () => {
    if (dialog.open) return
    input.value = ''
    dessiner('')
    dialog.showModal()
    input.focus()
  }

  const fermer = () => {
    if (dialog.open) dialog.close()
  }

  for (const bouton of document.querySelectorAll('[data-palette-open]')) {
    bouton.addEventListener('click', ouvrir)
  }

  dialog.querySelector('[data-palette-close]')?.addEventListener('click', fermer)

  dialog.addEventListener('close', () => {
    input.value = ''
  })

  // Un clic sur le fond du dialogue (hors du panneau) ferme.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) fermer()
  })

  document.addEventListener('keydown', (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return
    if (event.key.toLowerCase() !== 'k') return
    event.preventDefault()
    if (dialog.open) fermer()
    else ouvrir()
  })

  input.addEventListener('input', () => dessiner(input.value))

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      surligner(actif + 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      surligner(actif - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      surligner(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      surligner(filtres.length - 1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      aller(filtres[actif])
    }
  })

  list.addEventListener('mousemove', (event) => {
    const option = event.target.closest('.palette-item')
    if (option) surligner(Number(option.dataset.rang))
  })

  list.addEventListener('click', (event) => {
    const option = event.target.closest('.palette-item')
    if (option) aller(filtres[Number(option.dataset.rang)])
  })
})()
