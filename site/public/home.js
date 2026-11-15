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
