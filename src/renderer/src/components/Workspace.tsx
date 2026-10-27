import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import type { TabView } from '@shared/types'
import { hostOf, isHomeUrl } from '@shared/url'
import { clamp } from '../lib/format'
import { useBrowser } from '../store/browser'
import { Icon } from './Icon'
import StatusBar from './StatusBar'
import PaneHeader from './PaneHeader'
import StartPage from './StartPage'
import TunnelView from './TunnelView'

function ErrorPane({ tab }: { tab: TabView }) {
  const reload = useBrowser((state) => state.reload)
  const navigate = useBrowser((state) => state.navigate)

  return (
    <div className="error-pane">
      <span className="error-icon">
        <Icon name="warning" size={22} />
      </span>
      <h2>Cette page n’a pas répondu</h2>
      <p>{tab.error ?? 'Le chargement a été interrompu.'}</p>
      <p className="error-host">{hostOf(tab.url)}</p>
      <div className="error-actions">
        <button type="button" className="action primary" onClick={() => reload(tab.id)}>
          <Icon name="reload" size={14} />
          Recharger
        </button>
        <button type="button" className="action" onClick={() => navigate(tab.id, 'https://duckduckgo.com')}>
          Chercher ailleurs
        </button>
      </div>
    </div>
  )
}

function Pane({
  tab,
  primary,
  secondary = false,
  resizing
}: {
  tab: TabView
  primary: boolean
  secondary?: boolean
  resizing: boolean
}) {
  const home = isHomeUrl(tab.url)

  return (
    <section className="pane" data-primary={primary} data-resizing={resizing}>
      <PaneHeader tab={tab} primary={primary} secondary={secondary} />
      {tab.loading && <span className="load-line" />}
      <div className="pane-body" data-pane-tab={home ? undefined : tab.id}>
        {home ? (
          <StartPage tabId={tab.id} />
        ) : (
          <>
            <div className="pane-ghost">
              <span className="pane-ghost-host">{hostOf(tab.url)}</span>
              <span className="pane-ghost-title">{tab.title}</span>
            </div>
            {tab.error && <ErrorPane tab={tab} />}
          </>
        )}
      </div>
    </section>
  )
}

