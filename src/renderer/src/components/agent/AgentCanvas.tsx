import { useEffect, useRef, useState } from 'react'
import { isLoopbackEndpoint, providerReady, providerState } from '@shared/providers'
import { isHomeUrl } from '@shared/url'
import { shortcut } from '../../lib/format'
import { useBrowser } from '../../store/browser'
import ChatComposer, { type ComposerTab } from './ChatComposer'
import ChatTranscript from './ChatTranscript'
import { Icon } from '../Icon'
import TileMenu, { type TileMenuItem } from '../tabs/TileMenu'
import WorkList from '../WorkList'

/** Largeur du panneau : 420 par défaut, 340 au plus étroit, 640 au plus large. */
const DEFAULT_WIDTH = 420
const MIN_WIDTH = 340
const MAX_WIDTH = 640
const WIDE_WIDTH = 560
const WIDTH_KEY = 'vela.agent.width'

function readWidths(): Record<string, number> {
  try {
    const raw = localStorage.getItem(WIDTH_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {}
  } catch {
    return {}
  }
}

function clampWidth(value: number, windowWidth: number): number {
  // La moitié de la fenêtre est une borne : au-delà, la page n'aurait plus
  // assez de place pour rester lisible.
  const ceiling = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(windowWidth / 2)))
  return Math.min(ceiling, Math.max(MIN_WIDTH, Math.round(value)))
}

/**
 * L’atelier est un chat : on demande, l’agent répond et agit, les actions
 * apparaissent dans le fil.
 *
 * Le panneau se règle : poignée à gauche, largeur mémorisée par espace de
 * travail, double-clic qui revient à 420, « Agrandir » qui bascule à 560.
 * Sous 900 px de fenêtre, il flotte au-dessus de la page au lieu de la pousser.
 */
