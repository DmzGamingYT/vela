/* Azimut — accueil : aperçu clair/sombre, lecteur de démonstration, parallaxe. */

;(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')

  /* --- Aperçu de l’accueil : deux captures, un fondu ---------------------- */

  const stage = document.querySelector('[data-stage]')
  const stageLabel = document.querySelector('[data-stage-label]')
  const stageButtons = [...document.querySelectorAll('[data-stage-theme]')]

  if (stage && stageButtons.length) {
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
  }

  /* --- Démonstration : lecteur maison, sans barre native ---------------- */

  const player = document.querySelector('[data-player]')
  const video = document.querySelector('[data-demo-video]')
  const play = document.querySelector('[data-demo-play]')
  const label = document.querySelector('[data-demo-label]')
  const time = document.querySelector('[data-demo-time]')
  const progress = document.querySelector('[data-demo-progress]')

  if (player && video && play) {
    // La durée est celle de l’enregistrement : le WebM sorti d’un
    // MediaRecorder n’embarque pas d’en-tête de durée, et la barre native
    // afficherait une piste « en direct ». On la connaît, on l’écrit.
    const total = Number(player.dataset.duration) || 16.6
    const minutes = (value) => {
      const seconds = Math.max(0, Math.round(value))
      return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
    }

    const paint = () => {
      const ratio = Math.min(1, (video.currentTime || 0) / total)
      if (progress) progress.style.transform = `scaleX(${ratio})`
      if (time) time.textContent = minutes(video.currentTime || 0)
    }

    const start = () => {
      player.classList.add('is-playing')
      video.play().catch(() => player.classList.remove('is-playing'))
    }

    const pause = () => {
      video.pause()
      player.classList.remove('is-playing')
      if (label) label.textContent = 'Reprendre la démo'
      if (play) play.setAttribute('aria-label', 'Reprendre la démonstration')
    }

    play.addEventListener('click', () => (video.paused ? start() : pause()))

    // Un clic sur l’image met en pause ; le bouton reste la commande clavier.
    video.addEventListener('click', () => (video.paused ? start() : pause()))

    for (const event of ['timeupdate', 'seeked']) video.addEventListener(event, paint)
    video.addEventListener('ended', () => {
      player.classList.remove('is-playing')
      if (label) label.textContent = 'Revoir la démo'
      if (play) play.setAttribute('aria-label', 'Revoir la démonstration')
      paint()
    })
    paint()
  }

  /* --- Parallaxe douce sur les captures de chapitre ----------------------- */

  const shots = [...document.querySelectorAll('.chapter-shot img')]

  if (shots.length && !reduced.matches && 'IntersectionObserver' in window) {
    let raf = 0
    const move = () => {
      raf = 0
      const height = innerHeight
      for (const image of shots) {
        const rect = image.getBoundingClientRect()
        if (rect.bottom < -200 || rect.top > height + 200) continue
        // -1 en haut de l’écran, +1 en bas : la capture glisse dans son cadre.
        const progress = (rect.top + rect.height / 2 - height / 2) / height
        image.style.transform = `translate3d(0, ${(-progress * 18).toFixed(1)}px, 0)`
      }
    }
    const ask = () => {
      if (!raf) raf = requestAnimationFrame(move)
    }
    addEventListener('scroll', ask, { passive: true })
    addEventListener('resize', ask)
    ask()
  }
})()
