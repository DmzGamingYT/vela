import { useEffect, useState } from 'react'
import type { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent } from 'react'
import { canonicalUrl, hostOf, normalizeInput, readableTitle, SEARCH_ENGINES } from '@shared/url'
import { DRAGON_THEME, resolveThemeId } from '@shared/theme'
import { greeting, shortcut, timeAgo, tintFor } from '../lib/format'
import { useBrowser } from '../store/browser'
import DragonSky from './DragonSky'
import Favicon from './Favicon'
import HomeWeather from './HomeWeather'
import { Icon } from './Icon'
import SpaceShortcuts from './SpaceShortcuts'
import TasksCard from './TasksCard'
import WatchlistCard from './WatchlistCard'

const STARTERS = [
  { label: 'GitHub', detail: 'Vos projets', url: 'https://github.com' },
  { label: 'Hacker News', detail: 'La tech du jour', url: 'https://news.ycombinator.com' },
  { label: 'Le Monde', detail: 'L’actualité', url: 'https://www.lemonde.fr' },
  { label: 'Wikipédia', detail: 'La référence libre', url: 'https://fr.wikipedia.org' }
]

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
  const [query, setQuery] = useState('')
  // Vrai pendant la saisie d'une ville : la recherche de l'accueil se retire
  // pour ne jamais montrer plus de deux champs à la fois.
  const [cityEditing, setCityEditing] = useState(false)
  const [calm, setCalm] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  // Le fond et les inclinaisons se taisent avec « Réduire les animations ».
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = (): void => setCalm(media.matches)
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
  const engine = SEARCH_ENGINES[settings.searchEngine]?.label ?? 'DuckDuckGo'
  // Le ciel de braise n'apparaît qu'avec son thème, et se tait quand
  // l'animation est refusée par le système.
  const dragonSky =
    settings.dragonSky &&
    resolveThemeId({
      globalTheme: settings.themeId,
      perSpace: settings.perSpaceThemes,
      spaceTheme: space?.theme ?? null
    }) === DRAGON_THEME

  // Une tuile par page : la clé ignore la requête et l'ancre, donc
  // « article/une-page » et « article/une-page?ref=home » ne font qu'une.
  const tiles: Tile[] = []
  const seen = new Set<string>()
  for (const entry of view.history) {
    if (!/^https?:/i.test(entry.url)) continue
    const key = canonicalUrl(entry.url)
    if (seen.has(key)) continue
    seen.add(key)
    tiles.push({
      id: entry.id,
      url: entry.url,
      title: readableTitle(entry.title, entry.url),
      host: hostOf(entry.url),
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

  // Le compteur suit exactement ce que la barre latérale montre pour cet
  // espace : onglet d'accueil compris, puisqu'il y figure comme les autres.
  const openTabs = view.tabs.filter((tab) => tab.spaceId === spaceId).length
  const pages = view.brief.pages
  const pagesLabel = `${pages} page${pages > 1 ? 's' : ''} cette semaine`
  const lede =
    openTabs === 0
      ? `Aucun onglet ouvert · ${pagesLabel}`
      : `${openTabs} onglet${openTabs > 1 ? 's' : ''} ouvert${openTabs > 1 ? 's' : ''} · ${pagesLabel}`


  const trimmed = query.trim()
  const preview = trimmed ? normalizeInput(trimmed, settings.searchEngine, settings.searxInstance) : null
  const hint = !trimmed
    ? 'Entrée pour ouvrir la palette'
    : preview?.kind === 'url'
      ? `Ouvrir ${hostOf(preview.url)}`
      : `Rechercher sur ${engine}`

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (!trimmed) {
      setOverlay('command')
      return
    }
    const target = normalizeInput(trimmed, settings.searchEngine, settings.searxInstance)
    navigate(tabId, target.url)
    setQuery('')
  }

  const parallax = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (calm) return
    const rect = event.currentTarget.getBoundingClientRect()
    event.currentTarget.style.setProperty('--aurora-x', ((event.clientX - rect.left) / rect.width - 0.5).toFixed(3))
    event.currentTarget.style.setProperty('--aurora-y', ((event.clientY - rect.top) / rect.height - 0.5).toFixed(3))
  }

  const resetParallax = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.currentTarget.style.setProperty('--aurora-x', '0')
    event.currentTarget.style.setProperty('--aurora-y', '0')
  }

  const tilt = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (calm || event.pointerType !== 'mouse') return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width - 0.5
    const y = (event.clientY - rect.top) / rect.height - 0.5
    event.currentTarget.style.setProperty('--tilt-y', `${(x * 7).toFixed(2)}deg`)
    event.currentTarget.style.setProperty('--tilt-x', `${(-y * 7).toFixed(2)}deg`)
    event.currentTarget.style.setProperty('--glow-x', `${((x + 0.5) * 100).toFixed(1)}%`)
    event.currentTarget.style.setProperty('--glow-y', `${((y + 0.5) * 100).toFixed(1)}%`)
  }

  const untilt = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.currentTarget.style.setProperty('--tilt-y', '0deg')
    event.currentTarget.style.setProperty('--tilt-x', '0deg')
  }

  const tileStyle = (tile: Tile): CSSProperties =>
    ({ '--tile-tint': tintFor(tile.host || tile.title) }) as CSSProperties

  return (
    <div
      className="start"
      data-calm={calm ? 'true' : undefined}
      onPointerMove={parallax}
      onPointerLeave={resetParallax}
    >
      <div className="home-aurora" aria-hidden="true">
        <span className="aurora-field">
          <span className="aurora-blob" data-i="1" />
          <span className="aurora-blob" data-i="2" />
          <span className="aurora-blob" data-i="3" />
        </span>
      </div>

      <DragonSky active={dragonSky} calm={calm} variant={settings.skyVariant} />

      <div className="start-inner home">
        <header className="home-head">
          <div className="home-hello">
            <p className="home-date">
              <span className="eyebrow-dot" />
              {view.brief.dateLabel}
            </p>
            <h1 className="home-title" aria-label={greeting()}>
              {greeting()
                .split(' ')
                .map((word, index) => (
                  <span
                    key={`${word}-${index}`}
                    className="home-word"
                    style={{ animationDelay: `${80 + index * 90}ms` }}
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
          <HomeWeather onEditingChange={setCityEditing} />
        </header>

        <section className="home-search" aria-label="Recherche" hidden={cityEditing}>
          <form className="home-field" onSubmit={submit}>
            <span className="home-field-icon">
              <Icon name="search" size={16} />
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setQuery('')
              }}
              placeholder="Rechercher, saisir une adresse ou demander à l’agent"
              aria-label="Rechercher, saisir une adresse ou demander à l’agent"
              spellCheck={false}
            />
            <span className="home-field-hint" aria-hidden="true">
              {hint}
            </span>
            <kbd>{shortcut('K')}</kbd>
            <button type="submit" className="home-go" title="Ouvrir (Entrée)" aria-label="Ouvrir">
              <Icon name="arrow-right" size={15} />
            </button>
          </form>

          <div className="home-chips">
            <button type="button" className="home-chip" onClick={() => setOverlay('command')}>
              <Icon name="command" size={12} />
              Palette
            </button>
            <button type="button" className="home-chip" onClick={() => openAgent()}>
              <Icon name="sparkles" size={12} />
              Agent
            </button>
            <button type="button" className="home-chip" onClick={() => setOverlay('brief')}>
              <Icon name="calendar" size={12} />
              Brief du jour
            </button>
            <span className="home-engine">via {engine}</span>
          </div>
        </section>

        <SpaceShortcuts spaceId={spaceId} />

        <div className="home-grid">
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
                  onPointerMove={tilt}
                  onPointerLeave={untilt}
                  onClick={() => navigate(tabId, tile.url)}
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

          <aside className="home-side">
            {space?.watchlist && <WatchlistCard spaceId={spaceId} />}
            <TasksCard />
          </aside>
        </div>

        <footer className="home-foot">
          <span className="home-foot-note">
            <Icon name="shield" size={12} />
            Aucune télémétrie. Vos recherches ne partent que vers le moteur choisi.
          </span>
          <span className="home-foot-key">
            <Icon name="command" size={12} />
            <kbd>{shortcut('K')}</kbd>
            palette
          </span>
        </footer>
      </div>
    </div>
  )
}