export default function AgentCanvas({
  embedded = false,
  docked = false
}: {
  embedded?: boolean
  docked?: boolean
}) {
  const view = useBrowser((state) => state.view)
  const agent = useBrowser((state) => state.agent)
  const running = agent.status === 'running'
  const setOverlay = useBrowser((state) => state.setOverlay)
  const toggleAgent = useBrowser((state) => state.toggleAgent)
  const startAgent = useBrowser((state) => state.startAgent)
  const cancelAgent = useBrowser((state) => state.cancelAgent)
  const approved = useBrowser((state) => state.approved)
  const setApproved = useBrowser((state) => state.setApproved)
  const resetAgent = useBrowser((state) => state.resetAgent)
  const saveAgentNote = useBrowser((state) => state.saveAgentNote)
  const openWork = useBrowser((state) => state.openWork)
  const agentSourceTab = useBrowser((state) => state.agentSourceTab)
  const toast = useBrowser((state) => state.toast)
  const [showWorks, setShowWorks] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  const [prompt, setPrompt] = useState(() => useBrowser.getState().agentDraft)
  const [mode, setMode] = useState<'answer' | 'act'>(() => useBrowser.getState().agent.requestMode)
  const [selected, setSelected] = useState<string[]>(() => {
    const initial = useBrowser.getState().view
    if (!initial) return []
    return initial.tabs
      .filter((tab) => !isHomeUrl(tab.url) && tab.spaceId === initial.activeSpaceId)
      .slice(0, 6)
      .map((tab) => tab.id)
  })

  const spaceId = view?.activeSpaceId ?? ''
  const [width, setWidth] = useState(() => readWidths()[spaceId] ?? DEFAULT_WIDTH)
  const [windowWidth, setWindowWidth] = useState(() =>
    typeof window === 'undefined' ? 1440 : window.innerWidth
  )
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const frameRef = useRef(0)
  const pendingWidth = useRef(0)

  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Largeur de la fenêtre : elle décide du mode flottant et de la borne haute.
  useEffect(() => {
    const onResize = (): void => {
      setWindowWidth(window.innerWidth)
      // Rétrécir la fenêtre resserre le panneau : il ne doit jamais dépasser
      // la moitié de la place disponible.
      setWidth((current) => clampWidth(current, window.innerWidth))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Une largeur par espace : changer d'espace rend la sienne.
  useEffect(() => {
    if (!spaceId) return
    setWidth(clampWidth(readWidths()[spaceId] ?? DEFAULT_WIDTH, window.innerWidth))
  }, [spaceId])

  const remember = (value: number): void => {
    if (!spaceId) return
    try {
      const map = readWidths()
      map[spaceId] = value
      localStorage.setItem(WIDTH_KEY, JSON.stringify(map))
    } catch {
      /* stockage indisponible : la largeur vaut pour la session */
    }
  }

  const commit = (value: number): void => {
    const next = clampWidth(value, windowWidth)
    setWidth(next)
    remember(next)
  }

  // Glissement : une écriture par image au plus (≈ 60 par seconde), puis une
  // dernière application au relâchement.
  const onResizeMove = (event: PointerEvent): void => {
    const drag = dragRef.current
    if (!drag) return
    pendingWidth.current = drag.startWidth + (drag.startX - event.clientX)
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0
      setWidth(clampWidth(pendingWidth.current, windowWidth))
    })
  }

  const endResize = (): void => {
    if (!dragRef.current) return
    dragRef.current = null
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
    }
    window.removeEventListener('pointermove', onResizeMove)
    window.removeEventListener('pointerup', endResize)
    setWidth((current) => {
      const next = clampWidth(current, windowWidth)
      remember(next)
      return next
    })
  }

  const startResize = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (embedded) return
    event.preventDefault()
    dragRef.current = { startX: event.clientX, startWidth: width }
    window.addEventListener('pointermove', onResizeMove)
    window.addEventListener('pointerup', endResize)
  }

  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      window.removeEventListener('pointermove', onResizeMove)
      window.removeEventListener('pointerup', endResize)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  // Échap arrête un agent en cours, sans fermer le panneau.
  useEffect(() => {
    if (!running) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      cancelAgent()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [running, cancelAgent])

  // Dans l’atelier (mode Work), la demande a le focus dès l’arrivée.
  useEffect(() => {
    if (embedded) inputRef.current?.focus()
  }, [embedded])

  // Ouverture depuis une sélection de page : l’onglet d’origine est joint.
  useEffect(() => {
    if (!agentSourceTab) return
    queueMicrotask(() => {
      setSelected((current) =>
        current.includes(agentSourceTab) ? current : [...current, agentSourceTab]
      )
      useBrowser.setState({ agentSourceTab: null })
      inputRef.current?.focus()
    })
  }, [agentSourceTab])

  if (!view) return null

  const configured = providerReady(view.settings)
  const engine = providerState(view.settings)
  const engineLocal = isLoopbackEndpoint(engine.baseUrl)
  const engineLabel = configured ? engine.model.trim() || 'modèle local' : 'Démo locale'
  const tabs: ComposerTab[] = view.tabs
    .filter((tab) => !isHomeUrl(tab.url))
    .sort(
      (a, b) => Number(b.spaceId === view.activeSpaceId) - Number(a.spaceId === view.activeSpaceId)
    )
    .map((tab) => ({ id: tab.id, title: tab.title, url: tab.url, favicon: tab.favicon }))

  const floating = windowWidth < 900
  const expanded = width > DEFAULT_WIDTH

  const run = (): void => {
    setApproved(false)
    if (running) return
    if (!prompt.trim()) {
      toast(
        mode === 'act' ? 'Dites à l’agent quoi faire.' : 'Dites à l’agent quoi chercher.',
        'error'
      )
      inputRef.current?.focus()
      return
    }
    if (mode === 'answer' && selected.length === 0) {
      toast('Joignez au moins une page à lire.', 'error')
      return
    }
    void startAgent(prompt, selected, mode)
    setPrompt('')
  }

  const toggleSource = (id: string): void => {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    )
  }

  const copy = async (): Promise<void> => {
    if (!agent.markdown) return
    try {
      await navigator.clipboard.writeText(agent.markdown)
      toast('Réponse copiée.')
    } catch {
      toast('Copie impossible.', 'error')
    }
  }

  const menuItems: TileMenuItem[] = [
    {
      id: 'new',
      label: 'Nouvelle conversation',
      icon: 'plus',
      onSelect: () => resetAgent()
    },
    {
      id: 'history',
      label: 'Conversations enregistrées',
      icon: 'inbox',
      onSelect: () => setShowWorks(true)
    },
    {
      id: 'clear',
      label: 'Effacer la conversation',
      icon: 'trash',
      danger: true,
      onSelect: () => resetAgent()
    },
    { id: 'sep', label: '', separator: true },
    {
      id: 'settings',
      label: 'Réglages de l’Agent',
      icon: 'settings',
      onSelect: () => setOverlay('settings')
    }
  ]

  const canvas = (
    <div
      className="agent"
      data-embedded={embedded}
      data-docked={docked}
      data-wide={expanded}
      role={embedded ? 'region' : docked ? 'complementary' : 'dialog'}
      aria-label={embedded ? 'Atelier Vela' : 'Agent Vela'}
    >
      <header className="agent-head">
        <div className="agent-identity">
          <span className="agent-mark">
            <Icon name="sparkles" size={18} />
          </span>
          <h1>{embedded ? 'Atelier' : 'Agent'}</h1>
        </div>
        <div className="agent-head-actions">
          {!embedded && (
            <button
              type="button"
              className="icon-btn"
              aria-label={expanded ? 'Réduire le panneau' : 'Agrandir le panneau'}
              title={expanded ? 'Réduire' : 'Agrandir'}
              aria-pressed={expanded}
              onClick={() => commit(expanded ? DEFAULT_WIDTH : WIDE_WIDTH)}
            >
              <Icon name="panel" size={16} />
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            data-active={showWorks || Boolean(menu)}
            aria-label="Plus d’actions"
            aria-expanded={Boolean(menu)}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              setMenu(menu ? null : { x: rect.right - 220, y: rect.bottom + 6 })
            }}
            title="Plus"
          >
            <Icon name="more" size={16} />
          </button>
          {!embedded && (
            <button
              type="button"
              className="icon-btn"
              onClick={() => toggleAgent(false)}
              title={`Fermer l’agent (${shortcut('J')})`}
              aria-label="Fermer l’agent"
            >
              <Icon name="close" size={18} />
            </button>
          )}
        </div>
      </header>

      {menu && (
        <TileMenu
          x={menu.x}
          y={menu.y}
          label="Agent"
          items={menuItems}
          onClose={() => setMenu(null)}
        />
      )}

      {showWorks && (
        <WorkList
          onOpen={async (work) => {
            if (await openWork(work)) setShowWorks(false)
          }}
        />
      )}

      <div className="chat" data-hidden={showWorks}>
        <ChatTranscript
          agent={agent}
          mode={mode}
          draft={prompt}
          approved={approved}
          engineLabel={engineLabel}
          engineLocal={engineLocal}
          onPick={(text) => {
            setPrompt(text)
            inputRef.current?.focus()
          }}
          onCopy={() => void copy()}
          onApprove={() => setApproved(true)}
          onSave={() => void saveAgentNote()}
          onReset={() => {
            setApproved(false)
            resetAgent()
          }}
        />
        <ChatComposer
          value={prompt}
          onChange={setPrompt}
          onSend={run}
          onAction={(text) => {
            setPrompt(text)
            inputRef.current?.focus()
          }}
          running={running}
          onCancel={() => cancelAgent()}
          mode={mode}
          onMode={setMode}
          tabs={tabs}
          selected={selected}
          onToggle={toggleSource}
          onJoinAll={(join) => setSelected(join ? tabs.map((tab) => tab.id) : [])}
          inputRef={inputRef}
        />
      </div>
    </div>
  )

  if (embedded) return <div className="work-stage">{canvas}</div>

  return (
    <aside
      className="agent-dock"
      data-float={floating ? 'true' : undefined}
      data-wide={expanded ? 'true' : undefined}
      style={{ width }}
    >
      {!embedded && (
        <div
          className="agent-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionner l’agent"
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={Math.min(MAX_WIDTH, Math.round(windowWidth / 2))}
          aria-valuenow={width}
          tabIndex={0}
          title="Glisser pour redimensionner · double-clic pour 420 px"
          onPointerDown={startResize}
          onDoubleClick={() => commit(DEFAULT_WIDTH)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') commit(width + 20)
            else if (event.key === 'ArrowRight') commit(width - 20)
            else if (event.key === 'Home') commit(DEFAULT_WIDTH)
          }}
        />
      )}
      {canvas}
    </aside>
  )
}
