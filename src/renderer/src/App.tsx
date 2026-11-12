import { Suspense, lazy, useEffect } from 'react'
import AmbienceScene from './components/AmbienceScene'
import Onboarding from './components/chrome/Onboarding'
import PeekOverlay from './components/chrome/PeekOverlay'
import Presence from './components/Presence'
import Sidebar from './components/chrome/Sidebar'
import SpaceRail from './components/chrome/SpaceRail'
import Toasts from './components/Toasts'
import Workspace from './components/chrome/Workspace'
import { useBrowser } from './store/browser'
import { appearanceState, applyAppearance } from './lib/appearance'
import { differe } from './lib/differe'

// Les panneaux ne sont chargés qu'à leur première ouverture : le démarrage ne
// paie plus l'analyse des réglages, des notes, de l'agent et des overlays
// (plus de la moitié du bundle) et la mémoire du renderer reste plus basse.
const AgentCanvas = lazy(() => import('./components/agent/AgentCanvas'))
const BookmarksPanel = lazy(() => import('./components/panels/BookmarksPanel'))
const SessionsPanel = lazy(() => import('./components/panels/SessionsPanel'))
const ShieldPanel = lazy(() => import('./components/panels/ShieldPanel'))
const HistoryPanel = lazy(() => import('./components/panels/HistoryPanel'))
const CommandBar = lazy(() => import('./components/chrome/CommandBar'))
const DownloadsPanel = lazy(() => import('./components/panels/DownloadsPanel'))
const ProcessManager = lazy(() => import('./components/panels/ProcessManager'))
const NotesDrawer = lazy(() => import('./components/panels/NotesDrawer'))
// Les deux feuilles du rail se chargent sans Suspense : `lazy` imposait à la
// première ouverture le délai de reprise de React (~300 ms, même module déjà
// en mémoire). Ici le module est préchargé au repos et la surface s'ouvre à
// l'image suivante, sans revenir au bundle de démarrage.
const reglages = differe(() => import('./components/settings/SettingsPanel'))
const profil = differe(() => import('./components/space/SpaceDialog'))
const SettingsPanel = reglages.Panneau
const SpaceDialog = profil.Panneau

export default function App() {
  const ready = useBrowser((state) => state.ready)
  const onboarded = useBrowser((state) => state.view?.settings.onboarded ?? true)
  const overlay = useBrowser((state) => state.overlay)
  const collapsed = useBrowser((state) => state.view?.settings.sidebarCollapsed ?? false)
  const compact = useBrowser((state) => state.compactViewport)
  const notesOpen = useBrowser((state) => state.notesOpen)
  const agentOpen = useBrowser((state) => state.agentOpen)
  const settings = useBrowser((state) => state.view?.settings ?? null)
  const space = useBrowser((state) => {
    const view = state.view
    if (!view) return null
    return view.spaces.find((item) => item.id === view.activeSpaceId) ?? null
  })
  const ambience = useBrowser((state) => state.view?.settings.ambience ?? 'none')
  // L'accueil de bienvenue couvre la fenêtre comme une feuille : le fond doit
  // être inerte pendant qu'il est ouvert, pas seulement sous un overlay.
  const backgroundInert = Boolean(overlay) || !onboarded

  useEffect(() => {
    void useBrowser.getState().init()
  }, [])

  // Préchargement pendant un temps mort : le châssis est déjà peint quand le
  // navigateur analyse les deux modules, donc le démarrage ne les attend pas.
  // La première ouverture des Réglages ou du dialogue de profil ne paie plus
  // les ~300 ms de chargement du module. Si le temps mort tarde, le délai de
  // repli le déclenche ; au démontage, la tâche est annulée.
  useEffect(() => {
    if (!ready) return
    let annule = false
    const charger = (): void => {
      if (annule) return
      void reglages.precharger()
      void profil.precharger()
    }
    const tempsMort =
      typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback(charger, { timeout: 1500 })
        : null
    const repli = tempsMort === null ? window.setTimeout(charger, 800) : null
    return () => {
      annule = true
      if (tempsMort !== null) window.cancelIdleCallback(tempsMort)
      if (repli !== null) window.clearTimeout(repli)
    }
  }, [ready])

  // Largeur de la coque : le repli automatique de la barre latérale et la garde
  // de la vue scindée en dépendent. `ready` relance la mesure une fois l'état
  // diffusé, sinon une fenêtre étroite ouverte au démarrage restait dépliée.
  // Un tiroir ouvert change aussi la place disponible sans `resize`.
  useEffect(() => {
    const sync = (): void => useBrowser.getState().syncViewport(window.innerWidth)
    sync()
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [ready, notesOpen, agentOpen])

  // Mode, thème de couleur et intensité du verre : un seul passage pose tous
  // les jetons. L'espace actif peut fournir son propre thème.
  useEffect(() => {
    if (!settings) return
    const state = appearanceState(settings, space)
    applyAppearance(state)
    const root = document.documentElement
    // La couleur d'un espace est choisie sur le papier clair : sur le noir, la
    // même teinte passe sous le seuil de lisibilité. En sombre, elle est
    // éclaircie une fois ici, et tous les repères (barre active, pastille du
    // « P », contours d'icônes) en héritent ensemble.
    const spaceColor = space?.color ?? '#5B5BD6'
    root.style.setProperty(
      '--space-color',
      state.mode === 'dark' ? `color-mix(in srgb, ${spaceColor} 58%, white)` : spaceColor
    )
    root.dataset.home = settings.homeBackground
    root.dataset.homeIntensity = settings.homeIntensity
    root.style.setProperty('--home-blur', `${settings.homeBlur}px`)
    // Ambiance propre à l'espace : une couche derrière le châssis, jamais
    // au-dessus du contenu des pages.
    root.dataset.spaceBg = space?.background ?? 'none'
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
    <div
      className="app"
      data-compact={compact}
      // Un tiroir ancré à droite retire ~340 px à l'accueil : la grille doit
      // le savoir, sinon elle garde deux colonnes trop étroites.
      data-drawer={notesOpen || agentOpen ? 'true' : undefined}
    >
      {/* L’ambiance habille le châssis : un calque fixe derrière le verre,
          jamais au-dessus du contenu des pages (WebContentsView séparées). */}
      <AmbienceScene ambience={ambience} className="ambience-chrome" />
      {/* Rail, barre, page et tiroirs forment le fond : `inert` les retire
          ensemble du clavier et de l'arbre d'accessibilité dès qu'une feuille
          modale s'ouvre. Sans cela, le titre de la feuille et celui de
          l'accueil étaient annoncés tous les deux comme des h1. */}
      <div className="app-bg" inert={backgroundInert ? true : undefined}>
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
        </Suspense>
      </div>
      <Suspense fallback={null}>
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
        <Presence open={overlay === 'shield'} exit={!overlay}>
          <ShieldPanel />
        </Presence>
        {/* L’accueil se retire le temps d’un panneau : sans cela, il recouvrait
            les réglages ouverts depuis « Votre clé ou Ollama » et le bouton
            semblait ne rien faire. */}
        {!onboarded && !overlay && <Onboarding />}
      </Suspense>
      <Toasts />
      <PeekOverlay />
    </div>
  )
}
