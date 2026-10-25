(() => {
  const nav = document.querySelector('.site-nav')
  const toggle = document.querySelector('.nav-toggle')
  const links = document.querySelectorAll('.nav-links a')

  // --- Thème clair / sombre ------------------------------------

  const themeToggle = document.querySelector('.theme-toggle')
  const themeColor = document.querySelector('meta[name="theme-color"]')
  const THEME_KEY = 'vela-theme'

  const applyTheme = (theme, persist) => {
    document.documentElement.dataset.theme = theme
    if (themeColor) themeColor.setAttribute('content', theme === 'light' ? '#eef2f8' : '#09090b')
    themeToggle?.setAttribute(
      'aria-label',
      theme === 'light' ? 'Passer au thème sombre' : 'Passer au thème clair'
    )
    if (!persist) return
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch (error) {
      /* stockage indisponible : le choix vaut pour la session */
    }
  }

  const storedTheme = (() => {
    try {
      return localStorage.getItem(THEME_KEY)
    } catch (error) {
      return null
    }
  })()

  applyTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark', false)

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light', true)
    })
  }

  if (!storedTheme) {
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', (event) => {
      applyTheme(event.matches ? 'light' : 'dark', false)
    })
  }

  if (nav) {
    const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 18)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
  }

  const closeMenu = () => {
    if (!nav || !toggle) return
    nav.classList.remove('is-open')
    document.body.classList.remove('menu-open')
    toggle.setAttribute('aria-expanded', 'false')
    toggle.setAttribute('aria-label', 'Ouvrir le menu')
  }

  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = !nav.classList.contains('is-open')
      nav.classList.toggle('is-open', open)
      document.body.classList.toggle('menu-open', open)
      toggle.setAttribute('aria-expanded', String(open))
      toggle.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu')
    })

    links.forEach((link) => link.addEventListener('click', closeMenu))

    document.addEventListener('click', (event) => {
      if (!nav.contains(event.target)) closeMenu()
    })

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu()
    })

    window.addEventListener('resize', () => {
      if (window.innerWidth > 920) closeMenu()
    })
  }

  // --- Onglets de l’aperçu -------------------------------------

  const demoTabs = Array.from(document.querySelectorAll('.demo-tab'))
  const scenes = Array.from(document.querySelectorAll('.scene'))

  const activateDemo = (tab) => {
    if (!tab) return
    const mode = tab.dataset.mode
    demoTabs.forEach((item) => {
      const selected = item === tab
      item.classList.toggle('is-active', selected)
      item.setAttribute('aria-selected', String(selected))
      item.tabIndex = selected ? 0 : -1
    })
    scenes.forEach((scene) => {
      scene.hidden = scene.id !== `scene-${mode}`
    })
  }

  demoTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateDemo(tab))
    tab.addEventListener('keydown', (event) => {
      const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
      if (!keys.includes(event.key)) return
      event.preventDefault()
      let next = index
      if (event.key === 'ArrowLeft') next = (index - 1 + demoTabs.length) % demoTabs.length
      if (event.key === 'ArrowRight') next = (index + 1) % demoTabs.length
      if (event.key === 'Home') next = 0
      if (event.key === 'End') next = demoTabs.length - 1
      demoTabs[next].focus()
      activateDemo(demoTabs[next])
    })
  })

  if (demoTabs.length && scenes.length) activateDemo(demoTabs[0])

  // --- Note de version -----------------------------------------

  const dialog = document.getElementById('release-dialog')

  if (dialog) {
    document.querySelectorAll('[data-open-release]').forEach((button) => {
      button.addEventListener('click', () => {
        if (typeof dialog.showModal === 'function') dialog.showModal()
        else dialog.setAttribute('open', '')
      })
    })

    document.querySelectorAll('[data-close-release]').forEach((button) => {
      button.addEventListener('click', () => dialog.close())
    })

    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close()
    })

    // Secours : les navigateurs sans showModal n'ont ni Échap natif ni backdrop.
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && dialog.hasAttribute('open')) dialog.close()
    })
  }

  // --- Révélation au défilement --------------------------------

  const reveal = document.querySelectorAll('[data-reveal]')

  const inViewport = (element) => {
    const rect = element.getBoundingClientRect()
    return rect.top < window.innerHeight && rect.bottom > 0
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.classList.add('is-in')
          observer.unobserve(entry.target)
        })
      },
      { threshold: 0.08, rootMargin: '0px 0px -6% 0px' }
    )
    reveal.forEach((element) => {
      if (inViewport(element)) element.classList.add('is-in')
      else observer.observe(element)
    })
  } else {
    reveal.forEach((element) => element.classList.add('is-in'))
  }

  document.documentElement.setAttribute('data-reveal-ready', '')

  // --- Navigation active ---------------------------------------

  const watched = Array.from(document.querySelectorAll('main section[id]'))
  const navLinks = Array.from(document.querySelectorAll('.nav-links a'))
  const navIds = new Set(navLinks.map((link) => link.getAttribute('href')?.slice(1)))

  if ('IntersectionObserver' in window) {
    const navObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || !navIds.has(entry.target.id)) return
          navLinks.forEach((link) => {
            const current = link.getAttribute('href') === `#${entry.target.id}`
            if (current) link.setAttribute('aria-current', 'true')
            else link.removeAttribute('aria-current')
          })
        })
      },
      { rootMargin: '-36% 0px -55% 0px', threshold: 0 }
    )
    watched.forEach((section) => navObserver.observe(section))
  }

  // --- Reflet qui suit le curseur ------------------------------

  if (window.matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('.glass-card').forEach((card) => {
      card.addEventListener('pointermove', (event) => {
        const rect = card.getBoundingClientRect()
        const x = ((event.clientX - rect.left) / rect.width) * 100
        const y = ((event.clientY - rect.top) / rect.height) * 100
        card.style.setProperty('--mx', `${x}%`)
        card.style.setProperty('--my', `${y}%`)
      })
      card.addEventListener('pointerleave', () => {
        card.style.removeProperty('--mx')
        card.style.removeProperty('--my')
      })
    })
  }
})()
