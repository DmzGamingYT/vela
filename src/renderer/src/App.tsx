import { Suspense, lazy, useEffect } from 'react'
import AmbienceScene from './components/AmbienceScene'
import Onboarding from './components/Onboarding'
import Presence from './components/Presence'
import Sidebar from './components/Sidebar'
import SpaceRail from './components/SpaceRail'
import Toasts from './components/Toasts'
import Workspace from './components/Workspace'
import { useBrowser } from './store/browser'
import { appearanceState, applyAppearance } from './lib/appearance'

// Les panneaux ne sont chargés qu'à leur première ouverture : le démarrage ne
// paie plus l'analyse des réglages, des notes, de l'agent et des overlays
// (plus de la moitié du bundle) et la mémoire du renderer reste plus basse.
const AgentCanvas = lazy(() => import('./components/AgentCanvas'))
const BookmarksPanel = lazy(() => import('./components/BookmarksPanel'))
const SessionsPanel = lazy(() => import('./components/SessionsPanel'))
const HistoryPanel = lazy(() => import('./components/HistoryPanel'))
const CommandBar = lazy(() => import('./components/CommandBar'))
const DownloadsPanel = lazy(() => import('./components/DownloadsPanel'))
const ProcessManager = lazy(() => import('./components/ProcessManager'))
const NotesDrawer = lazy(() => import('./components/NotesDrawer'))
const SettingsPanel = lazy(() => import('./components/SettingsPanel'))
const SpaceDialog = lazy(() => import('./components/SpaceDialog'))

