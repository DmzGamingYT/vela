import { useEffect, useRef, useState } from 'react'
import { AGENT_EXAMPLES } from '@shared/agent'
import { providerReady } from '@shared/providers'
import { hostOf, isHomeUrl } from '@shared/url'
import { Markdown } from '../lib/markdown'
import { useBrowser } from '../store/browser'
import Favicon from './Favicon'
import { Icon } from './Icon'
import WorkList from './WorkList'

const CAPABILITIES = [
  {
    title: 'Comparer',
    detail: 'Deux ou trois pages, un tableau, une recommandation nette.',
    icon: 'split' as const
  },
  {
    title: 'Synthétiser',
    detail: 'Un rapport court qui remplace dix onglets ouverts.',
    icon: 'notes' as const
  },
  {
    title: 'Décider',
    detail: 'Les critères, les risques, la prochaine étape.',
    icon: 'sparkles' as const
  }
]

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
  const [selected, setSelected] = useState<string[]>(() => {
    const initial = useBrowser.getState().view
    if (!initial) return []
    return initial.tabs
      .filter((tab) => !isHomeUrl(tab.url) && tab.spaceId === initial.activeSpaceId)
      .slice(0, 6)
      .map((tab) => tab.id)
  })

  const reportRef = useRef<HTMLDivElement>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)

  // Dans l’atelier (mode Work), la demande a le focus dès l’arrivée.
  useEffect(() => {
    if (embedded) promptRef.current?.focus()
  }, [embedded])

  // Ouverture depuis une sélection de page : l’onglet d’origine est joint.
  useEffect(() => {
    if (!agentSourceTab) return
    setSelected((current) =>
      current.includes(agentSourceTab) ? current : [...current, agentSourceTab]
    )
    useBrowser.setState({ agentSourceTab: null })
    promptRef.current?.focus()
  }, [agentSourceTab])

  const running = agent.status === 'running'
  const sources = (view?.tabs ?? [])
    .filter((tab) => !isHomeUrl(tab.url))
    .sort((a, b) => Number(b.spaceId === view?.activeSpaceId) - Number(a.spaceId === view?.activeSpaceId))
  const configured = view ? providerReady(view.settings) : false
  const modeLabel = running || agent.status !== 'idle' ? agent.mode : configured ? 'api' : 'demo'

  useEffect(() => {
    if (!running) return
    const node = reportRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [agent.markdown, running])

  if (!view) return null

  const run = (): void => {
    setApproved(false)
    if (running) return
    if (!prompt.trim()) {
      toast('Dites à l’agent quoi chercher.', 'error')
      promptRef.current?.focus()
      return
    }
    void startAgent(prompt, selected)
  }

  const toggleSource = (id: string): void => {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  const copy = async (): Promise<void> => {
    if (!agent.markdown) return
    try {
      await navigator.clipboard.writeText(agent.markdown)
      toast('Rapport copié.')
    } catch {
      toast('Copie impossible.', 'error')
    }
  }

  const currentTab = view?.tabs.find((tab) => tab.id === view.activeTabId)
  const canAttachCurrent = Boolean(currentTab && !isHomeUrl(currentTab.url))

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
              <p>
                {embedded
                  ? 'Le mode où l’IA travaille : joignez des onglets, demandez, relisez.'
                  : 'Lit les onglets joints et rédige à côté de la page, sans la masquer.'}
              </p>
            </div>
          </div>
          <div className="agent-head-actions">
            <button
              type="button"
              className="work-toggle"
              data-active={showWorks}
              onClick={() => setShowWorks((value) => !value)}
              title="Travaux de l’atelier"
            >
              <Icon name="inbox" size={14} />
              Travaux
              {activeWorks > 0 && <span className="work-toggle-count">{activeWorks}</span>}
            </button>
            <span className="mode-chip" data-mode={modeLabel}>
              {modeLabel === 'api' ? 'Modèle connecté' : 'Démo locale'}
            </span>
            {!embedded && (
              <button
                type="button"
                className="icon-btn"
                onClick={() => toggleAgent(false)}
                title="Fermer l’agent (⌘J)"
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

        <div className="agent-body" data-hidden={showWorks}>
          <aside className="agent-left">
            {!configured && (
              <div className="agent-setup">
                <span className="agent-setup-icon">
                  <Icon name="key" size={15} />
                </span>
                <div className="agent-setup-copy">
                  <strong>Aucun modèle connecté</strong>
                  <p>
                    La démo locale écrit un rapport simulé à partir des titres. Pour un vrai rapport :
                    une clé, ou un modèle local comme Ollama.
                  </p>
                  <button type="button" className="action" onClick={() => setOverlay('settings')}>
                    <Icon name="settings" size={14} />
                    Ajouter une clé ou Ollama
                  </button>
                </div>
              </div>
            )}

            <label className="field-label" htmlFor="agent-prompt">
              Votre demande
            </label>
            <textarea
              id="agent-prompt"
              ref={promptRef}
              className="agent-prompt"
              rows={4}
              value={prompt}
              placeholder="Ex. Compare ces deux articles et dis-moi lequel garder."
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  run()
                }
              }}
            />

            <div className="example-chips">
              {AGENT_EXAMPLES.slice(0, 3).map((example) => (
                <button type="button" key={example} className="chip" onClick={() => setPrompt(example)}>
                  {example}
                </button>
              ))}
            </div>

            <div className="sources-head">
              <span>Onglets joints</span>
              <span className="sources-count">{selected.length}</span>
              {canAttachCurrent && currentTab && !selected.includes(currentTab.id) && (
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => setSelected((current) => [...current, currentTab.id])}
                >
                  Joindre l’onglet actuel
                </button>
              )}
              <button
                type="button"
                className="text-btn"
                onClick={() => setSelected(sources.length ? sources.map((tab) => tab.id) : [])}
              >
                Tout
              </button>
            </div>

            <div className="source-list">
              {sources.length === 0 && (
                <p className="sources-empty">Ouvrez une page dans cet espace pour la donner à lire à l’agent.</p>
              )}
              {sources.map((tab) => {
                const checked = selected.includes(tab.id)
                return (
                  <label key={tab.id} className="source-row" data-selected={checked}>
                    <input type="checkbox" checked={checked} onChange={() => toggleSource(tab.id)} />
                    <Favicon src={tab.favicon} label={tab.title || hostOf(tab.url)} size={14} />
                    <span className="source-copy">
                      <span className="source-title">{tab.title}</span>
                      <span className="source-host">{hostOf(tab.url)}</span>
                    </span>
                    <span className="source-check">
                      <Icon name="check" size={12} />
                    </span>
                  </label>
                )
              })}
            </div>

            <div className="agent-run">
              <button type="button" className="action primary wide" onClick={run} disabled={running}>
                <Icon name="sparkles" size={15} />
                {running ? 'L’agent travaille…' : 'Lancer l’agent'}
                {!running && <kbd>⌘↵</kbd>}
              </button>
              {running && (
                <button type="button" className="action wide" onClick={() => cancelAgent()}>
                  <Icon name="stop" size={13} />
                  Arrêter
                </button>
              )}
            </div>

            <p className="agent-note">
              {modeLabel === 'api'
                ? 'Le texte des onglets joints est envoyé au modèle configuré. Le contenu des pages est traité comme une donnée non fiable, jamais comme une instruction.'
                : 'Mode démo : rapport simulé localement à partir des titres. Aucune page n’est envoyée.'}
            </p>
          </aside>

          <section className="agent-right">
            {agent.status === 'idle' ? (
              <div className="agent-empty">
                <p className="eyebrow">
                  <span className="eyebrow-dot" />
                  Espace de travail
                </p>
                <h2>
                  Un rapport,
                  <br />
                  pas dix onglets.
                </h2>
                <p className="agent-empty-lede">
                  Joignez des pages, posez une question. L’agent lit, croise et rédige — vous gardez la décision.
                </p>
                <div className="capability-grid">
                  {CAPABILITIES.map((capability) => (
                    <div className="capability" key={capability.title}>
                      <span className="capability-icon">
                        <Icon name={capability.icon} size={16} />
                      </span>
                      <strong>{capability.title}</strong>
                      <span>{capability.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="agent-result">
                <div className="result-head">
                  <div>
                    <p className="eyebrow">
                      <span className="eyebrow-dot" />
                      {running ? (
                        <span className="thinking-dots" aria-label="Rédaction en cours">
                          Rédaction en cours<span>.</span>
                          <span>.</span>
                          <span>.</span>
                        </span>
                      ) : agent.status === 'done'
                          ? 'Rapport prêt'
                          : agent.status === 'cancelled'
                            ? 'Recherche arrêtée'
                            : 'Une erreur est survenue'}
                    </p>
                    <h2>{agent.title || 'Rapport Vela'}</h2>
                  </div>
                  <div className="result-actions">
                    <button type="button" className="icon-btn" onClick={() => void copy()} title="Copier le rapport" disabled={!agent.markdown}>
                      <Icon name="copy" size={15} />
                    </button>

                    <button type="button" className="icon-btn" onClick={() => resetAgent()} title="Nouvelle demande">
                      <Icon name="plus" size={15} />
                    </button>
                  </div>
                </div>

                <ol className="steps">
                  {agent.steps.map((step, index) => (
                    <li key={`${step.label}-${index}`} data-state={step.state}>
                      <span className="step-dot">
                        {step.state === 'done' ? <Icon name="check" size={10} /> : <span />}
                      </span>
                      {step.label}
                    </li>
                  ))}
                  {agent.steps.length === 0 && running && (
                    <li data-state="active">
                      <span className="step-dot">
                        <span />
                      </span>
                      Connexion à l’agent…
                    </li>
                  )}
                </ol>

                {agent.error && (
                  <div className="agent-error">
                    <Icon name="warning" size={15} />
                    <div>
                      <strong>L’agent s’est arrêté.</strong>
                      <p>{agent.error}</p>
                    </div>
                  </div>
                )}

                <div className="result-scroll" ref={reportRef}>
                  {agent.markdown ? (
                    <>
                      <Markdown
                        text={agent.markdown}
                        sourceLinks={agent.mode === 'api' ? agent.sources : []}
                      />
                      {running && <span className="caret" />}
                    </>
                  ) : (
                    !agent.error && (
                      <div className="result-skeleton">
                        <span />
                        <span />
                        <span />
                      </div>
                    )
                  )}
                </div>

                <div className="work-sources">
                  {sources.filter((t) => selected.includes(t.id)).slice(0, 4).map((t) => (
                    <span key={t.id} className="work-source"><strong>{hostOf(t.url)}</strong> {t.title.slice(0, 40)}</span>
                  ))}
                </div>
                <footer className="result-foot">
                  <span className="result-mode">
                    <Icon name="sparkles" size={13} />
                    {modeLabel === 'api' ? 'Modèle connecté' : 'Démo locale'}
                    {approved && ' · Relu ✓'}
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="action" onClick={() => setApproved(true)} disabled={!agent.markdown || agent.status !== 'done' || approved}>
                      <Icon name="check" size={14} /> {approved ? 'Relu' : 'Relire et approuver'}
                    </button>
                    <button type="button" className="action primary" onClick={() => void saveAgentNote()} disabled={!agent.markdown || !approved} title={approved ? 'Enregistrer' : 'Approuvez d’abord le rapport'}>
                      <Icon name="notes" size={14} /> Enregistrer en note
                    </button>
                  </div>
                </footer>
              </div>
            )}
          </section>
      </div>
    </div>
  )

  if (embedded) return <div className="work-stage">{canvas}</div>

  // Panneau ancré : la page reste vivante à gauche du panneau.
  return <aside className="agent-dock">{canvas}</aside>
}