export default function Workspace() {
  const view = useBrowser((state) => state.view)
  const overlay = useBrowser((state) => state.overlay)
  const workMode = useBrowser((state) => state.workMode)
  const notesOpen = useBrowser((state) => state.notesOpen)
  const agentOpen = useBrowser((state) => state.agentOpen)
  const liveRatio = useBrowser((state) => state.splitRatioLive)
  const setSplitRatio = useBrowser((state) => state.setSplitRatio)
  const commitSplitRatio = useBrowser((state) => state.commitSplitRatio)
  const findOpen = useBrowser((state) => state.findOpen)
  const findQuery = useBrowser((state) => state.findQuery)
  const findResult = useBrowser((state) => state.findResult)
  const activeTabId = useBrowser((state) => state.view?.activeTabId)
  const findInPage = useBrowser((state) => state.findInPage)
  const closeFind = useBrowser((state) => state.closeFind)
  const findInput = useRef<HTMLInputElement>(null)
  const findDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!findOpen) return
    findInput.current?.focus()
    findInput.current?.select()
  }, [findOpen, activeTabId])

  useEffect(() => () => {
    if (findDebounce.current) clearTimeout(findDebounce.current)
  }, [])

  const panesRef = useRef<HTMLDivElement>(null)
  const resizingRef = useRef(false)
  const [resizing, setResizing] = useState(false)

  const ratio = liveRatio ?? view?.splitRatio ?? 0.5
  const errorKey = view?.tabs.map((tab) => (tab.error ? '1' : '0')).join('') ?? ''
  // Les onglets d'accueil n'ont pas de page native : quand un onglet passe de
  // l'accueil à une page (ou l'inverse), la scène change de contenu sans que
  // l'identifiant de l'onglet bouge. Cette signature force un nouveau calcul
  // de disposition, sinon la page reste chargée mais invisible.
  const paneKey = view
    ? view.tabs.map((tab) => `${tab.id}:${isHomeUrl(tab.url) ? 'h' : 'p'}`).join('|')
    : ''

  const sendLayout = useCallback(() => {
    const state = useBrowser.getState()
    if (!state.view) return
    // En mode Work, l’atelier couvre la scène : aucune page native visible —
    // sauf lorsqu’une vue scindée y installe une source à côté de la carte.
    const workSplit = Boolean(state.workMode === 'work' && state.view.split && state.view.secondTabId)
    if ((state.workMode === 'work' && !workSplit) || state.overlay || resizingRef.current) {
      window.vela.views.layout({ panes: [], overlay: true })
      return
    }
    const nodes = document.querySelectorAll<HTMLElement>('[data-pane-tab]')
    const panes = Array.from(nodes).flatMap((node) => {
      const rect = node.getBoundingClientRect()
      if (rect.width < 8 || rect.height < 8) return []
      return [
        {
          tabId: node.dataset.paneTab ?? '',
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height
        }
      ]
    })
    window.vela.views.layout({ panes, overlay: false })
  }, [])

  useEffect(() => {
    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(sendLayout)
    }
    schedule()
    const observer = new ResizeObserver(schedule)
    if (panesRef.current) observer.observe(panesRef.current)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [
    sendLayout,
    view?.activeTabId,
    view?.secondTabId,
    view?.split,
    ratio,
    errorKey,
    notesOpen,
    agentOpen,
    overlay,
    workMode,
    resizing,
    view?.settings.sidebarCollapsed,
    paneKey
  ])

  if (!view) return <main className="workspace" />

  const active = view.tabs.find((tab) => tab.id === view.activeTabId)
  const second = view.secondTabId ? view.tabs.find((tab) => tab.id === view.secondTabId) : undefined
  const split = Boolean(view.split && second)

  if (!active) return <main className="workspace" />

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const container = panesRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const apply = (clientX: number): number => clamp((clientX - rect.left) / rect.width, 0.25, 0.75)
    resizingRef.current = true
    setResizing(true)
    document.body.style.cursor = 'col-resize'
    window.vela.views.layout({ panes: [], overlay: true })

    const move = (moveEvent: PointerEvent): void => setSplitRatio(apply(moveEvent.clientX))
    const up = (upEvent: PointerEvent): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
      resizingRef.current = false
      setResizing(false)
      commitSplitRatio(apply(upEvent.clientX))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  if (workMode === 'work') {
    // Mode Travail : le tunnel de recherche occupe la scène ; l’agent reste
    // accessible en panneau (⌘J) sans masquer la carte. Une source s’ouvre en
    // vue scindée à droite, la carte restant visible à gauche.
    return (
      <main
        className="workspace work"
        data-resizing={resizing}
        data-split={split}
        data-collapsed={view.settings.sidebarCollapsed}
      >
        <div
          className={`work-split${split ? ' is-split' : ''}`}
          ref={panesRef}
          style={{ '--ratio': `${ratio * 100}%` } as CSSProperties}
        >
          <div className="work-stage">
            <TunnelView />
          </div>
          {split && second && (
            <>
              <div
                className="split-handle"
                role="separator"
                aria-orientation="vertical"
                aria-label="Largeur de la carte"
                onPointerDown={startDrag}
                onDoubleClick={() => commitSplitRatio(0.5)}
              >
                <span />
              </div>
              <Pane tab={second} primary={false} secondary resizing={resizing} />
            </>
          )}
        </div>
        <StatusBar />
      </main>
    )
  }

  return (
    <main
      className="workspace"
      data-resizing={resizing}
      data-collapsed={view.settings.sidebarCollapsed}
    >
      {findOpen && (
        <div className="find-bar" role="search" aria-label="Rechercher dans la page">
          <input
            ref={findInput}
            value={findQuery}
            placeholder="Rechercher dans la page"
            aria-label="Texte recherché"
            onChange={(event) => {
              const value = event.target.value
              useBrowser.setState({ findQuery: value, findResult: { matches: 0, activeMatchOrdinal: 0 } })
              if (findDebounce.current) clearTimeout(findDebounce.current)
              findDebounce.current = setTimeout(() => void findInPage(value), 120)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeFind()
              if (event.key === 'Enter') void findInPage(findQuery, !event.shiftKey)
            }}
          />
          <span aria-live="polite">{findResult.matches ? `${findResult.activeMatchOrdinal} / ${findResult.matches}` : findQuery ? 'Aucun résultat' : ''}</span>
          <button type="button" className="icon-btn" aria-label="Correspondance précédente" onClick={() => void findInPage(findQuery, false)}>↑</button>
          <button type="button" className="icon-btn" aria-label="Correspondance suivante" onClick={() => void findInPage(findQuery, true)}>↓</button>
          <button type="button" className="icon-btn" aria-label="Fermer la recherche" onClick={closeFind}><Icon name="close" size={14} /></button>
        </div>
      )}
      <div
        className={`panes${split ? ' is-split' : ''}`}
        ref={panesRef}
        style={{ '--ratio': `${ratio * 100}%` } as CSSProperties}
      >
        <Pane tab={active} primary resizing={resizing} />
        {split && second && (
          <>
            <div
              className="split-handle"
              role="separator"
              aria-orientation="vertical"
              onPointerDown={startDrag}
              onDoubleClick={() => commitSplitRatio(0.5)}
            >
              <span />
            </div>
            <Pane tab={second} primary={false} secondary resizing={resizing} />
          </>
        )}
      </div>
      <StatusBar />
    </main>
  )
}