export default function App() {
  const ready = useBrowser((state) => state.ready)
  const onboarded = useBrowser((state) => state.view?.settings.onboarded ?? true)
  const overlay = useBrowser((state) => state.overlay)
  const collapsed = useBrowser((state) => state.view?.settings.sidebarCollapsed ?? false)
  const notesOpen = useBrowser((state) => state.notesOpen)
  const agentOpen = useBrowser((state) => state.agentOpen)
  const settings = useBrowser((state) => state.view?.settings ?? null)
  const space = useBrowser((state) => {
    const view = state.view
    if (!view) return null
    return view.spaces.find((item) => item.id === view.activeSpaceId) ?? null
  })
  const ambience = useBrowser((state) => state.view?.settings.ambience ?? 'none')

  useEffect(() => {
    void useBrowser.getState().init()
  }, [])

  // Mode, thème de couleur et intensité du verre : un seul passage pose tous
  // les jetons. L'espace actif peut fournir son propre thème.
  useEffect(() => {
    if (!settings) return
    applyAppearance(appearanceState(settings, space))
    const root = document.documentElement
    root.dataset.home = settings.homeBackground
    root.style.setProperty('--home-blur', `${settings.homeBlur}px`)
    // Ambiance propre à l'espace : une couche derrière le châssis, jamais
    // au-dessus du contenu des pages.
    root.dataset.spaceBg = space?.background ?? 'none'
    root.style.setProperty('--space-color', space?.color ?? '#5B5BD6')
  }, [settings, space])

  // Suit le système et, si l'option est active, l'heure (clair le jour).
  useEffect(() => {
    if (!settings) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      applyAppearance(appearanceState(settings, space))
    }
    media.addEventListener('change', apply)
    const timer = settings.hourTheme ? window.setInterval(apply, 60_000) : null
    return () => {
      media.removeEventListener('change', apply)
      if (timer !== null) window.clearInterval(timer)
    }
  }, [settings, space])

  // Image d'accueil : lue à la demande, jamais incluse dans l'état diffusé.
  const homeBackground = settings?.homeBackground
  const homeImage = settings?.homeImage
  useEffect(() => {
    if (homeBackground !== 'image' || !homeImage) {
      document.documentElement.style.removeProperty('--home-image')
      return
    }
    let alive = true
    void window.vela.appearance.image().then((dataUrl) => {
      if (!alive) return
      if (dataUrl) document.documentElement.style.setProperty('--home-image', `url("${dataUrl}")`)
      else document.documentElement.style.removeProperty('--home-image')
    })
    return () => {
      alive = false
    }
  }, [homeBackground, homeImage])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const state = useBrowser.getState()
      // Parcours des onglets depuis la coque : les pages ont leur propre
      // gestionnaire dans le processus principal, la barre d’onglets non.
      if (event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.key === 'Tab' || event.key === 'PageDown' || event.key === 'PageUp') {
          event.preventDefault()
          const backwards = event.shiftKey || event.key === 'PageUp'
          state.handleShortcut({ action: backwards ? 'prev-tab' : 'next-tab' })
          return
        }
      }
      // ⌘⇧[ / ⌘⇧] : le code de touche reste le même sur tous les claviers.
      if ((event.metaKey || event.ctrlKey) && event.shiftKey) {
        if (event.code === 'BracketRight' || event.code === 'BracketLeft') {
          event.preventDefault()
          state.handleShortcut({ action: event.code === 'BracketRight' ? 'next-tab' : 'prev-tab' })
          return
        }
      }
      // Zoom depuis la coque : la page a son propre gestionnaire, pas la barre
      // latérale ni le tiroir de notes.
      if ((event.metaKey || event.ctrlKey) && !event.altKey) {
        const zoomAction =
          event.key === '+' || event.key === '=' || event.code === 'NumpadAdd'
            ? 'zoom-in'
            : event.key === '-' || event.key === '–' || event.code === 'NumpadSubtract'
              ? 'zoom-out'
              : event.key === '0' || event.code === 'Numpad0'
                ? 'zoom-reset'
                : null
        if (zoomAction) {
          event.preventDefault()
          state.handleShortcut({ action: zoomAction })
          return
        }
      }
      if (event.key !== 'Escape') return
      // Un champ ou un menu qui a déjà traité Échap garde la main : vider un
      // filtre ne doit pas refermer le panneau par-dessus.
      if (event.defaultPrevented) return
      if (state.overlay) {
        event.preventDefault()
        state.setOverlay(null)
      } else if (state.notesOpen) {
        state.toggleNotes(false)
      } else if (state.agentOpen) {
        state.toggleAgent(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!ready) {
    return (
      <div className="boot">
        <span className="boot-mark">Vela</span>
        <span className="boot-line" />
      </div>
    )
  }

  return (
    <div className="app">
      {/* L’ambiance habille le châssis : un calque fixe derrière le verre,
          jamais au-dessus du contenu des pages (WebContentsView séparées). */}
      <AmbienceScene ambience={ambience} className="ambience-chrome" />
      <SpaceRail />
      <Sidebar collapsed={collapsed} />
      <Workspace />
      <Suspense fallback={null}>
        <Presence open={agentOpen} exit={!notesOpen}>
          <AgentCanvas docked />
        </Presence>
        <Presence open={notesOpen} exit={!agentOpen}>
          <NotesDrawer />
        </Presence>
        <Presence open={overlay === 'command'} exit={!overlay}>
          <CommandBar />
        </Presence>
        <Presence open={overlay === 'sessions'} exit={!overlay}>
          <SessionsPanel />
        </Presence>
        <Presence open={overlay === 'settings'} exit={!overlay}>
          <SettingsPanel />
        </Presence>
        <Presence open={overlay === 'space'} exit={!overlay}>
          <SpaceDialog />
        </Presence>
        <Presence open={overlay === 'processes'} exit={!overlay}>
          <ProcessManager />
        </Presence>
        <Presence open={overlay === 'downloads'} exit={!overlay}>
          <DownloadsPanel />
        </Presence>
        <Presence open={overlay === 'history'} exit={!overlay}>
          <HistoryPanel />
        </Presence>
        <Presence open={overlay === 'bookmarks'} exit={!overlay}>
          <BookmarksPanel />
        </Presence>
        {/* L’accueil se retire le temps d’un panneau : sans cela, il recouvrait
            les réglages ouverts depuis « Votre clé ou Ollama » et le bouton
            semblait ne rien faire. */}
        {!onboarded && !overlay && <Onboarding />}
      </Suspense>
      <Toasts />
    </div>
  )
}
