import { useEffect, useRef } from 'react'
import { AGENT_EXAMPLES } from '@shared/agent'
import { AGENT_BUDGET, type AgentToolName } from '@shared/agentLoop'
import { hostOf } from '@shared/url'
import { Markdown } from '../../lib/markdown'
import type { AgentUi } from '../../store/types'
import { Icon, type IconName } from '../Icon'
import AgentCost from './AgentCost'

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
  mode,
  approved,
  engineLabel,
  engineLocal,
  onPick,
  onCopy,
  onApprove,
  onSave,
  onReset
}: {
  agent: AgentUi
  /** Mode choisi dans le composeur : l’état vide en dépend. */
  mode: 'answer' | 'act'
  approved: boolean
  engineLabel: string
  engineLocal: boolean
  onPick: (prompt: string) => void
  onCopy: () => void
  onApprove: () => void
  onSave: () => void
  onReset: () => void
}) {
  const endRef = useRef<HTMLDivElement>(null)
  const running = agent.status === 'running'
  const empty = agent.status === 'idle' && !agent.markdown
  const failed = agent.journal.filter((entry) => !entry.ok).length

  // Le fil suit la réponse jusqu’au bout : sans cela, la ligne des actions
  // restait sous le pli, coupée par le composeur.
  useEffect(() => {
    if (agent.status === 'idle') return
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [agent.markdown, agent.journal.length, agent.status])

  if (empty) {
    return (
      <div className="chat-thread" data-empty="true" aria-label="Conversation">
        <div className="chat-empty">
          <p className="eyebrow">
            <span className="eyebrow-dot" />
            Atelier
          </p>
          <h2>Que fait-on ?</h2>
          <p className="chat-lede">
            {mode === 'act'
              ? 'L’agent ouvre son propre onglet de travail et demande votre accord à chaque action.'
              : 'Une demande, des pages jointes : l’agent lit et répond.'}
            {engineLocal ? ' Rien ne quitte cet appareil.' : ''}
          </p>
          <div className="chat-picks">
            {AGENT_EXAMPLES.slice(0, 3).map((example) => (
              <button key={example} type="button" onClick={() => onPick(example)}>
                <Icon name="sparkles" size={12} />
                {example}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-thread" aria-label="Conversation">
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
          <p className="act-budget">
            <b>
              {agent.journal.length} / {AGENT_BUDGET.steps}
            </b>
            actions
            <span>{Math.round(AGENT_BUDGET.ms / 60_000)} min au plus</span>
          </p>
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
          running &&
          !agent.error && <p className="msg-thinking">L’agent travaille…</p>
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
                Enregistrer
              </button>
            )}
            <button type="button" className="msg-tool" onClick={onReset}>
              <Icon name="plus" size={13} />
              Nouveau
            </button>
          </div>
        )}
      </div>
      <div ref={endRef} />
    </div>
  )
}
