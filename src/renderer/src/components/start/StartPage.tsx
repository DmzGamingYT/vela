import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { engineLabel, hostOf, isHomeUrl, isLoginUrl, readableTitle } from '@shared/url'
import { SKY_THEME, resolveThemeId } from '@shared/theme'
import { greeting, shortcut, weekdayLabel } from '../../lib/format'
import { listSessions } from '../../lib/sessions'
import { useBrowser } from '../../store/browser'
import HomeFavorites from './HomeFavorites'
import HomeSky from './HomeSky'
import Favicon from '../Favicon'
import HomeWeather from './HomeWeather'
import { Icon } from '../Icon'
import TasksCard from './TasksCard'
import TileMenu, { type TileMenuItem } from '../tabs/TileMenu'
import WatchlistCard from './WatchlistCard'
import QuickNotesCard from './QuickNotesCard'

export interface BentoModules {
  weather: boolean
  shortcuts: boolean
  recent: boolean
  tasks: boolean
  quickNotes: boolean
}

// Deux modules à l'ouverture : les favoris et les pages récentes. Les autres
// (météo, tâches, notes) se demandent depuis « Personnaliser » — un accueil
// qui montre quatre cartes vides avant tout contenu se lit comme un écran
// inachevé. Les profils qui ont déjà choisi leurs modules gardent les leurs.
const DEFAULT_BENTO_MODULES: BentoModules = {
  weather: false,
  shortcuts: true,
  recent: true,
  tasks: false,
  quickNotes: false
}

const BENTO_STORAGE_KEY = 'vela.home.bento.modules'

function readBentoModules(): BentoModules {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(BENTO_STORAGE_KEY) : null
    if (!raw) return DEFAULT_BENTO_MODULES
    return { ...DEFAULT_BENTO_MODULES, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_BENTO_MODULES
  }
}

/**
 * Un titre de tuile lisible. Quand l'historique n'a pas de titre, il ne reste
 * que l'URL : on en tire un libellé plutôt que d'afficher « watch?v=…&t=17s ».
 */
