import { useEffect, useRef, useState } from 'react'
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent
} from 'react'
import { canonicalUrl, engineLabel, hostOf, isHomeUrl, readableTitle } from '@shared/url'
import { SKY_THEME, resolveThemeId } from '@shared/theme'
import { greeting, shortcut, timeAgo, tintFor } from '../lib/format'
import { useBrowser } from '../store/browser'
import HomeSky from './HomeSky'
import Favicon from './Favicon'
import HomeWeather from './HomeWeather'
import { Icon } from './Icon'
import SpaceShortcuts from './SpaceShortcuts'
import TasksCard from './TasksCard'
import TileMenu, { type TileMenuItem } from './TileMenu'
import WatchlistCard from './WatchlistCard'
import QuickNotesCard from './QuickNotesCard'

const STARTERS = [
  { label: 'GitHub', detail: 'Vos projets', url: 'https://github.com' },
  { label: 'Hacker News', detail: 'La tech du jour', url: 'https://news.ycombinator.com' },
  { label: 'Le Monde', detail: 'L’actualité', url: 'https://www.lemonde.fr' },
  { label: 'Wikipédia', detail: 'La référence libre', url: 'https://fr.wikipedia.org' }
]

export interface BentoModules {
  weather: boolean
  shortcuts: boolean
  recent: boolean
  tasks: boolean
  quickNotes: boolean
}

