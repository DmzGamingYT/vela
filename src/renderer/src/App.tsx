import { useEffect } from 'react'
import AgentCanvas from './components/AgentCanvas'
import BookmarksPanel from './components/BookmarksPanel'
import BriefPanel from './components/BriefPanel'
import HistoryPanel from './components/HistoryPanel'
import CommandBar from './components/CommandBar'
import DownloadsPanel from './components/DownloadsPanel'
import Onboarding from './components/Onboarding'
import ProcessManager from './components/ProcessManager'
import NotesDrawer from './components/NotesDrawer'
import ProtectionPanel from './components/ProtectionPanel'
import SettingsPanel from './components/SettingsPanel'
import Sidebar from './components/Sidebar'
import SpaceDialog from './components/SpaceDialog'
import SpaceRail from './components/SpaceRail'
import Toasts from './components/Toasts'
import Workspace from './components/Workspace'
import { useBrowser } from './store/browser'
import { appearanceState, applyAppearance } from './lib/appearance'

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
  useEffect(() => {
    if (!settings || settings.homeBackground !== 'image' || !settings.homeImage) {
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
  }, [settings?.homeBackground, settings?.homeImage])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      const state = useBrowser.getState()
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
      <SpaceRail />
      {!collapsed && <Sidebar />}
      <Workspace />
      {agentOpen && <AgentCanvas docked />}
      {notesOpen && <NotesDrawer />}
      {overlay === 'command' && <CommandBar />}
      {overlay === 'brief' && <BriefPanel />}
      {overlay === 'settings' && <SettingsPanel />}
      {overlay === 'space' && <SpaceDialog />}
      {overlay === 'processes' && <ProcessManager />}
      {overlay === 'downloads' && <DownloadsPanel />}
      {overlay === 'history' && <HistoryPanel />}
      {overlay === 'bookmarks' && <BookmarksPanel />}
      {overlay === 'protection' && <ProtectionPanel />}
      {!onboarded && <Onboarding />}
      <Toasts />
    </div>
  )
}
