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
    const closeNav = () => {
      if (!nav.classList.contains('is-open')) return
      nav.classList.remove('is-open')
      navToggle.setAttribute('aria-expanded', 'false')
      navToggle.setAttribute('aria-label', 'Ouvrir le menu')
    }

    navToggle.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open')
      navToggle.setAttribute('aria-expanded', String(open))
      navToggle.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu')
      if (open) nav.querySelector('a')?.focus()
    })

    nav.addEventListener('click', (event) => {
      if (event.target.closest('a')) closeNav()
    })

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && nav.classList.contains('is-open')) {
        closeNav()
        navToggle.focus()
      }
    })

    document.addEventListener('click', (event) => {
      if (!nav.classList.contains('is-open')) return
      if (event.target.closest('.nav, .nav-toggle')) return
      closeNav()
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

  const RELEASE = 'https://github.com/DmzGamingYT/vela/releases'
  const download = (file) => `${RELEASE}/download/v0.3.22/${file}`

  const FILES = {
    // Le DMG universel reste le choix sûr tant qu’on ne connaît pas l’architecture.
    mac: {
      label: 'Télécharger pour macOS',
      size: 'Apple silicon et Intel · 225,9 Mo',
      href: download('Vela-0.3.22-universal.dmg')
    },
    macArm: {
      label: 'Télécharger pour macOS',
      size: 'Apple silicon · 122,2 Mo',
      href: download('Vela-0.3.22-arm64.dmg')
    },
    macIntel: {
      label: 'Télécharger pour macOS',
      size: 'Intel · 129,4 Mo',
      href: download('Vela-0.3.22-x64.dmg')
    },
    win: {
      label: 'Télécharger pour Windows',
      size: 'x64 · 122,1 Mo',
      href: download('Vela-0.3.22-x64.exe')
    },
    linux: {
      label: 'Télécharger pour Linux',
      size: 'AppImage · 126,7 Mo',
      href: download('Vela-0.3.22-x86_64.AppImage')
    },
    other: {
      label: 'Voir les fichiers',
      size: 'macOS, Windows, Linux · un fichier par plateforme',
      href: `${RELEASE}/tag/v0.3.22`
    }
  }

  const applyChoice = (choice) => {
    for (const label of document.querySelectorAll('[data-platform-label]')) {
      label.textContent = choice.label
    }
    for (const link of document.querySelectorAll('[data-platform-href]')) {
      link.setAttribute('href', choice.href)
    }
    for (const size of document.querySelectorAll('[data-platform-size]')) {
      size.textContent = choice.size
    }
  }

  applyChoice(FILES[platform] || FILES.other)

  // Sur un Mac, distinguer Apple silicon d’Intel évite 100 Mo de téléchargement.
  // L’API n’existe que dans les navigateurs Chromium : ailleurs, le DMG universel reste.
  if (platform === 'mac' && navigator.userAgentData?.getHighEntropyValues) {
    navigator.userAgentData
      .getHighEntropyValues(['architecture'])
      .then(({ architecture }) => {
        if (architecture === 'arm') applyChoice(FILES.macArm)
        else if (architecture === 'x86') applyChoice(FILES.macIntel)
      })
      .catch(() => {
        /* architecture inconnue : le DMG universel convient */
      })
  }

  /* --- Empreintes SHA-256 ------------------------------------------------ */

  const copyStatus = document.querySelector('[data-copy-status]')

  const copy = async (value) => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value)
        return
      } catch (error) {
        /* fenêtre non focalisée ou permission refusée : on tente la sélection */
      }
    }
    const field = document.createElement('textarea')
    field.value = value
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.top = '0'
    field.style.opacity = '0'
    document.body.append(field)
    field.select()
    const ok = document.execCommand('copy')
    field.remove()
    if (!ok) throw new Error('copie refusée')
  }

  for (const button of document.querySelectorAll('[data-copy]')) {
    const original = button.getAttribute('aria-label')
    button.addEventListener('click', async () => {
      try {
        await copy(button.dataset.copy)
      } catch (error) {
        if (copyStatus)
          copyStatus.textContent = 'Copie impossible : sélectionnez l’empreinte à la main.'
        return
      }
      button.classList.add('is-copied')
      button.setAttribute('aria-label', 'Empreinte copiée')
      if (copyStatus) copyStatus.textContent = 'Empreinte SHA-256 copiée dans le presse-papiers.'
      setTimeout(() => {
        button.classList.remove('is-copied')
        if (original) button.setAttribute('aria-label', original)
      }, 1800)
    })
  }

  /* --- Sommaire qui suit la lecture -------------------------------------- */

  const spy = document.querySelector('[data-scroll-spy]')
  const chapters = spy
    ? [...spy.querySelectorAll('a')]
        .map((a) => document.querySelector(a.getAttribute('href')))
        .filter(Boolean)
    : []

  if (spy && chapters.length && 'IntersectionObserver' in window) {
    const links = new Map(
      chapters.map((chapter) => [chapter.id, spy.querySelector(`a[href="#${chapter.id}"]`)])
    )
    const setCurrent = (id) => {
      for (const [key, link] of links) {
        if (!link) continue
        if (key === id) link.setAttribute('aria-current', 'true')
        else link.removeAttribute('aria-current')
      }
    }
    const onScreen = new Map()
    const watcher = new IntersectionObserver(
      (received) => {
        // Un callback ne livre que les sections qui viennent de changer :
        // on garde donc l’écran en mémoire, sinon le sommaire s’accroche à la
        // section qui a bougé en dernier plutôt qu’à la plus haute visible.
        for (const entry of received) onScreen.set(entry.target, entry.isIntersecting)
        const visible = chapters.filter((chapter) => onScreen.get(chapter))
        if (visible.length) setCurrent(visible[0].id)
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 }
    )
    for (const chapter of chapters) watcher.observe(chapter)
  }

  /* --- Filtres du journal des versions ----------------------------------- */

  const journal = document.querySelector('.journal')

  if (journal) {
    const filtres = journal.querySelector('.filtres')
    const chips = [...journal.querySelectorAll('[data-filtre]')]
    const entries = [...journal.querySelectorAll('.timeline > li')]
    const counter = journal.querySelector('.filtres-compteur')
    const links = new Map(
      entries.map((entry) => [
        entry,
        journal.querySelector(`.journal-index a[href="#${entry.id}"]`)
      ])
    )
    // Les étiquettes déjà écrites sous chaque titre sont la source du filtre :
    // rien à entretenir deux fois quand une version parait.
    const tagsOf = (entry) =>
      [...entry.querySelectorAll('.tags span')].map((tag) => tag.textContent.trim().toLowerCase())
    const wanted = () =>
      chips
        .filter((chip) => chip.getAttribute('aria-pressed') === 'true')
        .map((chip) => chip.dataset.filtre.toLowerCase())

    const apply = () => {
      const themes = wanted()
      let shown = 0
      for (const entry of entries) {
        const match = !themes.length || themes.some((theme) => tagsOf(entry).includes(theme))
        entry.hidden = !match
        const link = links.get(entry)
        if (link) link.hidden = !match
        if (match) shown += 1
      }
      if (counter) {
        if (!themes.length) counter.textContent = `${entries.length} versions`
        else counter.textContent = `${shown} version${shown > 1 ? 's' : ''} sur ${entries.length}`
      }
      if (!themes.length) return
      // Le sommaire ne doit pas rester braqué sur une version filtrée.
      const first = entries.find((entry) => !entry.hidden)
      for (const [, link] of links) if (link) link.removeAttribute('aria-current')
      if (first && links.get(first)) links.get(first).setAttribute('aria-current', 'true')
    }

    // Le sommaire défile horizontalement en mobile : un dégradé sur le bord
    // droit annonce la suite et s’efface quand on a atteint la dernière version.
    const sommaire = journal.querySelector('.journal-index')
    if (sommaire) {
      const majBord = () => {
        const defile = sommaire.scrollWidth > sommaire.clientWidth + 1
        sommaire.classList.toggle('is-scrollable', defile)
        sommaire.classList.toggle(
          'at-end',
          defile && sommaire.scrollLeft + sommaire.clientWidth >= sommaire.scrollWidth - 2
        )
      }
      sommaire.addEventListener('scroll', majBord, { passive: true })
      window.addEventListener('resize', majBord)
      majBord()
    }

    // Sans script les puces restent cachées : mieux vaut aucune commande
    // qu’une commande que rien n’exécute.
    if (filtres) filtres.hidden = false
    for (const chip of chips) {
      chip.addEventListener('click', () => {
        chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true'))
        apply()
      })
    }
    apply()
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

  /* --- La fenêtre prend la lumière --------------------------------------- */

  // Trois degrés au plus, seulement sur un vrai pointeur : au doigt il n’y a
  // pas de survol, et sous « Réduire les animations » la capture reste droite.
  const fenetre = document.querySelector('.window')
  const immobile = matchMedia('(prefers-reduced-motion: reduce)')
  const pointeurFin = matchMedia('(pointer: fine)')

  if (fenetre && !immobile.matches && pointeurFin.matches) {
    let x = 0
    let y = 0
    let cadre = 0

    const poser = () => {
      cadre = 0
      fenetre.style.setProperty('--ty', `${(x * 5).toFixed(2)}deg`)
      fenetre.style.setProperty('--tx', `${(-y * 3.4).toFixed(2)}deg`)
    }

    const suivre = (event) => {
      if (event.pointerType !== 'mouse') return
      const boite = fenetre.getBoundingClientRect()
      x = (event.clientX - boite.left) / boite.width - 0.5
      y = (event.clientY - boite.top) / boite.height - 0.5
      fenetre.classList.add('is-tilting')
      if (!cadre) cadre = requestAnimationFrame(poser)
    }

    const reposer = () => {
      x = 0
      y = 0
      fenetre.classList.remove('is-tilting')
      if (!cadre) cadre = requestAnimationFrame(poser)
    }

    fenetre.addEventListener('pointermove', suivre, { passive: true })
    fenetre.addEventListener('pointerleave', reposer)
  }
})()
