import { useEffect, useRef, useState } from 'react'
import { useModalFocus } from '../../lib/useModalFocus'
import { useSystemDark } from '../../lib/useSystemDark'
import SavedIndicator from '../SavedIndicator'
import AmbienceScene from '../AmbienceScene'
import AppearancePage from './AppearancePage'
import NavigationPage from './NavigationPage'
import PrivacyPage from './PrivacyPage'
import { resolveMode, resolveMotion,  resolveAccent,
  resolveThemeId, type HomeBackground } from '@shared/theme'
import { shortcut } from '../../lib/format'
import { useBrowser } from '../../store/browser'
import AgentPage from './AgentPage'
import OverviewPage from './OverviewPage'
import SystemPage from './SystemPage'
import {
  normalizeSettingText,
  searchSettings,
  type SettingsPage,
  type SettingsTarget
} from './settingsSearch'
import { Icon, type IconName } from '../Icon'

type Page = SettingsPage

const NAV: { group: string; items: { id: Page; label: string; icon: IconName }[] }[] = [
  {
    group: 'Repères',
    items: [{ id: 'overview', label: 'Vue d’ensemble', icon: 'list' }]
  },
  {
    group: 'Général',
    items: [
      { id: 'appearance', label: 'Apparence', icon: 'palette' },
      { id: 'navigation', label: 'Navigation', icon: 'compass' },
      { id: 'privacy', label: 'Confidentialité', icon: 'shield' }
    ]
  },
  {
    group: 'Agent',
    items: [{ id: 'agent', label: 'Agent', icon: 'sparkles' }]
  },
  {
    group: 'Système',
    items: [{ id: 'system', label: 'Système', icon: 'info' }]
  }
]

const COPY: Record<Page, { title: string; lede: string }> = {
  overview: {
    title: 'Vue d’ensemble',
    lede: 'Ce qui définit votre interface, votre navigation et votre vie privée. Tout s’applique aussitôt et reste sur cet appareil.'
  },
  appearance: {
    title: 'Apparence',
    lede: 'La lumière, la couleur, la matière et le mouvement, réglés au même endroit.'
  },
  navigation: {
    title: 'Navigation',
    lede: 'Le moteur de recherche, la page de démarrage, les favoris, l’historique et les téléchargements.'
  },
  privacy: {
    title: 'Confidentialité',
    lede: 'Ce qui reste ici, ce qui sort, et ce qui est arrêté avant même de partir.'
  },
  agent: {
    title: 'Agent',
    lede: 'Le modèle, les clés et les notes de l’agent. Il suit le modèle que vous activez.'
  },
  system: {
    title: 'Système',
    lede: 'Les raccourcis, les mises à jour et l’identité de l’application.'
  }
}

