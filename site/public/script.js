(() => {
  const root = document.documentElement
  const THEME_KEY = 'vela-theme'
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)')

  /* --- Thème ------------------------------------------------------------- */

  const themeButton = document.querySelector('.theme')
  const themeColor = document.querySelector('meta[name="theme-color"]')

  const applyTheme = (theme, persist) => {
    root.dataset.theme = theme
    themeColor?.setAttribute('content', theme === 'light' ? '#faf8f5' : '#151518')
    themeButton?.setAttribute('aria-pressed', String(theme === 'light'))
    themeButton?.setAttribute(
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

  applyTheme(root.dataset.theme === 'light' ? 'light' : 'dark', false)

  themeButton?.addEventListener('click', () => {
    applyTheme(root.dataset.theme === 'light' ? 'dark' : 'light', true)
  })

  let stored = null
  try {
    stored = localStorage.getItem(THEME_KEY)
  } catch (error) {
    stored = null
  }

  if (!stored) {
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', (event) => {
      applyTheme(event.matches ? 'light' : 'dark', false)
    })
  }

  /* --- En-tête ----------------------------------------------------------- */

  const head = document.getElementById('head')
  const menuButton = document.querySelector('.menu-btn')
  const nav = document.getElementById('nav')

  const onScroll = () => head?.classList.toggle('is-scrolled', window.scrollY > 12)
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })

  const closeMenu = () => {
    head?.classList.remove('is-open')
    menuButton?.setAttribute('aria-expanded', 'false')
    menuButton?.setAttribute('aria-label', 'Ouvrir le menu')
  }

  menuButton?.addEventListener('click', () => {
    const open = !head?.classList.contains('is-open')
    head?.classList.toggle('is-open', open)
    menuButton.setAttribute('aria-expanded', String(open))
    menuButton.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu')
  })

  nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu))

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu()
  })

  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) closeMenu()
  })

  /* --- Téléchargement adapté à la plateforme ----------------------------- */

  const RELEASE = 'https://github.com/DmzGamingYT/vela/releases/download/v0.3.0/'
  const files = {
    mac: { href: `${RELEASE}Vela-0.3.0-arm64.dmg`, label: 'Télécharger pour macOS' },
    win: { href: `${RELEASE}Vela-0.3.0-x64.exe`, label: 'Télécharger pour Windows' },
    linux: { href: `${RELEASE}Vela-0.3.0-x86_64.AppImage`, label: 'Télécharger pour Linux' }
  }

  const platform = (() => {
    const reported = navigator.userAgentData?.platform || navigator.platform || ''
    if (/mac/i.test(reported)) return 'mac'
    if (/win/i.test(reported)) return 'win'
    if (/linux|x11/i.test(reported) && !/android/i.test(navigator.userAgent)) return 'linux'
    return null
  })()

  if (platform) {
    const target = files[platform]
    document.querySelectorAll('[data-platform-cta]').forEach((link) => {
      if (link.closest('.head-actions')) return
      link.setAttribute('href', target.href)
      const label = link.querySelector('[data-platform-label]')
      if (label) label.textContent = target.label
    })
  }

  /* --- Bascule Browse / Work --------------------------------------------- */

  const switchButtons = Array.from(document.querySelectorAll('.switch-btn'))
  const panes = {
    browse: document.querySelector('[data-pane="browse"]'),
    work: document.querySelector('[data-pane="work"]')
  }
  const steps = Array.from(document.querySelectorAll('[data-steps] li'))
  let stepTimer = 0

  const playSteps = () => {
    window.clearTimeout(stepTimer)
    steps.forEach((step) => step.classList.remove('is-live', 'is-done'))

    if (reduceMotion.matches) {
      steps.forEach((step) => step.classList.add('is-done'))
      return
    }

    const advance = (index) => {
      if (index >= steps.length) return
      steps.forEach((step) => step.classList.remove('is-live'))
      steps[index].classList.add('is-live')
      stepTimer = window.setTimeout(() => {
        steps[index].classList.remove('is-live')
        steps[index].classList.add('is-done')
        advance(index + 1)
      }, 620)
    }

    stepTimer = window.setTimeout(() => advance(0), 180)
  }

  const showMode = (mode) => {
    switchButtons.forEach((button) => {
      const on = button.dataset.mode === mode
      button.classList.toggle('is-on', on)
      button.setAttribute('aria-pressed', String(on))
    })
    Object.entries(panes).forEach(([name, pane]) => {
      if (pane) pane.hidden = name !== mode
    })
    if (mode === 'work') playSteps()
    else {
      window.clearTimeout(stepTimer)
      steps.forEach((step) => step.classList.remove('is-live', 'is-done'))
    }
  }

  switchButtons.forEach((button) => {
    button.addEventListener('click', () => showMode(button.dataset.mode))
  })

  /* --- Thèmes de couleur : aperçu vivant ---------------------------------- */

  const demo = document.querySelector('[data-demo]')
  const swatches = Array.from(document.querySelectorAll('[data-swatches] .swatch'))

  const channel = (value) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }

  const luminance = (hex) => {
    const clean = hex.replace('#', '')
    const r = parseInt(clean.slice(0, 2), 16)
    const g = parseInt(clean.slice(2, 4), 16)
    const b = parseInt(clean.slice(4, 6), 16)
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  }

  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  const inkLuminance = luminance('#17150f')

  const previewTheme = (button) => {
    swatches.forEach((item) => item.setAttribute('aria-pressed', String(item === button)))
    if (!demo) return
    const color = button.dataset.swatch
    if (!color) return
    // Même règle que dans l'app : le texte du bouton prend la teinte qui se lit
    // le mieux sur l'accent, blanc ou presque noir.
    const light = luminance(color)
    const ink = ratio(light, 1) >= ratio(light, inkLuminance) ? '#ffffff' : '#17150f'
    demo.style.setProperty('--demo', color)
    demo.style.setProperty('--demo-ink', ink)
  }

  swatches.forEach((button) => button.addEventListener('click', () => previewTheme(button)))

  /* --- Section courante dans l'en-tête ----------------------------------- */

  const navLinks = Array.from(nav?.querySelectorAll('a') ?? [])
  const sections = navLinks
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean)

  if ('IntersectionObserver' in window && sections.length) {
    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          navLinks.forEach((link) => {
            if (link.getAttribute('href') === `#${entry.target.id}`) link.setAttribute('aria-current', 'true')
            else link.removeAttribute('aria-current')
          })
        })
      },
      { rootMargin: '-42% 0px -52% 0px', threshold: 0 }
    )
    sections.forEach((section) => spy.observe(section))
  }
})()