const DEFAULT_BENTO_MODULES: BentoModules = {
  weather: true,
  shortcuts: true,
  recent: true,
  tasks: true,
  quickNotes: true
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
    if (/youtube\.com$/i.test(parsed.hostname) && (segments[0] === 'watch' || parsed.searchParams.has('v'))) {
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

interface Tile {
  id: string
  url: string
  title: string
  host: string
  favicon?: string
  meta: string
  kind: 'history' | 'bookmark' | 'starter'
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
  const updateSettings = useBrowser((state) => state.updateSettings)
  const [modules, setModules] = useState<BentoModules>(readBentoModules)
  const [customizing, setCustomizing] = useState(false)
  const [menu, setMenu] = useState<{ tile: Tile; x: number; y: number } | null>(null)

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
  // Vrai pendant la saisie d'une ville : l'invite de recherche s'efface pour
  // qu'un seul champ à la fois soit en jeu.
  const [cityEditing, setCityEditing] = useState(false)
  const [systemCalm, setSystemCalm] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  // Le fond et les inclinaisons se taisent avec « Réduire les animations »,
  // qu'elle vienne du système ou du choix fait dans les réglages.
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = (): void => setSystemCalm(media.matches)
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  // Vignettes des pages récentes : demandées seulement si le réglage est actif
  // et seulement pour les adresses de l'historique affiché.
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const thumbsEnabled = view?.settings.thumbnails === true
  const historyKey = view ? view.history.slice(0, 12).map((entry) => entry.url).join('\n') : ''

  useEffect(() => {
    if (!thumbsEnabled || !historyKey) {
      setThumbs({})
      return
    }
    let alive = true
    const urls = historyKey.split('\n')
    void Promise.all(
      urls.map(async (url) => [url, await window.vela.thumbs.get(url).catch(() => null)] as const)
    ).then((entries) => {
      if (!alive) return
      const next: Record<string, string> = {}
      for (const [url, data] of entries) if (data) next[url] = data
      setThumbs(next)
    })
    return () => {
      alive = false
    }
    // `view.history` change à chaque diffusion : après une purge des vignettes,
    // l'accueil redemande donc les images au lieu de garder les anciennes.
  }, [thumbsEnabled, historyKey, view?.history])

  const motion = view?.settings.reduceMotion ?? 'system'
  const calm = motion === 'reduce' || (motion === 'system' && systemCalm)

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

  // Une tuile par page : la clé ignore la requête et l'ancre, donc
  // « article/une-page » et « article/une-page?ref=home » ne font qu'une.
  const tiles: Tile[] = []
  const seen = new Set<string>()
  // Deux tuiles par domaine au plus : une grille d'accueil ne doit pas être
  // trois fois la même chaîne YouTube.
  const perHost = new Map<string, number>()
  for (const entry of view.history) {
    if (!/^https?:/i.test(entry.url)) continue
    const key = canonicalUrl(entry.url)
    if (seen.has(key)) continue
    const host = hostOf(entry.url)
    if ((perHost.get(host) ?? 0) >= 2) continue
    seen.add(key)
    perHost.set(host, (perHost.get(host) ?? 0) + 1)
    tiles.push({
      id: entry.id,
      url: entry.url,
      title: tileLabel(entry.title, entry.url, host),
      host,
      favicon: entry.favicon,
      meta: timeAgo(entry.visitedAt),
      kind: 'history'
    })
    if (tiles.length >= 6) break
  }
  if (tiles.length < 4) {
    for (const bookmark of view.bookmarks) {
      if (!/^https?:/i.test(bookmark.url)) continue
      const key = canonicalUrl(bookmark.url)
      if (seen.has(key)) continue
      seen.add(key)
      tiles.push({
        id: bookmark.id,
        url: bookmark.url,
        title: readableTitle(bookmark.title, bookmark.url),
        host: hostOf(bookmark.url),
        favicon: bookmark.favicon,
        meta: 'Favori',
        kind: 'bookmark'
      })
      if (tiles.length >= 6) break
    }
  }
  // Une grille pleine plutôt qu'une carte isolée : les raccourcis complètent
  // l'historique jusqu'à trois ou six tuiles, sans jamais dépasser. Quand
  // l'espace a ses propres sites, ce sont eux qui servent de départ — un
  // espace cinéma ne propose pas GitHub.
  const starters = space?.shortcuts?.length
    ? space.shortcuts.slice(0, 4).map((shortcut) => ({
        label: shortcut.title,
        detail: hostOf(shortcut.url),
        url: shortcut.url
      }))
    : STARTERS
  if (tiles.length < 6) {
    const target = tiles.length <= 3 ? 3 : 6
    for (const starter of starters) {
      if (tiles.length >= target) break
      if (seen.has(starter.url)) continue
      seen.add(starter.url)
      tiles.push({
        id: starter.url,
        url: starter.url,
        title: starter.label,
        host: hostOf(starter.url),
        meta: 'Raccourci',
        kind: 'starter'
      })
    }
  }
  const onlyStarters = tiles.every((tile) => tile.kind === 'starter')

  // L'accueil ne compte pas comme une page : une fenêtre qui ne montre que son
  // accueil n'affichait « aucun onglet » que pour se contredire avec la barre
  // latérale, où ce même accueil figure comme un onglet.
  const openPages = view.tabs.filter((tab) => tab.spaceId === spaceId && !isHomeUrl(tab.url)).length
  const pages = view.brief.pages
  const pagesLabel = `${pages} page${pages > 1 ? 's' : ''} cette semaine`
  const lede =
    openPages === 0
      ? `Aucune page ouverte · ${pagesLabel}`
      : `${openPages} page${openPages > 1 ? 's' : ''} ouverte${openPages > 1 ? 's' : ''} · ${pagesLabel}`



  // Le survol de l'accueil est le seul poste chaud mesuré de l'app : chaque
  // `pointermove` écrivait cinq variables CSS sur `.start`, donc sur tout
  // l'arbre qui les hérite. Ici la position attend la prochaine image, les
  // variables de l'aurora vivent sur leur propre nappe (seule à les lire) et
  // l'inclinaison ne touche que la tuile survolée.
  const rootRef = useRef<HTMLDivElement>(null)
  const auroraRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef(0)
  const pendingRef = useRef<{ tile: HTMLElement | null; x: number; y: number } | null>(null)
  const tiltedRef = useRef<HTMLElement | null>(null)
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    if (idleRef.current) clearTimeout(idleRef.current)
  }, [])

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
      aurora.style.setProperty('--aurora-x', ((pending.x - rootRect.left) / rootRect.width - 0.5).toFixed(3))
      aurora.style.setProperty('--aurora-y', ((pending.y - rootRect.top) / rootRect.height - 0.5).toFixed(3))
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
      tile: target?.closest<HTMLElement>('.recent-tile') ?? null,
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

  // Un clic ouvre ici, ⌘-clic ailleurs, ⌥-clic à côté : la tuile propose les
  // trois gestes que le reste de l'application connaît déjà.
  const openTile = (event: ReactMouseEvent<HTMLButtonElement>, tile: Tile): void => {
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault()
      newTab(tile.url)
      return
    }
    if (event.altKey) {
      event.preventDefault()
      openSplit(tile.url)
      return
    }
    navigate(tabId, tile.url)
  }

  const tileMenuItems = (tile: Tile): TileMenuItem[] => [
    { id: 'new-tab', label: 'Ouvrir dans un nouvel onglet', icon: 'external', onSelect: () => newTab(tile.url) },
    { id: 'split', label: 'Ouvrir en vue scindée', icon: 'split', onSelect: () => openSplit(tile.url) },
    {
      id: 'copy',
      label: 'Copier l’adresse',
      icon: 'copy',
      onSelect: () => {
        void navigator.clipboard.writeText(tile.url).then(
          () => toast('Adresse copiée.'),
          () => toast('Copie impossible.', 'error')
        )
      }
    }
  ]

  const tileStyle = (tile: Tile): CSSProperties =>
    ({ '--tile-tint': tintFor(tile.host || tile.title) }) as CSSProperties

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
                {view.brief.dateLabel}
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
                  <Icon name="pin" size={12} />
                  Sites épinglés
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
              aria-label={`Chercher, saisir une adresse ou demander à l’agent — ${shortcut('L')}`}
              onClick={() => focusAddress()}
            >
              <span className="home-field-icon">
                <Icon name="search" size={16} />
              </span>
              <span className="home-field-text">Chercher, saisir une adresse ou demander à l’agent</span>
            </button>

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

          <div className="home-chips home-chips-meta">
            <span className="home-engine">via {engine}</span>
            <button
              type="button"
              className="home-chip home-chip-flat"
              onClick={() => setOverlay('command')}
              title={`Palette (${shortcut('K')})`}
            >
              <Icon name="command" size={12} />
              Palette
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
        </section>

        {modules.shortcuts && <SpaceShortcuts spaceId={spaceId} />}

        <div className="home-grid" data-no-side={!modules.tasks && !modules.quickNotes && !space?.watchlist ? 'true' : undefined}>
          {modules.recent && (
            <section className="home-card home-recent" aria-label="Récemment">
              <div className="home-card-head">
                <h2>{onlyStarters ? 'Pour commencer' : 'Récemment'}</h2>
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

              {onlyStarters ? (
                <p className="home-hint">Quelques pages pour commencer. Vos recherches ne partent que vers le moteur choisi.</p>
              ) : null}

              <div className="recent-grid">
                {tiles.map((tile) => (
                  <button
                    key={`${tile.kind}-${tile.id}`}
                    type="button"
                    className="recent-tile"
                    data-kind={tile.kind}
                    data-thumb={thumbs[tile.url] ? 'true' : undefined}
                    style={tileStyle(tile)}
                    onClick={(event) => openTile(event, tile)}
                    onAuxClick={(event) => {
                      if (event.button !== 1) return
                      event.preventDefault()
                      newTab(tile.url)
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      setMenu({ tile, x: event.clientX, y: event.clientY })
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
                      event.preventDefault()
                      const rect = event.currentTarget.getBoundingClientRect()
                      setMenu({ tile, x: rect.left, y: rect.bottom })
                    }}
                    title={tile.title}
                  >
                    {thumbs[tile.url] && (
                      <span className="tile-thumb" aria-hidden="true">
                        <img src={thumbs[tile.url]} alt="" draggable={false} loading="lazy" />
                      </span>
                    )}
                    <span className="tile-top">
                      <Favicon
                        src={tile.favicon}
                        url={tile.url}
                        label={tile.host || tile.title}
                        size={18}
                        spaceId={spaceId}
                      />
                      <span className="tile-host">{tile.host}</span>
                      <span className="tile-badge">{tile.meta}</span>
                    </span>
                    <span className="tile-title">{tile.title}</span>
                    <span className="tile-arrow">
                      <Icon name="arrow-right" size={13} />
                    </span>
                  </button>
                ))}
              </div>
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
            Aucune télémétrie. Vos recherches ne partent que vers le moteur choisi.
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
          label={menu.tile.title}
          items={tileMenuItems(menu.tile)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