export default function SettingsPanel() {
  const view = useBrowser((state) => state.view)
  const setOverlay = useBrowser((state) => state.setOverlay)
  const updateSettings = useBrowser((state) => state.updateSettings)
  const toast = useBrowser((state) => state.toast)
  const sheetRef = useModalFocus<HTMLDivElement>({ initialFocus: 'container' })

  const [page, setPage] = useState<Page>('overview')
  const [tabRequest, setTabRequest] = useState<string | undefined>(undefined)
  const [scrollAnchor, setScrollAnchor] = useState<string | null>(null)
  const [navQuery, setNavQuery] = useState('')
  const [resultIndex, setResultIndex] = useState(0)
  const navInput = useRef<HTMLInputElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const systemDark = useSystemDark()
  const systemReduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const reducedMotion = view ? resolveMotion(view.settings.reduceMotion, systemReduced) : false
  const searching = navQuery.trim().length > 0
  const results = searching ? searchSettings(navQuery) : []
  const activeResult = results.length ? Math.min(resultIndex, results.length - 1) : 0
  const navGroups = NAV.map((group) => ({
    group: group.group,
    items: group.items.filter((item) =>
      normalizeSettingText(item.label).includes(normalizeSettingText(navQuery.trim()))
    )
  })).filter((group) => group.items.length > 0)

  const goTo = (next: SettingsPage, tab?: string, anchor?: string): void => {
    setTabRequest(tab)
    setScrollAnchor(anchor ?? null)
    setPage(next)
    setNavQuery('')
    setResultIndex(0)
  }

  const openTarget = (target: SettingsTarget): void => {
    goTo(target.page, target.tab, target.anchor)
  }

  useEffect(() => {
    if (!scrollAnchor) return
    const scope = scrollRef.current
    if (!scope) return
    const target =
      scope.querySelector(`[data-settings-anchor="${scrollAnchor}"]`) ??
      scope.querySelector(`#${scrollAnchor}`)
    if (!target) {
      setScrollAnchor(null)
      return
    }
    target.scrollIntoView?.({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' })
    target.classList.add('settings-search-target')
    window.setTimeout(() => target.classList.remove('settings-search-target'), 1800)
    setScrollAnchor(null)
  }, [scrollAnchor, page, tabRequest, reducedMotion])

  if (!view) return null

  const settings = view.settings
  const activeSpace = view.spaces.find((item) => item.id === view.activeSpaceId) ?? null
  const mode = resolveMode(settings.theme, {
    hourTheme: settings.hourTheme,
    hourStart: settings.hourStart,
    hourEnd: settings.hourEnd,
    systemDark
  })
  // L'aperçu suit le thème effectif : celui de l'espace s'il en porte un.
  const previewThemeId = resolveThemeId({
    globalTheme: settings.themeId,
    perSpace: settings.perSpaceThemes,
    spaceTheme: activeSpace?.theme ?? null
  })
  // L'aperçu suit l'accent effectif, pas seulement le thème effectif : un
  // espace qui porte sa propre teinte la montre ici aussi.
  const previewAccent = resolveAccent({
    globalAccent: settings.customAccent,
    globalOverride: settings.accentOverride,
    perSpace: settings.perSpaceThemes,
    spaceAccent: activeSpace?.accent ?? null
  })
  // Seuls les réglages d'apparence réarment l'accusé : changer d'onglet ou
  // recevoir un état sans rapport ne doit pas le faire clignoter.
  const savedSignature = [
    settings.theme,
    settings.themeId,
    settings.customAccent,
    settings.accentOverride,
    settings.homeBackground,
    settings.homeIntensity,
    settings.homeImage ?? '',
    settings.homeBlur,
    settings.skyVariant,
    settings.density,
    settings.textSize,
    settings.sidebarSide,
    settings.highContrast,
    settings.reduceMotion,
    settings.hourTheme,
    settings.hourStart,
    settings.hourEnd,
    settings.perSpaceThemes
  ].join('|')

  const chooseBackground = async (value: HomeBackground): Promise<void> => {
    if (value !== 'image') {
      await updateSettings({ homeBackground: value })
      return
    }
    if (settings.homeImage) {
      await updateSettings({ homeBackground: 'image' })
      return
    }
    const picked = await window.vela.appearance.pickImage()
    if (!picked) {
      toast('Image non lue : choisissez un PNG, JPEG, WebP ou AVIF de moins de 8 Mo.', 'error')
      return
    }
    await updateSettings({ homeImage: picked.path, homeBackground: 'image' })
    toast('Image d’accueil appliquée.')
  }

  const resetAppearance = (): void => {
    void updateSettings({
      themeId: 'indigo',
      customAccent: '#5b5bd6',
      accentOverride: false,
      glass: 'normal',
      glassBlur: 18,
      ambience: 'none',
      ambienceScope: 'page',
      ambienceIntensity: 80,
      homeBackground: 'gradient',
      homeIntensity: 'normal',
      homeImage: null,
      homeBlur: 18,
      skyVariant: 'braise',
      density: 'normal',
      textSize: 'normal',
      sidebarSide: 'left',
      reduceMotion: 'system',
      highContrast: false,
      hourTheme: false,
      hourStart: 7,
      hourEnd: 19,
      perSpaceThemes: false
    })
    toast('Apparence réinitialisée.')
  }

  const renderPage = () => {
    switch (page) {
      case 'overview':
        return (
          <OverviewPage
            settings={settings}
            mode={mode}
            previewThemeId={previewThemeId}
            previewAccent={previewAccent}
            onOpenPage={(next) => goTo(next)}
          />
        )

      case 'appearance':
        return (
          <AppearancePage
            settings={settings}
            mode={mode}
            previewThemeId={previewThemeId}
            previewAccent={previewAccent}
            updateSettings={updateSettings}
            chooseBackground={chooseBackground}
            resetAppearance={resetAppearance}
            initialTab={tabRequest}
          />
        )

      case 'navigation':
        return (
          <NavigationPage
            settings={settings}
            updateSettings={updateSettings}
            onOpenPrivacy={() => goTo('privacy')}
            bookmarkCount={view.bookmarks.length}
            historyCount={view.history.length}
            downloadCount={view.downloads.length}
            initialTab={tabRequest}
          />
        )

      case 'privacy':
        return (
          <PrivacyPage
            settings={settings}
            onOpenNavigation={() => goTo('navigation')}
            initialTab={tabRequest}
          />
        )

      case 'agent':
        return <AgentPage settings={settings} initialTab={tabRequest} />

      case 'system':
        return <SystemPage initialTab={tabRequest} />

      default:
        return null
    }
  }

  return (
    <div className="overlay" onMouseDown={() => setOverlay(null)}>
      <div
        ref={sheetRef}
        className="sheet settings-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Réglages"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !event.defaultPrevented) {
            event.preventDefault()
            event.stopPropagation()
            setOverlay(null)
            return
          }
          if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'f') return
          event.preventDefault()
          navInput.current?.focus()
        }}
      >
        {/* L’ambiance choisie joue aussi dans le panneau, derrière le verre.
            Elle est décorative et ne capte aucun clic. */}
        <AmbienceScene ambience={settings.ambience} className="ambience-panel" />
        <div className="settings-layout">
          <aside className="settings-nav">
            <div className="settings-nav-brand">
              <span className="wordmark" aria-hidden="true">
                Vela<span className="wordmark-dot">.</span>
              </span>
            </div>
            <div className="settings-nav-search">
              <Icon name="search" size={13} />
              <input
                ref={navInput}
                role="combobox"
                value={navQuery}
                onChange={(event) => {
                  setNavQuery(event.target.value)
                  setResultIndex(0)
                }}
                placeholder="Un réglage…"
                aria-label="Rechercher un réglage"
                aria-autocomplete="list"
                aria-haspopup="listbox"
                aria-expanded={results.length > 0}
                aria-controls={results.length > 0 ? 'settings-search-results' : undefined}
                aria-activedescendant={
                  results.length > 0 ? `settings-search-result-${activeResult}` : undefined
                }
                spellCheck={false}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    if (!navQuery) return
                    event.preventDefault()
                    setNavQuery('')
                    setResultIndex(0)
                    return
                  }
                  if (results.length === 0) return
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    setResultIndex((index) => Math.min(index + 1, results.length - 1))
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    setResultIndex((index) => Math.max(index - 1, 0))
                  } else if (event.key === 'Enter') {
                    event.preventDefault()
                    openTarget(results[activeResult])
                  }
                }}
              />
              <kbd aria-hidden="true">{shortcut('F')}</kbd>
            </div>
            {searching ? (
              <div className="settings-search-results">
                <p className="settings-search-label" role="status">
                  {results.length === 0
                    ? 'Aucun résultat'
                    : `${results.length} résultat${results.length > 1 ? 's' : ''}`}
                </p>
                {results.length === 0 ? (
                  <p className="settings-search-empty">
                    Essayez « thème », « notes » ou « mises à jour ».
                  </p>
                ) : (
                  <div
                    id="settings-search-results"
                    role="listbox"
                    aria-label="Résultats de recherche"
                  >
                    {results.map((entry, index) => (
                      <button
                        key={`${entry.page}-${entry.tab ?? 'root'}-${entry.anchor ?? entry.label}`}
                        type="button"
                        role="option"
                        id={`settings-search-result-${index}`}
                        className="settings-search-result"
                        aria-selected={index === activeResult}
                        onClick={() => openTarget(entry)}
                        onMouseEnter={() => setResultIndex(index)}
                      >
                        <span className="settings-search-result-copy">
                          <span className="settings-search-result-head">
                            <strong>{entry.label}</strong>
                            <span className="settings-search-result-group">{entry.group}</span>
                          </span>
                          <span className="settings-search-result-hint">{entry.hint}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <nav className="settings-nav-scroll" aria-label="Sections des réglages">
                {navGroups.map((group) => (
                  <div className="settings-nav-group" key={group.group}>
                    <p className="settings-nav-label">{group.group}</p>
                    {group.items.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className="settings-nav-item"
                        data-active={page === item.id}
                        aria-current={page === item.id ? 'page' : undefined}
                        onClick={() => goTo(item.id)}
                      >
                        <Icon name={item.icon} size={14} />
                        {item.label}
                      </button>
                    ))}
                  </div>
                ))}
              </nav>
            )}
          </aside>

          <div className="settings-pane">
            <header className="settings-head">
              <div className="settings-head-copy">
                {/* h2 : l'accueil garde le seul h1 de la fenêtre. Deux titres
                    de niveau 1 simultanés faisaient annoncer deux pages. */}
                <h2>{COPY[page].title}</h2>
                <p>{COPY[page].lede}</p>
              </div>
              <div className="settings-head-actions">
                <SavedIndicator value={savedSignature} />
                <button
                  type="button"
                  className="settings-close"
                  onClick={() => setOverlay(null)}
                  aria-label="Fermer"
                  title="Fermer"
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
            </header>
            {/* La clé change la courbe d’entrée à chaque section : le panneau
                glisse sans faire sauter le défilement du parent. */}
            <div ref={scrollRef} className="settings-scroll" key={`${page}:${tabRequest ?? ''}`}>
              {renderPage()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
