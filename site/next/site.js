/* Vela — site. Thème, teinte d’accent, menu, plateforme, apparitions. */

;(() => {
  const root = document.documentElement

  /* --- Thème clair / sombre ---------------------------------------------- */

  const toggle = document.querySelector('[data-theme-toggle]')
  const paintTheme = () => {
    const dark = root.dataset.theme === 'dark'
    if (!toggle) return
    toggle.setAttribute('aria-pressed', String(dark))
    toggle.setAttribute('aria-label', dark ? 'Passer au thème clair' : 'Passer au thème sombre')
  }

  if (toggle) {
    toggle.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark'
      root.dataset.theme = next
      try {
        localStorage.setItem('vela-theme', next)
      } catch (error) {
        /* stockage indisponible : le choix vaut pour la page */
      }
      paintTheme()
    })
  }
  paintTheme()

  /* --- Teinte d’accent --------------------------------------------------- */

  const swatches = [...document.querySelectorAll('[data-accent]')]
  const stored = root.style.getPropertyValue('--accent').trim().toLowerCase()
  const markAccent = () => {
    const current = root.style.getPropertyValue('--accent').trim().toLowerCase()
    for (const swatch of swatches) {
      swatch.setAttribute('aria-pressed', String(swatch.dataset.accent === current))
    }
  }

  if (swatches.length) {
    if (stored) {
      root.style.setProperty('--accent', stored)
    }
    markAccent()
    for (const swatch of swatches) {
      swatch.addEventListener('click', () => {
        root.style.setProperty('--accent', swatch.dataset.accent)
        try {
          localStorage.setItem('vela-site-accent', swatch.dataset.accent)
        } catch (error) {
          /* stockage indisponible : le choix vaut pour la page */
        }
        markAccent()
      })
    }
  }

  /* --- Menu des petites largeurs ----------------------------------------- */

  const nav = document.querySelector('.nav')
  const navToggle = document.querySelector('.nav-toggle')

  if (nav && navToggle) {
    navToggle.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open')
      navToggle.setAttribute('aria-expanded', String(open))
      navToggle.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu')
    })
    nav.addEventListener('click', (event) => {
      if (event.target.closest('a')) {
        nav.classList.remove('is-open')
        navToggle.setAttribute('aria-expanded', 'false')
        navToggle.setAttribute('aria-label', 'Ouvrir le menu')
      }
    })
  }

  /* --- Plateforme du visiteur -------------------------------------------- */

  const platform = (() => {
    const data = navigator.userAgentData
    const name = (data && data.platform) || navigator.platform || ''
    if (/mac/i.test(name)) return 'mac'
    if (/win/i.test(name)) return 'win'
    if (/linux/i.test(name)) return 'linux'
    return 'other'
  })()

  const FILES = {
    mac: {
      label: 'Télécharger pour macOS',
      href: 'https://github.com/DmzGamingYT/vela/releases/download/v0.3.13/Vela-0.3.13-universal.dmg'
    },
    win: {
      label: 'Télécharger pour Windows',
      href: 'https://github.com/DmzGamingYT/vela/releases/download/v0.3.13/Vela-0.3.13-x64.exe'
    },
    linux: {
      label: 'Télécharger pour Linux',
      href: 'https://github.com/DmzGamingYT/vela/releases/download/v0.3.13/Vela-0.3.13-x86_64.AppImage'
    },
    other: {
      label: 'Voir les fichiers',
      href: 'https://github.com/DmzGamingYT/vela/releases/tag/v0.3.13'
    }
  }

  const choice = FILES[platform] || FILES.other
  for (const label of document.querySelectorAll('[data-platform-label]')) {
    label.textContent = choice.label
  }
  for (const link of document.querySelectorAll('[data-platform-href]')) {
    link.setAttribute('href', choice.href)
  }

  /* --- Sommaire qui suit la lecture -------------------------------------- */

  const spy = document.querySelector('[data-scroll-spy]')
  const chapters = spy ? [...spy.querySelectorAll('a')].map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean) : []

  if (spy && chapters.length && 'IntersectionObserver' in window) {
    const links = new Map(chapters.map((chapter) => [chapter.id, spy.querySelector(`a[href="#${chapter.id}"]`)]))
    const setCurrent = (id) => {
      for (const [key, link] of links) {
        if (!link) continue
        if (key === id) link.setAttribute('aria-current', 'true')
        else link.removeAttribute('aria-current')
      }
    }
    const watcher = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length) setCurrent(visible[0].target.id)
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 }
    )
    for (const chapter of chapters) watcher.observe(chapter)
  }

  /* --- Apparitions ------------------------------------------------------- */

  const targets = [...document.querySelectorAll('.reveal')]
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const show = (target) => {
    target.classList.remove('is-armed')
    target.classList.add('is-in')
  }

  if (!targets.length || reduced || !('IntersectionObserver' in window)) {
    for (const target of targets) show(target)
  } else {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          show(entry.target)
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.08 }
    )

    // Seuls les blocs sous la ligne de flottaison sont armés : ceux déjà
    // visibles s'affichent tout de suite, et un filet de sécurité rend la
    // page entière lisible si l'observateur ne se déclenche jamais.
    for (const target of targets) {
      if (target.getBoundingClientRect().top > innerHeight * 0.9) target.classList.add('is-armed')
      else show(target)
      observer.observe(target)
    }

    setTimeout(() => {
      for (const target of targets) if (target.classList.contains('is-armed')) show(target)
    }, 2600)
  }
})()
