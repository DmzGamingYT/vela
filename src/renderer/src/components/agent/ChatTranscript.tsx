import { useCallback, useEffect, useRef, useState } from 'react'
import { AGENT_BUDGET, type AgentToolName } from '@shared/agentLoop'
import { hostOf } from '@shared/url'
import { Markdown } from '../../lib/markdown'
import type { AgentUi } from '../../store/types'
import { Icon, type IconName } from '../Icon'
import AgentCost from './AgentCost'
import type { AgentSuggestion } from './suggestions'

/** Chaque outil garde le même pictogramme d’un tour à l’autre. */
const TOOL_ICON: Record<AgentToolName, IconName> = {
  open: 'external',
  read: 'globe',
  click: 'arrow-right',
  type: 'edit',
  scroll: 'chevron-down',
  extract: 'list',
  done: 'check'
}

/** Durée entre deux actions, lisible d’un coup d’œil. */
function durationLabel(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`
  const seconds = ms / 1000
  return seconds < 10 ? `${seconds.toFixed(1).replace('.', ',')} s` : `${Math.round(seconds)} s`
}

/**
 * Le fil : une demande, puis ce que l’agent a fait et répondu.
 *
 * L’agentique n’est pas un panneau à part : les étapes et les actions
 * s’insèrent dans la conversation, à leur place chronologique. Un échec reste
 * visible au lieu d’être résumé dans un rapport.
 */
export default function ChatTranscript({
  agent,
  draft = '',
  approved,
  engineLabel,
  engineLocal,
  suggestions,
  recent = [],
  showPrice = false,
  onOpenAtelier,
  onPick,
  onCopy,
  onApprove,
  onSave,
  onReset
}: {
  agent: AgentUi
  /** Texte en cours de saisie : il retire les suggestions de relance. */
  draft?: string
  approved: boolean
  engineLabel: string
  engineLocal: boolean
  suggestions: AgentSuggestion[]
  /** Trois dernières demandes de cet appareil, les plus récentes d'abord. */
  recent?: string[]
  /** La page jointe ressemble à une fiche produit : « Comparer les prix » a du sens. */
  showPrice?: boolean
  onOpenAtelier?: () => void
  onPick: (prompt: string) => void
  onCopy: () => void
  onApprove: () => void
  onSave: () => void
  onReset: () => void
}) {
  const endRef = useRef<HTMLDivElement>(null)
  const running = agent.status === 'running'
  const empty = agent.status === 'idle' && !agent.markdown && agent.turns.length === 0
  const failed = agent.journal.filter((entry) => !entry.ok).length
  const suggestionKey = suggestions.map((suggestion) => suggestion.id).join('|')
  // La clé garde la présélection sans effet de remise à zéro : quand la
  // sélection change, la première ligne redevient active au rendu suivant.
  const [pick, setPick] = useState<{ key: string; index: number }>({
    key: suggestionKey,
    index: 0
  })
  const active = pick.key === suggestionKey ? pick.index : 0
  const setActive = useCallback(
    (next: number | ((current: number) => number)): void => {
      setPick((current) => {
        const base = current.key === suggestionKey ? current.index : 0
        const index = typeof next === 'function' ? next(base) : next
        return { key: suggestionKey, index }
      })
    },
    [suggestionKey]
  )

  // Le fil suit la réponse jusqu’au bout : sans cela, la ligne des actions
  // restait sous le pli, coupée par le composeur.
  useEffect(() => {
    if (agent.status === 'idle') return
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [agent.markdown, agent.journal.length, agent.status])

  // La première suggestion est présélectionnée : ↵ la pose dans le champ,
  // même quand le focus est encore dans la saisie vide. Les flèches changent
  // de ligne, sans jamais voler une frappe destinée au champ.
  useEffect(() => {
    if (!empty || suggestions.length === 0) return
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      const typing = Boolean(
        target &&
          (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)
      )
      const buttonLike = Boolean(target?.closest('button, a, select'))
      if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if ((typing && draft.trim()) || buttonLike) return
        const suggestion = suggestions[active]
        if (!suggestion) return
        event.preventDefault()
        onPick(suggestion.prompt)
        return
      }
      if (typing || buttonLike) return
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActive((current) => (current + 1) % suggestions.length)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActive((current) => (current - 1 + suggestions.length) % suggestions.length)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [empty, suggestions, active, draft, onPick, setActive])

  if (empty) {
    return (
      <div className="chat-thread" data-empty="true" aria-label="Conversation">
        <div className="chat-empty">
          {/* L'état vide dit aussi où l'on est : sans cela, le panneau ouvert
              ressemblait à un écran qui charge indéfiniment. */}
          <p className="chat-status">
            <span className="chat-status-dot" aria-hidden="true" />
            Prêt · {engineLabel}
            {engineLocal ? ' · sur cet appareil' : ''}
          </p>
          <h2>Que fait-on ?</h2>
          <p className="chat-lede">
            Posez une question sur la page ouverte ou sur vos onglets. L’agent lit ; il n’agit sur
            une page qu’avec votre accord.
          </p>
          {suggestions.length > 0 && (
            <div className="chat-picks">
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion.id}
                  type="button"
                  data-active={index === active}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => onPick(suggestion.prompt)}
                >
                  <Icon name={suggestion.icon} size={13} />
                  <span>{suggestion.label}</span>
                  {index === active && (
                    <span className="pick-key" aria-hidden="true">
                      ↵
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          {recent.length > 0 && (
            <div className="chat-recent">
              <p className="chat-recent-title">Dernières demandes</p>
              {recent.map((text) => (
                <button
                  key={text}
                  type="button"
                  className="chat-recent-row"
                  title={text}
                  onClick={() => onPick(text)}
                >
                  <Icon name="clock" size={12} />
                  <span>{text}</span>
                </button>
              ))}
            </div>
          )}
          {onOpenAtelier && (
            <button type="button" className="chat-atelier" onClick={onOpenAtelier}>
              <Icon name="compass" size={12} />
              Ouvrir l’Atelier
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="chat-thread" aria-label="Conversation">
      {agent.turns.map((turn) => (
        <div className="chat-archive" key={turn.id}>
          <div className="msg msg-user">
            <div className="bubble">
              <p>{turn.prompt}</p>
              {turn.sources.length > 0 && (
                <div className="bubble-src">
                  {turn.sources.slice(0, 4).map((source, index) => (
                    <span key={`${source.url}-${index}`}>{hostOf(source.url) || source.title}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="msg msg-agent">
            <div className="msg-text">
              <Markdown
                text={turn.markdown}
                sourceLinks={turn.mode === 'api' ? turn.sources : []}
              />
            </div>
          </div>
        </div>
      ))}

      <div className="msg msg-user">
        <div className="bubble">
          <p>{agent.prompt}</p>
          {agent.sources.length > 0 && (
            <div className="bubble-src">
              {agent.sources.slice(0, 4).map((source, index) => (
                <span key={`${source.url}-${index}`}>{hostOf(source.url) || source.title}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="msg msg-agent">
        <span className="msg-avatar" aria-hidden="true">
          <Icon name="sparkles" size={13} />
        </span>
        <div className="msg-body">
        {agent.steps.length > 0 && (
          <ol className="msg-steps" aria-label="Étapes">
            {agent.steps.map((step, index) => (
              <li key={`${step.label}-${index}`} data-state={step.state}>
                <span className="step-dot">
                  {step.state === 'done' ? <Icon name="check" size={9} /> : <span />}
                </span>
                {step.label}
              </li>
            ))}
          </ol>
        )}

        {agent.journal.length > 0 && (
          <ol className="msg-actions" aria-label="Actions de l’agent">
            {agent.journal.map((entry, index) => {
              const previous = agent.journal[index - 1]
              return (
                <li key={entry.id} data-ok={entry.ok}>
                  <span className="action-icon">
                    <Icon name={TOOL_ICON[entry.tool]} size={11} />
                  </span>
                  <span className="tool-chip">{entry.tool}</span>
                  <span className="action-copy">
                    <strong>{entry.label}</strong>
                    <span>{entry.detail}</span>
                  </span>
                  <span className="action-time">
                    {previous ? durationLabel(entry.at - previous.at) : null}
                  </span>
                  <span className="action-state">
                    <Icon name={entry.ok ? 'check' : 'warning'} size={11} />
                    <span className="sr-only">{entry.ok ? 'Fait' : 'Échec'}</span>
                  </span>
                </li>
              )
            })}
          </ol>
        )}

        {failed > 0 && (
          <p className="act-failed">
            {failed === 1 ? 'Une action a échoué.' : `${failed} actions ont échoué.`}
          </p>
        )}

        {running && agent.requestMode === 'act' && (
          <div className="act-banner" role="status">
            <Icon name="shield" size={13} />
            <span>
              <b>L’agent agit.</b> Chaque action demande votre accord.
            </span>
            <span className="act-budget">
              <b>
                {agent.journal.length} / {AGENT_BUDGET.steps}
              </b>
              actions · {Math.round(AGENT_BUDGET.ms / 60_000)} min au plus
            </span>
          </div>
        )}

        {agent.error && (
          <div className="msg-error">
            <Icon name="warning" size={14} />
            <div>
              <strong>L’agent s’est arrêté.</strong>
              <p>{agent.error}</p>
            </div>
          </div>
        )}

        {agent.markdown ? (
          <div className="msg-text">
            <Markdown
              text={agent.markdown}
              sourceLinks={agent.mode === 'api' ? agent.sources : []}
            />
            {running && <span className="caret" />}
          </div>
        ) : (
          running && !agent.error && <p className="msg-thinking">L’agent travaille…</p>
        )}

        {agent.status === 'done' && agent.markdown && (
          <AgentCost
            sources={agent.sources.length}
            journal={agent.journal}
            engine={engineLabel}
            local={engineLocal}
            reviewed={approved}
          />
        )}

        {agent.status === 'done' && agent.markdown && !draft.trim() && (
          <div className="chat-followups" aria-label="Questions de suivi">
            <span>Continuer</span>
            <button type="button" onClick={onSave}>
              <Icon name="notes" size={12} />
              Garder dans Notes
            </button>
            {showPrice && (
              <button
                type="button"
                onClick={() =>
                  onPick(
                    'Compare les prix et les conditions des offres citées : prix total, abonnement, limites et ce qui change.'
                  )
                }
              >
                Comparer les prix
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                onPick('Approfondis le point le plus fragile de ta réponse, en citant les sources.')
              }
            >
              Approfondir
            </button>
            <button
              type="button"
              onClick={() =>
                onPick('Donne le contre-argument principal à ta réponse, avec les sources jointes.')
              }
            >
              Contre-argument
            </button>
            <button
              type="button"
              onClick={() =>
                onPick('Transforme ta réponse en plan d’action de trois étapes concrètes.')
              }
            >
              Plan d’action
            </button>
          </div>
        )}

        {agent.markdown.length > 0 && (
          <div className="msg-tools">
            <button type="button" className="msg-tool" onClick={onCopy} title="Copier la réponse">
              <Icon name="copy" size={13} />
              Copier
            </button>
            {agent.status === 'done' && !approved && (
              <button type="button" className="msg-tool" onClick={onApprove}>
                <Icon name="check" size={13} />
                Relire
              </button>
            )}
            {approved && (
              <button type="button" className="msg-tool" onClick={onSave}>
                <Icon name="notes" size={13} />
                Enregistrer dans Notes
              </button>
            )}
            <button type="button" className="msg-tool" onClick={onReset}>
              <Icon name="plus" size={13} />
              {agent.turns.length > 0 ? 'Nouvelle conversation' : 'Nouveau'}
            </button>
          </div>
        )}
        </div>
      </div>
      <div ref={endRef} />
    </div>
  )
}
