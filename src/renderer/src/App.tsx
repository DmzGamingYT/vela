import { useEffect } from 'react'
import AgentCanvas from './components/AgentCanvas'
import BriefPanel from './components/BriefPanel'
import CommandBar from './components/CommandBar'
import DownloadsPanel from './components/DownloadsPanel'
import Onboarding from './components/Onboarding'
import ProcessManager from './components/ProcessManager'
import NotesDrawer from './components/NotesDrawer'
import SettingsPanel from './components/SettingsPanel'
import Sidebar from './components/Sidebar'
import SpaceDialog from './components/SpaceDialog'
import SpaceRail from './components/SpaceRail'
import Toasts from './components/Toasts'
import Workspace from './components/Workspace'
import { useBrowser } from './store/browser'

function applyTheme(theme: 'light' | 'dark' | 'system'): void {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

export default function App() {
  const ready = useBrowser((state) => state.ready)
  const onboarded = useBrowser((state) => state.view?.settings.onboarded ?? true)
  const overlay = useBrowser((state) => state.overlay)
  const collapsed = useBrowser((state) => state.view?.settings.sidebarCollapsed ?? false)
  const notesOpen = useBrowser((state) => state.notesOpen)
  const theme = useBrowser((state) => state.view?.settings.theme ?? 'system')
  const spaceColor = useBrowser((state) => {
    const view = state.view
    if (!view) return null
    return view.spaces.find((space) => space.id === view.activeSpaceId)?.color ?? null
  })

  useEffect(() => {
    void useBrowser.getState().init()
  }, [])

  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = (): void => applyTheme('system')
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [theme])

  // Identité visuelle pilotée par l'espace actif (façon Dia) : la couleur
  // du profil teinte pastille, indicateur d'onglet et lueur d'accueil.
  useEffect(() => {
    if (spaceColor) document.documentElement.style.setProperty('--space-accent', spaceColor)
  }, [spaceColor])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      const state = useBrowser.getState()
      if (state.overlay) {
        event.preventDefault()
        state.setOverlay(null)
      } else if (state.notesOpen) {
        state.toggleNotes(false)
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
      {notesOpen && <NotesDrawer />}
      {overlay === 'command' && <CommandBar />}
      {overlay === 'brief' && <BriefPanel />}
      {overlay === 'agent' && <AgentCanvas />}
      {overlay === 'settings' && <SettingsPanel />}
      {overlay === 'space' && <SpaceDialog />}
      {overlay === 'processes' && <ProcessManager />}
      {overlay === 'downloads' && <DownloadsPanel />}
      {!onboarded && <Onboarding />}
      <Toasts />
    </div>
  )
}
