import { useState, type RefObject } from 'react'
import { hostOf } from '@shared/url'
import Favicon from '../Favicon'
import { Icon } from '../Icon'
import { AGENT_QUICK_ACTIONS } from './quickActions'

export interface ComposerTab {
  id: string
  title: string
  url: string
  favicon?: string
}

/**
 * Le composeur : une zone de saisie, deux pastilles (pages, agir), un envoi.
 *
 * « Agir » n’est pas un mode d’écran : c’est une capacité de la demande. Une
 * pastille allumée suffit à dire que l’agent pourra ouvrir une page et cliquer,
 * avec un accord à chaque action.
 */
export default function ChatComposer({
  value,
  onChange,
  onSend,
  running,
  onCancel,
  mode,
  onMode,
  tabs,
  selected,
  onToggle,
  onJoinAll,
  onAction,
  inputRef
}: {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  running: boolean
  onCancel: () => void
  mode: 'answer' | 'act'
  onMode: (mode: 'answer' | 'act') => void
  tabs: ComposerTab[]
  selected: string[]
  onToggle: (id: string) => void
  onJoinAll: (join: boolean) => void
  /** Pose une demande prête dans le champ, sans l'envoyer. */
  onAction: (prompt: string) => void
  inputRef: RefObject<HTMLTextAreaElement | null>
}) {
  const [pagesOpen, setPagesOpen] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const attached = tabs.filter((tab) => selected.includes(tab.id))
  const canSend = value.trim().length > 0 && (mode === 'act' || selected.length > 0)
  const send = (): void => {
    if (running || !canSend) return
    setPagesOpen(false)
    setActionsOpen(false)
    onSend()
  }
  const hint = running
    ? 'L’agent travaille…'
    : mode === 'act'
      ? 'Chaque action demandera votre accord'
      : selected.length === 0
        ? 'Joignez une page à lire'
        : `${selected.length} page${selected.length > 1 ? 's' : ''} à lire`

  return (
    <div className="chat-composer">
      {actionsOpen && (
        <div className="actions-pop" role="dialog" aria-label="Actions rapides">
          <p className="actions-pop-head">
            <Icon name="sparkles" size={12} /> Actions rapides
          </p>
          {AGENT_QUICK_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              className="actions-pop-row"
              title={action.hint}
              onClick={() => {
                setActionsOpen(false)
                setPagesOpen(false)
                onAction(action.prompt)
              }}
            >
              <Icon name={action.icon} size={13} />
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}

      {pagesOpen && (
        <div className="pages-pop" role="dialog" aria-label="Joindre des pages">
          <div className="pages-head">
            <span>
              {tabs.length} page{tabs.length > 1 ? 's' : ''} dans cet espace
            </span>
            {tabs.length > 0 && (
              <button type="button" onClick={() => onJoinAll(selected.length !== tabs.length)}>
                {selected.length === tabs.length ? 'Tout détacher' : 'Tout joindre'}
              </button>
            )}
          </div>
          <div className="pages-list">
            {tabs.length === 0 && <p>Aucune page ouverte dans cet espace.</p>}
            {tabs.map((tab) => (
              <label key={tab.id} className="pages-row" data-selected={selected.includes(tab.id)}>
                <input
                  type="checkbox"
                  checked={selected.includes(tab.id)}
                  onChange={() => onToggle(tab.id)}
                />
                <Favicon src={tab.favicon} label={tab.title || hostOf(tab.url)} size={13} />
                <span>{tab.title || hostOf(tab.url)}</span>
                <span className="pages-host">{hostOf(tab.url)}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="composer-box">
        {attached.length > 0 && (
          <div className="composer-attached">
            {attached.slice(0, 4).map((tab) => (
              <button
                key={tab.id}
                type="button"
                className="attached-chip"
                onClick={() => onToggle(tab.id)}
                title="Détacher cette page"
              >
                <Favicon src={tab.favicon} label={tab.title || hostOf(tab.url)} size={12} />
                <span>{hostOf(tab.url) || tab.title}</span>
                <Icon name="close" size={10} />
              </button>
            ))}
            {attached.length > 4 && <span className="attached-chip">+{attached.length - 4}</span>}
          </div>
        )}

        <textarea
          ref={inputRef}
          className="chat-input"
          rows={1}
          value={value}
          aria-label="Votre demande"
          placeholder={
            mode === 'act'
              ? 'Dites à l’agent quoi faire sur la page…'
              : 'Demander, résumer, comparer…'
          }
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              send()
            }
          }}
        />

        <div className="composer-row">
          <button
            type="button"
            className="composer-chip"
            data-active={actionsOpen}
            aria-expanded={actionsOpen}
            onClick={() => {
              setPagesOpen(false)
              setActionsOpen((open) => !open)
            }}
            title="Résumer, traduire, expliquer…"
          >
            <Icon name="sparkles" size={13} />
            <span>Actions</span>
          </button>
          <button
            type="button"
            className="composer-chip"
            data-active={selected.length > 0 || pagesOpen}
            onClick={() => setPagesOpen((open) => !open)}
            title="Joindre des pages de cet espace"
          >
            <Icon name="pin" size={13} />
            <span>{selected.length > 0 ? `Pages · ${selected.length}` : 'Pages'}</span>
          </button>
          <button
            type="button"
            className="composer-chip"
            data-active={mode === 'act'}
            onClick={() => onMode(mode === 'act' ? 'answer' : 'act')}
            title="Laisser l’agent agir sur une page"
          >
            <Icon name="globe" size={13} />
            <span>Agir</span>
          </button>
          <span className="composer-hint">{hint}</span>
          {running ? (
            <button
              type="button"
              className="composer-send"
              data-stop="true"
              onClick={onCancel}
              title="Arrêter l’agent"
            >
              <Icon name="stop" size={13} />
            </button>
          ) : (
            <button
              type="button"
              className="composer-send"
              onClick={send}
              disabled={!canSend}
              title={canSend ? 'Envoyer' : 'Écrivez une demande'}
            >
              <Icon name="arrow-right" size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