function tileLabel(raw: string | null | undefined, url: string, host: string): string {
  const title = readableTitle(raw, url)
  const hasTitle = Boolean(raw && raw.trim()) && title !== host
  if (hasTitle) return title
  try {
    const parsed = new URL(url)
    const segments = parsed.pathname.split('/').filter(Boolean)
    if (
      /youtube\.com$/i.test(parsed.hostname) &&
      (segments[0] === 'watch' || parsed.searchParams.has('v'))
    ) {
      return 'Vidéo YouTube'
    }
    const last = segments[segments.length - 1] ?? ''
    const clean = decodeURIComponent(last)
      .replace(/\.(html?|php|aspx?)$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim()
    if (clean.length > 1) return clean.slice(0, 70)
  } catch {
    /* URL illisible : on garde l'hôte */
  }
  return host
}

interface RecentCard {
  host: string
  url: string
  title: string
  favicon?: string
  spaceId: string
  visitedAt: number
  visits: number
}

/**
 * Heure courte des cartes : « 2 min », « 1 h », « 2 j ». La forme longue
 * (« il y a 2 minutes ») prenait le tiers de la ligne du haut.
 */
function compactAgo(timestamp: number, now: number): string {
  const delta = Math.max(0, now - timestamp)
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 1) return 'à l’instant'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} j`
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(
    new Date(timestamp)
  )
}

/** Le moteur de recherche n'est pas le sujet de la page qu'il a trouvée. */
function historyTitle(raw: string | null | undefined, url: string, host: string): string {
  const title = (raw ?? '').trim()
  const searched = title.match(/^(.*?)\s+(?:at|@|-)\s*DuckDuckGo$/i)
  const terms = searched?.[1]?.trim()
  if (terms) return `Recherche : ${terms}`
  return tileLabel(raw, url, host)
}

export default function StartPage({ tabId }: { tabId: string }) {
  const view = useBrowser((state) => state.view)
  const navigate = useBrowser((state) => state.navigate)
  const setOverlay = useBrowser((state) => state.setOverlay)
  const openAgent = useBrowser((state) => state.openAgent)
  const focusAddress = useBrowser((state) => state.focusAddress)
  const newTab = useBrowser((state) => state.newTab)
  const openSplit = useBrowser((state) => state.openSplit)
  const toast = useBrowser((state) => state.toast)
  const removeHistory = useBrowser((state) => state.removeHistory)
  const updateSettings = useBrowser((state) => state.updateSettings)
  const activateSpace = useBrowser((state) => state.activateSpace)
  const [today] = useState(() => Date.now())
  // L'heure relative des cartes se rafraîchit toute seule : une page vue il y
  // a 59 s doit dire « 1 min » sans qu'on recharge l'accueil.
  const [now, setNow] = useState(() => Date.now())
  // « Reprendre » : la session gardée la plus récente, sinon la dernière page
  // de l'historique. Lue une fois au montage, comme dans le panneau Sessions.
  const [lastSession] = useState(() => listSessions()[0] ?? null)
  const [modules, setModules] = useState<BentoModules>(readBentoModules)
  const [customizing, setCustomizing] = useState(false)
  const [menu, setMenu] = useState<{ card: RecentCard; x: number; y: number } | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const toggleModule = (key: keyof BentoModules): void => {
    setModules((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      try {
        localStorage.setItem(BENTO_STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* localStorage indisponible */
      }
      return next
    })
  }

  // Deux préréglages : « minimal » ne garde que la salutation et la recherche.
  const applyPreset = (preset: 'minimal' | 'full'): void => {
    const next: BentoModules =
      preset === 'minimal'
        ? { weather: false, shortcuts: false, recent: false, tasks: false, quickNotes: false }
        : DEFAULT_BENTO_MODULES
    setModules(next)
    try {
      localStorage.setItem(BENTO_STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* localStorage indisponible */
    }
  }

  // Vrai pendant la saisie d'une ville : l'invite de recherche s'efface pour
  // qu'un seul champ à la fois soit en jeu.
  const [cityEditing, setCityEditing] = useState(false)
  const [systemCalm, setSystemCalm] = useState(
    () =>
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  // Le fond et les inclinaisons se taisent avec « Réduire les animations »,
  // qu'elle vienne du système ou du choix fait dans les réglages.
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = (): void => setSystemCalm(media.matches)
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  const motion = view?.settings.reduceMotion ?? 'system'
  const calm = motion === 'reduce' || (motion === 'system' && systemCalm)

  // Le survol de l'accueil est le seul poste chaud mesuré de l'app : chaque
  // `pointermove` écrivait cinq variables CSS sur `.start`, donc sur tout
  // l'arbre qui les hérite. Ici la position attend la prochaine image, les
  // variables de l'aurora vivent sur leur propre nappe (seule à les lire) et
  // l'inclinaison ne touche que la tuile survolée.
  //
  // Ces références vivent au-dessus du premier `return` : un accueil sans état
  // doit tout de même monter les mêmes hooks.
  const rootRef = useRef<HTMLDivElement>(null)
  const auroraRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef(0)
  const pendingRef = useRef<{ tile: HTMLElement | null; x: number; y: number } | null>(null)
  const tiltedRef = useRef<HTMLElement | null>(null)
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      if (idleRef.current) clearTimeout(idleRef.current)
    },
    []
  )

  // Avant le premier état : trois braises, pas un écran vide.
  if (!view) {
    return (
      <div className="start start-ignite" data-calm={calm ? 'true' : undefined}>
        <div className="home-ignite" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="sr-only" role="status">
          Chargement de l’accueil
        </p>
      </div>
    )
  }

  // L'espace de cet onglet : il porte les sites épinglés et, s'il est activé,
  // le gadget « À voir ».
  const spaceId = view.tabs.find((tab) => tab.id === tabId)?.spaceId ?? view.activeSpaceId
  const space = view.spaces.find((item) => item.id === spaceId)

  const settings = view.settings
  const engine = engineLabel(
    settings.searchEngine,
    settings.customEngines.find((entry) => entry.id === settings.customEngineId)?.name
  )
  // Le ciel n'est un fond à part entière que sur le thème Braise, et se tait
  // quand les animations sont réduites.
  const homeSky =
    settings.homeBackground === 'sky' &&
    resolveThemeId({
      globalTheme: settings.themeId,
      perSpace: settings.perSpaceThemes,
      spaceTheme: space?.theme ?? null
    }) === SKY_THEME

  // Une carte par domaine : cinq adresses du même site ne font pas cinq
  // cartes. La plus récente porte le titre et l'heure, le compte dit la
  // fréquence. Cinq cartes au plus, puis « Tout l'historique ».
  const cards: RecentCard[] = []
  const indexOfHost = new Map<string, number>()
  for (const entry of view.history) {
    if (!/^https?:/i.test(entry.url)) continue
    const host = hostOf(entry.url)
    const index = indexOfHost.get(host)
    if (index === undefined) {
      indexOfHost.set(host, cards.length)
      cards.push({
        host,
        url: entry.url,
        title: historyTitle(entry.title, entry.url, host),
        favicon: entry.favicon,
        spaceId: entry.spaceId,
        visitedAt: entry.visitedAt,
        visits: 1
      })
    } else {
      cards[index].visits += 1
    }
  }
  cards.sort((a, b) => b.visitedAt - a.visitedAt)
  const visibleCards = cards.slice(0, 5)
  // « Reprendre » ne doit pas rouvrir un formulaire de connexion : la dernière
  // page utile est la première page de l'historique qui n'en est pas une.
  const usefulHistory = view.history.filter((entry) => !isLoginUrl(entry.url))

  // L'accueil ne compte pas comme une page : une fenêtre qui ne montre que son
  // accueil n'affichait « aucun onglet » que pour se contredire avec la barre
  // latérale, où ce même accueil figure comme un onglet.
  const openPages = view.tabs.filter((tab) => tab.spaceId === spaceId && !isHomeUrl(tab.url)).length
  const weekStart = today - 7 * 86_400_000
  const pages = view.history.filter((entry) => entry.visitedAt >= weekStart).length
  // Pas de zéros en ouverture : la ligne ne dit que ce qui existe. Une fenêtre
  // encore vide l'annonce une fois, et indique par où commencer, au lieu
  // d'aligner « 0 page ouverte · 0 page cette semaine ».
  const pagesLabel = pages > 0 ? `${pages} page${pages > 1 ? 's' : ''} cette semaine` : ''
  const openLabel =
    openPages === 0
      ? 'Aucune page ouverte'
      : `${openPages} page${openPages > 1 ? 's' : ''} ouverte${openPages > 1 ? 's' : ''}`
  const lede =
    openPages === 0 && pages === 0
      ? 'Rien d’ouvert pour l’instant — commencez par une adresse.'
      : [openLabel, pagesLabel].filter(Boolean).join(' · ')

  const paintHover = (): void => {
    frameRef.current = 0
    const pending = pendingRef.current
    pendingRef.current = null
    if (!pending) return
    // Tout est lu avant la première écriture : une lecture après une écriture
    // forcerait un calcul de mise en page par image.
    const root = rootRef.current
    const rootRect = root?.getBoundingClientRect()
    const tile = pending.tile
    const tileRect = tile?.getBoundingClientRect()
    const previous = tiltedRef.current
    if (previous && previous !== tile) {
      previous.style.setProperty('--tilt-y', '0deg')
      previous.style.setProperty('--tilt-x', '0deg')
      tiltedRef.current = null
    }
    const aurora = auroraRef.current
    if (aurora && rootRect && rootRect.width > 0 && rootRect.height > 0) {
      aurora.style.setProperty(
        '--aurora-x',
        ((pending.x - rootRect.left) / rootRect.width - 0.5).toFixed(3)
      )
      aurora.style.setProperty(
        '--aurora-y',
        ((pending.y - rootRect.top) / rootRect.height - 0.5).toFixed(3)
      )
    }
    if (tile && tileRect && tileRect.width > 0 && tileRect.height > 0) {
      const x = (pending.x - tileRect.left) / tileRect.width - 0.5
      const y = (pending.y - tileRect.top) / tileRect.height - 0.5
      tile.style.setProperty('--tilt-y', `${(x * 7).toFixed(2)}deg`)
      tile.style.setProperty('--tilt-x', `${(-y * 7).toFixed(2)}deg`)
      tile.style.setProperty('--glow-x', `${((x + 0.5) * 100).toFixed(1)}%`)
      tile.style.setProperty('--glow-y', `${((y + 0.5) * 100).toFixed(1)}%`)
      tiltedRef.current = tile
    }
  }

  const parallax = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (calm || (event.pointerType !== 'mouse' && event.pointerType !== 'pen')) return
    const target = event.target as HTMLElement | null
    pendingRef.current = {
      tile: target?.closest<HTMLElement>('.recent-card') ?? null,
      x: event.clientX,
      y: event.clientY
    }
    // Pendant le geste, les transitions de transform redémarreraient à chaque
    // image : elles sont coupées par cet attribut.
    const root = rootRef.current
    if (root && root.dataset.pointing !== 'true') root.dataset.pointing = 'true'
    if (idleRef.current) clearTimeout(idleRef.current)
    idleRef.current = setTimeout(() => {
      const node = rootRef.current
      if (node) delete node.dataset.pointing
    }, 180)
    if (!frameRef.current) frameRef.current = requestAnimationFrame(paintHover)
  }

  const resetParallax = (): void => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
    }
    pendingRef.current = null
    if (idleRef.current) clearTimeout(idleRef.current)
    const root = rootRef.current
    if (root) delete root.dataset.pointing
    const tile = tiltedRef.current
    tiltedRef.current = null
    // Le retour profite de la transition qu'on vient de rétablir : la laisser
    // prendre effet une image, sinon le fond se replace d'un coup.
    requestAnimationFrame(() => {
      auroraRef.current?.style.setProperty('--aurora-x', '0')
      auroraRef.current?.style.setProperty('--aurora-y', '0')
      if (!tile) return
      tile.style.setProperty('--tilt-y', '0deg')
      tile.style.setProperty('--tilt-x', '0deg')
    })
  }

  // Un clic ouvre ici, ⌘-clic ailleurs, ⌥-clic à côté : la carte propose les
  // trois gestes que le reste de l'application connaît déjà.
  const openTile = (event: ReactMouseEvent<HTMLButtonElement>, card: RecentCard): void => {
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault()
      newTab(card.url)
      return
    }
    if (event.altKey) {
      event.preventDefault()
      openSplit(card.url)
      return
    }
    navigate(tabId, card.url)
  }

  const cardMenuItems = (card: RecentCard): TileMenuItem[] => [
    {
      id: 'new-tab',
      label: 'Ouvrir dans un nouvel onglet',
      icon: 'external',
      onSelect: () => newTab(card.url)
    },
    {
      id: 'copy',
      label: 'Copier le lien',
      icon: 'copy',
      onSelect: () => {
        void navigator.clipboard.writeText(card.url).then(
          () => toast('Lien copié.'),
          () => toast('Copie impossible.', 'error')
        )
      }
    },
    {
      id: 'remove',
      label: 'Retirer de l’historique',
      icon: 'trash',
      onSelect: () => void removeHistory(card.url)
    }
  ]

  // Reprendre : la session gardée la plus récente, sinon la dernière page vue.
  const resume = async (): Promise<void> => {
    if (lastSession) {
      const target = view.spaces.some((item) => item.id === lastSession.spaceId)
        ? lastSession.spaceId
        : view.activeSpaceId
      activateSpace(target)
      for (const tab of lastSession.tabs) {
        await window.vela.tabs
          .create({ spaceId: target, url: tab.url, activate: false })
          .catch(() => null)
      }
      toast(`« ${lastSession.name} » rouverte.`)
      return
    }
    const last = usefulHistory[0]
    if (!last) {
      toast('Rien à reprendre pour le moment.')
      return
    }
    newTab(last.url)
  }

  // Le geste dit sur quoi il porte : « Reprendre YouTube » plutôt qu'un
  // « Reprendre » qui laisse deviner ce qu'on rouvre.
  const resumeTarget =
    lastSession?.name ?? (usefulHistory[0] ? hostOf(usefulHistory[0].url) : '')

  return (
    <div
      ref={rootRef}
      className="start"
      data-calm={calm ? 'true' : undefined}
      onPointerMove={parallax}
      onPointerLeave={resetParallax}
    >
      <div ref={auroraRef} className="home-aurora" aria-hidden="true">
        <span className="aurora-field">
          <span className="aurora-blob" data-i="1" />
          <span className="aurora-blob" data-i="2" />
          <span className="aurora-blob" data-i="3" />
        </span>
      </div>

      <HomeSky active={homeSky} calm={calm} variant={settings.skyVariant} />

      <div className="start-inner home">
        <header className="home-head">
          <div className="home-hello">
            <div className="home-meta-row">
              <p className="home-date">
                <span className="eyebrow-dot" />
                {weekdayLabel(today)}
              </p>
            </div>
            <h1 className="home-title" aria-label={greeting()}>
              {greeting()
                .split(' ')
                .map((word, index) => (
                  <span
                    key={`${word}-${index}`}
                    className="home-word"
                    style={{ animationDelay: calm ? '0ms' : `${80 + index * 90}ms` }}
                  >
                    {word}
                  </span>
                ))}
              <span className="home-title-dot" aria-hidden="true">
                .
              </span>
            </h1>
            <p className="home-lede">{lede}</p>
            <button
              type="button"
              className="home-resume"
              onClick={() => void resume()}
              title={
                lastSession
                  ? `Rouvrir « ${lastSession.name} » (${lastSession.tabs.length} onglets)`
                  : 'Rouvrir la dernière page visitée'
              }
            >
              <Icon name="history" size={12} />
              <span>{resumeTarget ? `Reprendre ${resumeTarget}` : 'Reprendre'}</span>
              {lastSession ? (
                <span className="home-resume-count">{lastSession.tabs.length}</span>
              ) : null}
            </button>
          </div>
          {modules.weather && <HomeWeather onEditingChange={setCityEditing} />}
        </header>

        {customizing && (
          <section className="home-customize-bar" aria-label="Personnalisation de l’accueil">
            <div className="customize-group">
              <span className="customize-label">Modules visibles :</span>
              <div className="customize-chips">
                <button
                  type="button"
                  className="customize-chip"
                  data-active={modules.weather}
                  onClick={() => toggleModule('weather')}
                >
                  <Icon name="sun" size={12} />
                  Météo
                </button>
                <button
                  type="button"
                  className="customize-chip"
                  data-active={modules.shortcuts}
                  onClick={() => toggleModule('shortcuts')}
                >
                  <Icon name="star" size={12} />
                  Favoris
                </button>
                <button
                  type="button"
                  className="customize-chip"
                  data-active={modules.recent}
                  onClick={() => toggleModule('recent')}
                >
                  <Icon name="history" size={12} />
                  Récents
                </button>
                <button
                  type="button"
                  className="customize-chip"
                  data-active={modules.tasks}
                  onClick={() => toggleModule('tasks')}
                >
                  <Icon name="check" size={12} />
                  Tâches
                </button>
                <button
                  type="button"
                  className="customize-chip"
                  data-active={modules.quickNotes}
                  onClick={() => toggleModule('quickNotes')}
                >
                  <Icon name="edit" size={12} />
                  Notes rapides
                </button>
              </div>
            </div>

            <div className="customize-group">
              <span className="customize-label">Préréglages :</span>
              <div className="customize-chips">
                <button
                  type="button"
                  className="customize-chip"
                  onClick={() => applyPreset('minimal')}
                  title="Salutation et recherche seulement"
                >
                  Minimal
                </button>
                <button
                  type="button"
                  className="customize-chip"
                  onClick={() => applyPreset('full')}
                  title="Rétablir tous les modules"
                >
                  Complet
                </button>
              </div>
            </div>

            <div className="customize-group">
              <span className="customize-label">Ambiance de fond :</span>
              <div className="customize-chips">
                {(['gradient', 'plain'] as const).map((bg) => (
                  <button
                    key={bg}
                    type="button"
                    className="customize-chip"
                    data-active={settings.homeBackground === bg}
                    onClick={() => void updateSettings({ homeBackground: bg })}
                  >
                    {bg === 'gradient' ? 'Dégradé doux' : 'Papier épuré'}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Le champ ne porte qu'un bouton, l'envoi. Les deux raccourcis vivent
            sur la ligne du moteur, sous le champ : une seule rangée d'actions
            de même poids, au lieu de trois contrôles collés au bord droit. */}
        <section className="home-search" aria-label="Recherche" hidden={cityEditing}>
          <div className="home-field">
            <button
              type="button"
              className="home-field-button home-field-open"
              title="Saisir dans la barre d’adresse"
              aria-label={`Adresse, recherche ou agent — ${shortcut('L')}`}
              onClick={() => focusAddress()}
            >
              <span className="home-field-icon">
                <Icon name="search" size={16} />
              </span>
              <span className="home-field-text">
                Adresse, recherche ou agent
              </span>
            </button>

            {/* Le moteur et les deux raccourcis vivent dans le champ : sous la
                barre, ils flottaient à droite, détachés de ce qu'ils
                commandent. */}
            <div className="home-chips home-chips-meta">
              {/* Le moteur rejoint les puces : il commande la même barre, il
                  n'a pas à flotter en dessous, détaché de ce qu'il sert. */}
              <button
                type="button"
                className="home-chip home-chip-flat home-engine-chip"
                onClick={() => setOverlay('settings')}
                title="Changer de moteur de recherche"
              >
                via {engine}
                <span aria-hidden="true">▾</span>
              </button>
              <button
                type="button"
                className="home-chip home-chip-flat"
                onClick={() => setOverlay('command')}
                title={`Palette (${shortcut('K')})`}
              >
                <Icon name="command" size={12} />
                Palette
                <span className="home-chip-key">{shortcut('K')}</span>
              </button>
              <button
                type="button"
                className="home-chip home-chip-flat"
                onClick={() => openAgent()}
                title="Demander à l’agent"
              >
                <Icon name="sparkles" size={12} />
                Agent
              </button>
            </div>

            <button
              type="button"
              className="home-go"
              onClick={() => focusAddress()}
              aria-label={`Saisir dans la barre d’adresse — ${shortcut('L')}`}
              title={`Saisir dans la barre d’adresse (${shortcut('L')})`}
            >
              <Icon name="arrow-right" size={15} />
            </button>
          </div>

        </section>

        {modules.shortcuts && <HomeFavorites spaceId={spaceId} />}

        <div
          className="home-grid"
          data-no-side={
            !modules.tasks && !modules.quickNotes && !space?.watchlist ? 'true' : undefined
          }
        >
          {modules.recent && (
            <section className="home-card home-recent" aria-label="Récemment">
              <div className="home-card-head">
                <h2>Récemment</h2>
                <button
                  type="button"
                  className="home-card-action"
                  onClick={() => setOverlay('history')}
                  title="Ouvrir l’historique"
                >
                  <span>Historique</span>
                  <Icon name="arrow-right" size={12} />
                </button>
              </div>

              {visibleCards.length === 0 ? (
                <button
                  type="button"
                  className="recent-empty"
                  onClick={() => setOverlay('history')}
                >
                  <Icon name="clock" size={14} />
                  <span>Vos pages récentes apparaîtront ici.</span>
                </button>
              ) : (
                <div className="recent-cards">
                  {visibleCards.map((card) => (
                  <div
                    key={card.host}
                    className="recent-card"
                    onAuxClick={(event) => {
                      if (event.button !== 1) return
                      event.preventDefault()
                      newTab(card.url)
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      setMenu({ card, x: event.clientX, y: event.clientY })
                    }}
                  >
                    <button
                      type="button"
                      className="recent-open"
                      onClick={(event) => openTile(event, card)}
                      onKeyDown={(event) => {
                        if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10'))
                          return
                        event.preventDefault()
                        const rect = event.currentTarget.getBoundingClientRect()
                        setMenu({ card, x: rect.left, y: rect.bottom })
                      }}
                      title={card.url}
                    >
                      <span className="recent-card-top">
                        <span className="recent-favicon" aria-hidden="true">
                          <Favicon
                            src={card.favicon}
                            url={card.url}
                            label={card.host}
                            size={24}
                            spaceId={card.spaceId}
                          />
                        </span>
                        <span className="recent-card-time">
                          {compactAgo(card.visitedAt, now)}
                        </span>
                      </span>
                      <span className="recent-title">{card.title}</span>
                      {/* Quand le titre est déjà le domaine, ne l'écrire
                          qu'une fois. Le compte reste utile. */}
                      {card.title !== card.host ? (
                        <span className="recent-host">
                          {card.visits > 1 ? `${card.host} · ${card.visits} visites` : card.host}
                        </span>
                      ) : null}
                    </button>
                  </div>
                  ))}

                  <button
                    type="button"
                    className="recent-all"
                    onClick={() => setOverlay('history')}
                  >
                    <Icon name="clock" size={14} />
                    <span>Tout l’historique</span>
                  </button>
                </div>
              )}
            </section>
          )}

          {(space?.watchlist || modules.tasks || modules.quickNotes) && (
            <aside className="home-side">
              {space?.watchlist && <WatchlistCard spaceId={spaceId} />}
              {modules.tasks && <TasksCard />}
              {modules.quickNotes && <QuickNotesCard spaceId={spaceId} />}
            </aside>
          )}
        </div>

        <footer className="home-foot">
          <span className="home-foot-note">
            <Icon name="shield" size={12} />
            Aucune mesure d’usage. Vos recherches partent vers le moteur choisi.
          </span>
          <button
            type="button"
            className="home-customize-btn home-foot-customize"
            data-active={customizing}
            onClick={() => setCustomizing((c) => !c)}
            title="Personnaliser les modules de l’accueil"
            aria-expanded={customizing}
          >
            <Icon name="settings" size={12} />
            <span>{customizing ? 'Terminer' : 'Personnaliser'}</span>
          </button>
        </footer>
      </div>

      {menu && (
        <TileMenu
          x={menu.x}
          y={menu.y}
          label={menu.card.title}
          items={cardMenuItems(menu.card)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
