import { useEffect, useRef, useState } from 'react'
import { estimateAgentCost, formatUsd } from '@shared/agentCost'
import { isLoopbackEndpoint, providerById, providerReady, providerState } from '@shared/providers'
import type { AgentSource } from '@shared/types'
import { isHomeUrl } from '@shared/url'
import { shortcut } from '../../lib/format'
import { useBrowser } from '../../store/browser'
import { useTunnel } from '../../store/tunnel'
import ChatComposer, { type ComposerTab } from './ChatComposer'
import ChatTranscript from './ChatTranscript'
import { buildAgentSuggestions } from './suggestions'
import { Icon } from '../Icon'
import TileMenu, { type TileMenuItem } from '../tabs/TileMenu'
import WorkList from '../WorkList'

/** Largeur du panneau : 420 par défaut, 340 au plus étroit, 640 au plus large. */
const DEFAULT_WIDTH = 420
const MIN_WIDTH = 340
const MAX_WIDTH = 640
const WIDE_WIDTH = 560
const WIDTH_KEY = 'vela.agent.width'
const NOTICE_KEY = 'vela.agent.notice'
const RECENT_KEY = 'vela.agent.recent'

/** Trois dernières demandes, gardées sur l'appareil comme le brouillon. */
function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.trim() !== '').slice(0, 3)
      : []
  } catch {
    return []
  }
}

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
  const setWorkMode = useBrowser((state) => state.setWorkMode)
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
  // La page active est jointe par défaut : `null` suit l'onglet courant tant
  // que l'utilisateur n'a pas choisi ses propres pièces jointes.
  const activeTabId = view?.activeTabId
  const activePageId =
    view?.tabs.find((tab) => tab.id === activeTabId && !isHomeUrl(tab.url))?.id ?? null
  const [selected, setSelected] = useState<string[] | null>(null)
  const effectiveSelected = selected ?? (activePageId ? [activePageId] : [])
  const [extraSources, setExtraSources] = useState<AgentSource[]>([])
  const [noticeVisible, setNoticeVisible] = useState(() => {
    try {
      return localStorage.getItem(NOTICE_KEY) !== 'hidden'
    } catch {
      return true
    }
  })
  const [recent, setRecent] = useState<string[]>(readRecent)

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
      setSelected((current) => {
        const base = current ?? (activePageId ? [activePageId] : [])
        return base.includes(agentSourceTab) ? base : [...base, agentSourceTab]
      })
      useBrowser.setState({ agentSourceTab: null })
      inputRef.current?.focus()
    })
  }, [agentSourceTab, activePageId])

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

  const attached = tabs.filter((tab) => effectiveSelected.includes(tab.id))
  const suggestionSources: ComposerTab[] = [
    ...attached,
    ...extraSources.map((source, index) => ({
      id: `extra-${index}`,
      title: source.title,
      url: source.url
    }))
  ]
  const suggestions = buildAgentSuggestions(suggestionSources, mode)
  const sourceCount = attached.length + extraSources.length
  const modelDefinition = providerById(view.settings.agent.provider)
  const modelState = providerState(view.settings)
  const modelReady = providerReady(view.settings)
  // Agir n’existe que lorsque l’agent appelle réellement un modèle : la démo
  // locale ne sait pas cliquer et le processus principal refuse ce mode.
  const canAct = modelReady && view.settings.agent.mode === 'api'
  // La démo n'appelle aucun serveur : elle se lit comme un moteur local.
  const modelLocal = !modelReady || isLoopbackEndpoint(modelState.baseUrl)
  const modelName = modelReady
    ? modelState.model.trim() || modelDefinition.model
    : 'Démo locale'
  const modelDetail = modelReady
    ? modelLocal
      ? 'local'
      : modelDefinition.label
    : 'rapport simulé'
  const cost = estimateAgentCost(view.settings, prompt, sourceCount, mode)
  // Un titre ou une adresse de fiche produit suffit à proposer la relance
  // « Comparer les prix » ; une page d’article ne la reçoit pas.
  const priceText = [...attached, ...extraSources]
    .map((source) => `${source.title} ${source.url ?? ''}`)
    .join(' ')
  const showPrice =
    /(prix|price|tarif|€|\$|acheter|buy|boutique|shop|product|produit|promo|abonnement)/i.test(
      priceText
    )
  const costLabel = cost.free
    ? 'Gratuit'
    : cost.usd === null
      ? '≈ ?'
      : `≈ ${formatUsd(cost.usd)}`
  const costTitle = cost.detail

  const floating = windowWidth < 900
  const expanded = width > DEFAULT_WIDTH

  const rememberPrompt = (text: string): void => {
    const clean = text.trim()
    if (!clean) return
    setRecent((current) => {
      const next = [clean, ...current.filter((item) => item !== clean)].slice(0, 3)
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next))
      } catch {
        /* stockage indisponible : la liste vaut pour la session */
      }
      return next
    })
  }

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
    if (mode === 'act' && !canAct) {
      toast('Agir sur une page demande un modèle connecté.', 'error')
      return
    }
    if (mode === 'answer' && sourceCount === 0) {
      toast('Joignez une page, une note ou un fichier à lire.', 'error')
      return
    }
    rememberPrompt(prompt)
    void startAgent(prompt, effectiveSelected, mode, extraSources)
    setPrompt('')
  }

  const toggleSource = (id: string): void => {
    setSelected((current) => {
      const base = current ?? effectiveSelected
      return base.includes(id) ? base.filter((item) => item !== id) : [...base, id]
    })
  }

  const attachSource = (source: AgentSource): void => {
    setExtraSources((current) => [...current, source])
    queueMicrotask(() => inputRef.current?.focus())
  }

  const attachCurrent = (): void => {
    if (!activePageId) return
    setSelected((current) => {
      const base = current ?? effectiveSelected
      return base.includes(activePageId) ? base : [...base, activePageId]
    })
  }

  const attachSelection = async (): Promise<void> => {
    if (!activeTabId) {
      toast('Ouvrez une page pour joindre une sélection.', 'error')
      return
    }
    try {
      const text = await window.vela.tabs.selection(activeTabId)
      if (!text) {
        toast('Sélectionnez un passage dans la page, puis réessayez.', 'error')
        return
      }
      const tab = view.tabs.find((item) => item.id === activeTabId)
      attachSource({
        kind: 'selection',
        title: `Sélection — ${tab?.title || 'page active'}`,
        url: tab?.url ?? '',
        excerpt: text
      })
    } catch {
      toast('La sélection n’a pas pu être lue.', 'error')
    }
  }

  const dismissNotice = (): void => {
    setNoticeVisible(false)
    try {
      localStorage.setItem(NOTICE_KEY, 'hidden')
    } catch {
      /* stockage indisponible : le masquage vaut pour la session */
    }
  }

  // Une question de recherche peut continuer dans l'Atelier, avec le texte
  // déjà saisi : c'est le seul lien entre l'agent et le tunnel, pas un onglet
  // « Atelier » ambigu dans l'en-tête.
  const openAtelier = (): void => {
    const question = prompt.trim()
    if (question) useTunnel.getState().setQuery(question)
    setWorkMode('work')
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
    ...(embedded
      ? []
      : [
          {
            id: 'width',
            label: expanded ? 'Réduire le panneau' : 'Agrandir le panneau',
            icon: 'panel' as const,
            onSelect: () => commit(expanded ? DEFAULT_WIDTH : WIDE_WIDTH)
          }
        ]),
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
          {/* h2 : le panneau cohabite avec l'accueil, qui garde le seul h1. */}
          <h2>{embedded ? 'Atelier' : 'Agent'}</h2>
        </div>
        <div className="agent-head-actions">
          <button
            type="button"
            className="icon-btn"
            data-active={showWorks}
            aria-label="Historique des conversations"
            aria-expanded={showWorks}
            onClick={() => {
              setMenu(null)
              setShowWorks((open) => !open)
            }}
            title="Historique des conversations"
          >
            <Icon name="history" size={16} />
          </button>
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
          draft={prompt}
          approved={approved}
          engineLabel={engineLabel}
          engineLocal={engineLocal}
          suggestions={suggestions}
          recent={recent}
          showPrice={showPrice}
          onOpenAtelier={embedded ? undefined : openAtelier}
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
          modelLabel={modelName}
          modelDetail={modelDetail}
          modelLocal={modelLocal}
          onModel={() => setOverlay('settings')}
          costLabel={costLabel}
          costTitle={costTitle}
          running={running}
          onCancel={() => cancelAgent()}
          mode={mode}
          onMode={setMode}
          canAct={canAct}
          tabs={tabs}
          selected={effectiveSelected}
          onToggle={toggleSource}
          onJoinAll={(join) => setSelected(join ? tabs.map((tab) => tab.id) : [])}
          currentPageId={activePageId}
          extraSources={extraSources}
          onRemoveExtra={(index) =>
            setExtraSources((current) => current.filter((_, item) => item !== index))
          }
          onAttachSource={attachSource}
          onAttachCurrent={attachCurrent}
          onAttachSelection={() => void attachSelection()}
          notes={view.notes}
          spaceId={spaceId}
          onError={(message) => toast(message, 'error')}
          noticeVisible={noticeVisible}
          onDismissNotice={dismissNotice}
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
