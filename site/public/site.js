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
      } catch {
        /* stockage indisponible : le choix vaut pour la page */
      }
      paintTheme()
    })
  }
  paintTheme()

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
  const download = (file) => `${RELEASE}/download/v0.3.31/${file}`

  const FILES = {
    // Le DMG universel reste le choix sûr tant qu’on ne connaît pas l’architecture.
    mac: {
      label: 'Télécharger pour macOS',
      file: 'Vela-0.3.31-universal.dmg',
      size: 'Apple silicon et Intel · 224,3 Mo',
      href: download('Vela-0.3.31-universal.dmg')
    },
    macArm: {
      label: 'Télécharger pour macOS',
      file: 'Vela-0.3.31-arm64.dmg',
      size: 'Apple silicon · 120,5 Mo',
      href: download('Vela-0.3.31-arm64.dmg')
    },
    macIntel: {
      label: 'Télécharger pour macOS',
      file: 'Vela-0.3.31-x64.dmg',
      size: 'Intel non testé · 127,8 Mo',
      href: download('Vela-0.3.31-x64.dmg')
    },
    win: {
      label: 'Télécharger pour Windows',
      file: 'Vela-0.3.31-x64.exe',
      size: 'x64 · 122,1 Mo',
      href: download('Vela-0.3.31-x64.exe')
    },
    linux: {
      label: 'Télécharger pour Linux',
      file: 'Vela-0.3.31-x86_64.AppImage',
      size: 'AppImage · 126,8 Mo',
      href: download('Vela-0.3.31-x86_64.AppImage')
    },
    other: {
      label: 'Voir les fichiers',
      file: 'Vela-0.3.31',
      size: 'macOS, Windows, Linux · un fichier par plateforme',
      href: `${RELEASE}/tag/v0.3.31`
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
    for (const file of document.querySelectorAll('[data-platform-file]')) {
      file.textContent = choice.file
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

  /* --- Raccourcis : un affichage par système ------------------------------ */

  const SYSTEMES = ['mac', 'win', 'linux']
  const TOUCHES = {
    mac: { mod: '⌘', shift: '⇧', alt: '⌥', plus: '+', sep: '' },
    win: { mod: 'Ctrl', shift: 'Maj', alt: 'Alt', plus: '+', sep: '+' },
    linux: { mod: 'Ctrl', shift: 'Maj', alt: 'Alt', plus: '+', sep: '+' }
  }

  // Le visiteur voit d’abord les touches de son système ; le sélecteur garde
  // son choix d’une page à l’autre, pour lire les raccourcis d’un autre poste.
  const systemeDetecte = platform === 'mac' || platform === 'win' || platform === 'linux' ? platform : 'mac'
  let systeme = systemeDetecte
  try {
    const garde = localStorage.getItem('vela-keys')
    if (SYSTEMES.includes(garde)) systeme = garde
  } catch {
    /* stockage indisponible : le système détecté suffit */
  }

  const rendreTouche = (jeton, os) => {
    const touches = TOUCHES[os]
    return jeton
      .split('+')
      .map((part) => touches[part] ?? (part.length === 1 ? part.toUpperCase() : part))
      .join(touches.sep)
  }

  const peindreTouches = () => {
    root.dataset.os = systeme
    for (const element of document.querySelectorAll('[data-key]')) {
      element.textContent = rendreTouche(element.dataset.key, systeme)
    }
    for (const bouton of document.querySelectorAll('[data-keys-switch] [data-os]')) {
      bouton.setAttribute('aria-pressed', String(bouton.dataset.os === systeme))
    }
    // L’aide ne garde que le pas-à-pas du système choisi.
    for (const bloc of document.querySelectorAll('[data-os-block]')) {
      bloc.hidden = bloc.dataset.osBlock !== systeme
    }
  }

  for (const bouton of document.querySelectorAll('[data-keys-switch] [data-os]')) {
    bouton.addEventListener('click', () => {
      if (!SYSTEMES.includes(bouton.dataset.os)) return
      systeme = bouton.dataset.os
      try {
        localStorage.setItem('vela-keys', systeme)
      } catch {
        /* stockage indisponible : le choix vaut pour la page */
      }
      peindreTouches()
    })
  }

  // Les liens du sommaire de l’aide choisissent le système avant de défiler :
  // sinon ils viseraient un bloc masqué.
  for (const lien of document.querySelectorAll('a[href="#macos"], a[href="#windows"], a[href="#linux"]')) {
    lien.addEventListener('click', (event) => {
      const ancre = lien.getAttribute('href').slice(1)
      event.preventDefault()
      systeme = ancre === 'macos' ? 'mac' : ancre === 'windows' ? 'win' : 'linux'
      try {
        localStorage.setItem('vela-keys', systeme)
      } catch {
        /* stockage indisponible : le choix vaut pour la page */
      }
      peindreTouches()
      document.getElementById(ancre)?.scrollIntoView({ block: 'start' })
    })
  }

  peindreTouches()

  /* --- Empreintes SHA-256 ------------------------------------------------ */

  const copyStatus = document.querySelector('[data-copy-status]')

  const copy = async (value) => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value)
        return
      } catch {
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
      } catch {
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

  /* --- Informations de diagnostic ---------------------------------------- */

  const diagnostic = document.querySelector('[data-diagnostics]')

  if (diagnostic) {
    diagnostic.addEventListener('click', async () => {
      const texte = [
        'Vela 0.3.31',
        `Système : ${navigator.userAgentData?.platform || navigator.platform || 'inconnu'}`,
        `Langue : ${navigator.language}`,
        `Page : ${location.href}`,
        `Navigateur : ${navigator.userAgent}`,
        `Date : ${new Date().toISOString()}`
      ].join('\n')
      try {
        await copy(texte)
      } catch {
        if (copyStatus) copyStatus.textContent = 'Copie impossible : sélectionnez le texte à la main.'
        return
      }
      diagnostic.classList.add('is-copied')
      diagnostic.textContent = 'Informations copiées'
      if (copyStatus) copyStatus.textContent = 'Informations de diagnostic copiées dans le presse-papiers.'
      setTimeout(() => {
        diagnostic.classList.remove('is-copied')
        diagnostic.textContent = 'Copier les informations de diagnostic'
      }, 2200)
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

  // Un onglet masqué (aperçu intégré, arrière-plan) est throttlé par le
  // navigateur : ses transitions seraient saccadées ou jamais terminées.
  // On affiche alors le contenu directement, sans armer les blocs.
  if (
    !targets.length ||
    reduced ||
    document.visibilityState === 'hidden' ||
    !('IntersectionObserver' in window)
  ) {
    for (const target of targets) show(target)
  } else {
    let hasIntersected = false
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          hasIntersected = true
          show(entry.target)
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.08 }
    )

    // Seuls les blocs sous la ligne de flottaison sont armés : ceux déjà
    // visibles s'affichent tout de suite.
    for (const target of targets) {
      if (target.getBoundingClientRect().top > innerHeight * 0.9) target.classList.add('is-armed')
      else show(target)
      observer.observe(target)
    }

    // Filet de sécurité si l'observateur n'a jamais rien révélé. Il affiche
    // sans transition : animer dix grosses sections hors écran d'un coup
    // produisait une rafale de peinture au chargement.
    setTimeout(() => {
      if (hasIntersected) return
      for (const target of targets) {
        if (!target.classList.contains('is-armed')) continue
        target.style.transition = 'none'
        show(target)
      }
    }, 2600)
  }

})()
