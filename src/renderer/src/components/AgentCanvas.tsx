import { useEffect, useRef, useState } from 'react'
import { isLoopbackEndpoint, providerReady, providerState } from '@shared/providers'
import { isHomeUrl } from '@shared/url'
import { shortcut } from '../lib/format'
import { useBrowser } from '../store/browser'
import AgentEngine from './agent/AgentEngine'
import ChatComposer, { type ComposerTab } from './agent/ChatComposer'
import ChatTranscript from './agent/ChatTranscript'
import { Icon } from './Icon'
import WorkList from './WorkList'

/**
 * L’atelier est un chat : on demande, l’agent répond et agit, les actions
 * apparaissent dans le fil.
 *
 * Ce qui a disparu : les deux colonnes, le bloc de capacité, le plan avant
 * départ et le gros bouton « Lancer ». Le moteur tient sur la ligne sous le
 * titre, la capacité agentique est une pastille du composeur, et le plan
 * s’insère dans la conversation au moment où il s’exécute.
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
  const works = useBrowser((state) => state.view?.works ?? [])
  const activeWorks = works.filter((work) => !work.archived).length
  const toast = useBrowser((state) => state.toast)
  const [showWorks, setShowWorks] = useState(false)

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

  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Dans l’atelier (mode Work), la demande a le focus dès l’arrivée.
  useEffect(() => {
    if (embedded) inputRef.current?.focus()
  }, [embedded])

  // Ouverture depuis une sélection de page : l’onglet d’origine est joint.
  useEffect(() => {
    if (!agentSourceTab) return
    // Hors du corps de l'effet (le compilateur React refuse un setState
    // synchrone) : la microtâche s'exécute avant la peinture.
    queueMicrotask(() => {
      setSelected((current) =>
        current.includes(agentSourceTab) ? current : [...current, agentSourceTab]
      )
      useBrowser.setState({ agentSourceTab: null })
      inputRef.current?.focus()
    })
  }, [agentSourceTab])

  if (!view) return null

  const running = agent.status === 'running'
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

  const run = (): void => {
    setApproved(false)
    if (running) return
    if (!prompt.trim()) {
      toast(mode === 'act' ? 'Dites à l’agent quoi faire.' : 'Dites à l’agent quoi chercher.', 'error')
      inputRef.current?.focus()
      return
    }
    if (mode === 'answer' && selected.length === 0) {
      toast('Joignez au moins une page à lire.', 'error')
      return
    }
    void startAgent(prompt, selected, mode)
    // Un chat vide son champ à l’envoi : la demande vit maintenant dans le fil.
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

  const canvas = (
    <div
      className="agent"
      data-embedded={embedded}
      data-docked={docked}
      role={embedded ? 'region' : docked ? 'complementary' : 'dialog'}
      aria-label={embedded ? 'Atelier Vela' : 'Agent Vela'}
    >
      <header className="agent-head">
        <div className="agent-identity">
          <span className="agent-mark">
            <Icon name="sparkles" size={18} />
          </span>
          <div>
            <h1>{embedded ? 'Atelier' : 'Agent Vela'}</h1>
            <AgentEngine
              settings={view.settings}
              onConfigure={() => setOverlay('settings')}
            />
          </div>
        </div>
        <div className="agent-head-actions">
          <button
            type="button"
            className="work-toggle"
            data-active={showWorks}
            onClick={() => setShowWorks((value) => !value)}
            title="Conversations enregistrées"
          >
            <Icon name="inbox" size={14} />
            <span className="work-toggle-label">Rapports</span>
            {activeWorks > 0 && <span className="work-toggle-count">{activeWorks}</span>}
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

  // Panneau ancré : la page reste vivante à gauche du panneau.
  return <aside className="agent-dock">{canvas}</aside>
}
