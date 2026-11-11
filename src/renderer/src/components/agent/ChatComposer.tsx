import { useEffect, useRef, useState, type RefObject } from 'react'
import type { AgentSource, NoteMeta } from '@shared/types'
import { hostOf } from '@shared/url'
import Favicon from '../Favicon'
import { Icon } from '../Icon'
import ComposerDictation from './ComposerDictation'
import { buildQuickActions } from './suggestions'

export interface ComposerTab {
  id: string
  title: string
  url: string
  favicon?: string
}

const FILE_ACCEPT = '.txt,.md,.markdown,.csv,.json,.html,.htm,.xml,.log'
const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_FILE_TEXT = 12_000

/**
 * Le composeur : une saisie, une bascule Lire/Agir, un bouton « + » pour
 * joindre, le menu « / » pour les actions, le modèle actif, un coût estimé,
 * la dictée et un envoi.
 *
 * « Agir » est une permission à part : l’agent ne peut cliquer et remplir des
 * champs qu’après l’avoir choisie, et chaque action garde sa confirmation
 * native. Le bandeau du fil rappelle que l’agent agit.
 */
export default function ChatComposer({
  value,
  onChange,
  onSend,
  running,
  onCancel,
  mode,
  onMode,
  canAct,
  tabs,
  selected,
  onToggle,
  onJoinAll,
  currentPageId,
  extraSources,
  onRemoveExtra,
  onAttachSource,
  onAttachCurrent,
  onAttachSelection,
  notes,
  spaceId,
  onError,
  noticeVisible,
  onDismissNotice,
  onAction,
  modelLabel,
  modelDetail,
  modelLocal,
  onModel,
  costLabel,
  costTitle,
  inputRef
}: {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  running: boolean
  onCancel: () => void
  mode: 'answer' | 'act'
  onMode: (mode: 'answer' | 'act') => void
  /** Agir demande un modèle connecté ; sinon la bascule reste lisible mais fermée. */
  canAct: boolean
  tabs: ComposerTab[]
  selected: string[]
  onToggle: (id: string) => void
  onJoinAll: (join: boolean) => void
  currentPageId: string | null
  extraSources: AgentSource[]
  onRemoveExtra: (index: number) => void
  onAttachSource: (source: AgentSource) => void
  onAttachCurrent: () => void
  onAttachSelection: () => void
  notes: NoteMeta[]
  spaceId: string
  onError: (message: string) => void
  noticeVisible: boolean
  onDismissNotice: () => void
  /** Pose une demande prête dans le champ, sans l'envoyer. */
  onAction: (prompt: string) => void
  /** Ouvre les réglages du modèle depuis la pastille du composeur. */
  onModel: () => void
  modelLabel: string
  modelDetail: string
  modelLocal: boolean
  costLabel: string
  costTitle: string
  inputRef: RefObject<HTMLTextAreaElement | null>
}) {
  const [pagesOpen, setPagesOpen] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const [notePicker, setNotePicker] = useState(false)
  const [slashOpen, setSlashOpen] = useState(false)
  const [slashIndex, setSlashIndex] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const attached = tabs.filter((tab) => selected.includes(tab.id))
  const extraTabs: ComposerTab[] = extraSources.map((source, index) => ({
    id: `extra-${index}`,
    title: source.title,
    url: source.url
  }))
  const joined = [...attached, ...extraTabs]
  const quickActions = buildQuickActions(joined)
  const quickDisabled = mode === 'answer' && joined.length === 0
  const canSend = value.trim().length > 0 && (mode === 'act' || joined.length > 0)
  const currentTab = currentPageId ? tabs.find((tab) => tab.id === currentPageId) : undefined
  const currentAttached = Boolean(currentPageId && selected.includes(currentPageId))
  const spaceNotes = notes.filter((note) => !spaceId || note.spaceId === spaceId).slice(0, 20)
  const modelTitle = modelDetail ? `${modelLabel} · ${modelDetail}` : modelLabel

  useEffect(() => {
    const onPointer = (event: PointerEvent): void => {
      if (rootRef.current?.contains(event.target as Node)) return
      setPagesOpen(false)
      setAttachOpen(false)
      setNotePicker(false)
      setSlashOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [])

  const closeMenus = (): void => {
    setPagesOpen(false)
    setAttachOpen(false)
    setNotePicker(false)
    setSlashOpen(false)
  }

  const send = (): void => {
    if (running || !canSend) return
    closeMenus()
    onSend()
  }

  const change = (next: string): void => {
    const typedSlash =
      next.length > value.length &&
      next.endsWith('/') &&
      (next.length === 1 || /\s/.test(next.charAt(next.length - 2)))
    if (typedSlash) {
      onChange(next.slice(0, -1))
      setSlashOpen(true)
      setSlashIndex(0)
      setAttachOpen(false)
      setNotePicker(false)
      setPagesOpen(false)
      return
    }
    if (slashOpen) setSlashOpen(false)
    onChange(next)
  }

  const runQuickAction = (index: number): void => {
    const action = quickActions[index]
    if (!action || quickDisabled) return
    closeMenus()
    onAction(action.prompt)
  }

  const attachFile = async (file: File): Promise<void> => {
    if (file.size > MAX_FILE_BYTES) {
      onError('Ce fichier dépasse 5 Mo. Joignez un texte plus court.')
      return
    }
    try {
      const text = await file.text()
      if (!text.trim()) {
        onError('Ce fichier ne contient pas de texte lisible.')
        return
      }
      onAttachSource({
        kind: 'file',
        title: file.name,
        url: '',
        excerpt: text.slice(0, MAX_FILE_TEXT)
      })
    } catch {
      onError('Ce fichier n’a pas pu être lu.')
    }
  }

  const attachNote = async (id: string): Promise<void> => {
    try {
      const note = await window.vela.notes.get(id)
      if (!note) {
        onError('Cette note n’a pas pu être jointe.')
        return
      }
      onAttachSource({
        kind: 'note',
        title: note.title || 'Note sans titre',
        url: note.url ?? '',
        excerpt: note.body.slice(0, MAX_FILE_TEXT)
      })
      setAttachOpen(false)
      setNotePicker(false)
    } catch {
      onError('Cette note n’a pas pu être jointe.')
    }
  }

  return (
    <div className="chat-composer" ref={rootRef}>
      {slashOpen && (
        <div className="actions-pop" role="dialog" aria-label="Actions de l’agent">
          <p className="actions-pop-head">
            <Icon name="command" size={12} /> Actions
          </p>
          {quickActions.map((action, index) => (
            <button
              key={action.id}
              type="button"
              className="actions-pop-row"
              data-active={index === slashIndex}
              disabled={quickDisabled}
              title={quickDisabled ? 'Joignez d’abord une page' : action.hint}
              onMouseEnter={() => setSlashIndex(index)}
              onClick={() => runQuickAction(index)}
            >
              <Icon name={action.icon} size={13} />
              <span>{action.label}</span>
              <kbd className="actions-pop-key">↵</kbd>
            </button>
          ))}
        </div>
      )}

      {attachOpen && (
        <div className="attach-pop" role="dialog" aria-label="Joindre une source">
          {!notePicker ? (
            <>
              <p className="attach-pop-head">
                <Icon name="plus" size={12} /> Joindre
              </p>
              <button
                type="button"
                className="attach-row"
                disabled={!currentPageId}
                title={currentPageId ? 'Joindre la page active' : 'Aucune page active'}
                onClick={() => {
                  onAttachCurrent()
                  setAttachOpen(false)
                }}
              >
                <Icon name={currentAttached ? 'check' : 'globe'} size={13} />
                <span>Page actuelle</span>
                {currentTab && <small>{hostOf(currentTab.url)}</small>}
              </button>
              <button
                type="button"
                className="attach-row"
                disabled={!currentPageId}
                title={currentPageId ? 'Joindre le passage sélectionné' : 'Aucune page active'}
                onClick={() => {
                  onAttachSelection()
                  setAttachOpen(false)
                }}
              >
                <Icon name="edit" size={13} />
                <span>Sélection</span>
                <small>passage de la page</small>
              </button>
              <button
                type="button"
                className="attach-row"
                onClick={() => {
                  setAttachOpen(false)
                  setPagesOpen(true)
                }}
              >
                <Icon name="split" size={13} />
                <span>Onglets</span>
                <small>
                  {tabs.length} page{tabs.length > 1 ? 's' : ''}
                </small>
              </button>
              <button
                type="button"
                className="attach-row"
                onClick={() => {
                  setAttachOpen(false)
                  fileRef.current?.click()
                }}
              >
                <Icon name="folder" size={13} />
                <span>Fichier</span>
                <small>texte, markdown, csv…</small>
              </button>
              <button
                type="button"
                className="attach-row"
                onClick={() => setNotePicker(true)}
              >
                <Icon name="notes" size={13} />
                <span>Note</span>
                <small>{spaceNotes.length} dans ce profil</small>
              </button>
            </>
          ) : (
            <>
              <div className="attach-pop-head">
                <button
                  type="button"
                  className="attach-back"
                  onClick={() => setNotePicker(false)}
                  aria-label="Revenir aux pièces jointes"
                  title="Retour"
                >
                  <Icon name="back" size={12} />
                </button>
                Choisir une note
              </div>
              <div className="attach-note-list">
                {spaceNotes.length === 0 && <p>Aucune note dans ce profil.</p>}
                {spaceNotes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    className="attach-note"
                    onClick={() => void attachNote(note.id)}
                  >
                    <Icon name="notes" size={13} />
                    <span>
                      <strong>{note.title || 'Note sans titre'}</strong>
                      {note.preview && <small>{note.preview}</small>}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {pagesOpen && (
        <div className="pages-pop" role="dialog" aria-label="Joindre des pages">
          <div className="pages-head">
            <span>
              {tabs.length} page{tabs.length > 1 ? 's' : ''} dans ce profil
            </span>
            {tabs.length > 0 && (
              <button type="button" onClick={() => onJoinAll(selected.length !== tabs.length)}>
                {selected.length === tabs.length ? 'Tout détacher' : 'Tout joindre'}
              </button>
            )}
          </div>
          <div className="pages-list">
            {tabs.length === 0 && <p>Aucune page ouverte dans ce profil.</p>}
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

      <input
        ref={fileRef}
        type="file"
        accept={FILE_ACCEPT}
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) void attachFile(file)
        }}
      />

      <div className="composer-box">
        <div className="composer-context">
          {(attached.length > 0 || extraSources.length > 0) && (
            <div className="composer-attached">
              {extraSources.map((source, index) => (
                <button
                  key={`extra-${index}-${source.title}`}
                  type="button"
                  className="attached-chip"
                  onClick={() => onRemoveExtra(index)}
                  title={`Détacher ${source.title}`}
                  aria-label={`Détacher ${source.title}`}
                >
                  <Icon
                    name={
                      source.kind === 'file'
                        ? 'folder'
                        : source.kind === 'note'
                          ? 'notes'
                          : source.kind === 'selection'
                            ? 'edit'
                            : 'link'
                    }
                    size={12}
                  />
                  <span>{source.title}</span>
                  <Icon name="close" size={10} />
                </button>
              ))}
              {attached.slice(0, 4).map((tab) => {
                const name = tab.title || hostOf(tab.url)
                return (
                  <button
                    key={tab.id}
                    type="button"
                    className="attached-chip"
                    onClick={() => onToggle(tab.id)}
                    title={`Détacher ${name}`}
                    aria-label={`Détacher ${name}`}
                  >
                    <Favicon src={tab.favicon} label={name} size={12} />
                    <span>{name}</span>
                    <Icon name="close" size={10} />
                  </button>
                )
              })}
              {attached.length > 4 && (
                <button
                  type="button"
                  className="attached-chip"
                  onClick={() => setPagesOpen(true)}
                  title="Voir toutes les pages jointes"
                >
                  +{attached.length - 4}
                </button>
              )}
            </div>
          )}
          <span className="composer-context-spacer" />
          <button
            type="button"
            className="composer-model"
            onClick={onModel}
            title={`Modèle : ${modelTitle}`}
            aria-label={`Modèle : ${modelTitle}`}
          >
            <Icon name={modelLocal ? 'monitor' : 'cloud'} size={11} />
            <span>{modelLabel}</span>
          </button>
          <span className="composer-cost" title={costTitle}>
            {costLabel}
          </span>
        </div>

        <textarea
          ref={inputRef}
          className="chat-input"
          rows={1}
          value={value}
          aria-label="Votre demande"
          placeholder={
            mode === 'act'
              ? 'Dites à l’agent quoi faire sur la page…'
              : 'Demandez, résumez, comparez… ou tapez / pour les actions'
          }
          onChange={(event) => change(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              closeMenus()
              return
            }
            if (slashOpen) {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setSlashIndex((current) => Math.min(quickActions.length - 1, current + 1))
                return
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setSlashIndex((current) => Math.max(0, current - 1))
                return
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                event.stopPropagation()
                runQuickAction(slashIndex)
                return
              }
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              send()
            }
          }}
        />

        <div className="composer-row">
          <button
            type="button"
            className="composer-plus"
            data-active={attachOpen}
            aria-expanded={attachOpen}
            aria-label="Joindre une source"
            title="Joindre la page, une sélection, un fichier ou une note"
            onClick={() => {
              closeMenus()
              setAttachOpen(true)
            }}
          >
            <Icon name="plus" size={15} />
          </button>

          <div className="composer-modes" role="radiogroup" aria-label="Mode de l’agent">
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'answer'}
              className="composer-mode"
              data-active={mode === 'answer'}
              onClick={() => onMode('answer')}
              title="Lire : l’agent lit les pages jointes et répond"
            >
              <Icon name="eye" size={12} />
              Lire
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'act'}
              className="composer-mode"
              data-active={mode === 'act'}
              data-mode="act"
              disabled={!canAct}
              onClick={() => onMode('act')}
              title={
                canAct
                  ? 'Agir : cliquer et remplir des champs, avec votre accord à chaque action'
                  : 'Agir demande un modèle connecté'
              }
            >
              <Icon name="globe" size={12} />
              Agir
            </button>
          </div>

          <span className="composer-hint">Tapez / pour les actions</span>

          <ComposerDictation
            spaceId={spaceId}
            onError={onError}
            inputRef={inputRef}
            onText={(text) => {
              const element = inputRef.current
              const start = element?.selectionStart ?? value.length
              const end = element?.selectionEnd ?? start
              const next = `${value.slice(0, start)}${text}${value.slice(end)}`
              onChange(next)
              requestAnimationFrame(() => {
                element?.focus()
                const caret = start + text.length
                element?.setSelectionRange(caret, caret)
              })
            }}
          />

          <span className="composer-row-spacer" />
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
              title={
                !value.trim()
                  ? 'Écrivez une demande'
                  : mode === 'answer' && joined.length === 0
                    ? 'Joignez une page à lire'
                    : 'Envoyer'
              }
            >
              <Icon name="arrow-right" size={15} />
            </button>
          )}
        </div>
      </div>

      {noticeVisible && (
        <p className="composer-notice">
          <Icon name="info" size={11} />
          <span>Le contenu de la page jointe est envoyé au modèle choisi.</span>
          <button type="button" onClick={onDismissNotice}>
            Masquer
          </button>
        </p>
      )}
    </div>
  )
}
