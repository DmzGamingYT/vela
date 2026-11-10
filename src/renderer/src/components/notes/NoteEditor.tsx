import { useEffect, useRef, useState } from 'react'
import type { NoteAiAction } from '@shared/api'
import type { NoteGraph } from '@shared/noteLinks'
import { hostOf } from '@shared/url'
import { shortcut } from '../../lib/format'
import { Markdown, type NoteAudioContext, type NoteLinkContext } from '../../lib/markdown'
import { Icon } from '../Icon'
import {
  NOTE_AI_ACTIONS as AI_ACTIONS,
  NOTE_AI_SECONDARY_ACTIONS as SECONDARY_AI_ACTIONS
} from './aiActions'
import type { Draft } from './draft'

const LAST_SECONDARY_KEY = 'vela-notes-ai-last-secondary'

/** Dernière action secondaire retenue, si elle existe encore dans le menu. */
function readLastSecondary(): NoteAiAction | null {
  try {
    const stored = window.localStorage.getItem(LAST_SECONDARY_KEY)
    return SECONDARY_AI_ACTIONS.some((action) => action.id === stored)
      ? (stored as NoteAiAction)
      : null
  } catch {
    return null
  }
}

interface NoteEditorProps {
  draft: Draft
  confirming: boolean
  saving: boolean
  dirty: boolean
  savedAt: number | null
  preview: boolean
  /** Recherche qui a ouvert la note : ses occurrences sont marquées dans l'aperçu. */
  highlight: string
  aiBusy: NoteAiAction | 'generate' | null
  aiMode: 'api' | 'demo' | null
  renameUndo: { id: string; from: string; updated: number } | null
  tagDraft: string
  linkMenu: { query: string; index: number } | null
  linkSuggestions: { id: string; title: string }[]
  graph: NoteGraph | null
  linksOpen: boolean
  noteLinks: NoteLinkContext | undefined
  noteAudio: NoteAudioContext | undefined
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  hasPage: boolean
  onBack(): void
  onPatch(patch: Partial<Draft>): void
  onTogglePin(): void
  onRemove(): void
  onCopy(): void
  onDuplicate(): void
  onOpenSource(url: string): void
  onTagDraft(value: string): void
  onAddTag(): void
  onRemoveTag(tag: string): void
  onInsert(before: string, after?: string, options?: { block?: boolean }): void
  onPrefix(prefix: string): void
  onRecorder(): void
  onSketch(): void
  onHighlight(): void
  onRunAi(action: NoteAiAction): void
  onUndoRename(): void
  onDismissRename(): void
  onPreview(value: boolean): void
  onLinkMenu(value: { query: string; index: number } | null): void
  onApplyLink(title: string): void
  onUpdateLink(body: string, caret: number | null): void
  onToggleLinks(): void
  onOpenNote(id: string): void
  onCreateLinked(title: string): void
}

/** Éditeur d'une note : la page de travail complète, du titre aux liens. */
export default function NoteEditor({
  draft,
  confirming,
  saving,
  dirty,
  savedAt,
  preview,
  highlight,
  aiBusy,
  aiMode,
  renameUndo,
  tagDraft,
  linkMenu,
  linkSuggestions,
  graph,
  linksOpen,
  noteLinks,
  noteAudio,
  textareaRef,
  hasPage,
  onBack,
  onPatch,
  onTogglePin,
  onRemove,
  onCopy,
  onDuplicate,
  onOpenSource,
  onTagDraft,
  onAddTag,
  onRemoveTag,
  onInsert,
  onPrefix,
  onRecorder,
  onSketch,
  onHighlight,
  onRunAi,
  onUndoRename,
  onDismissRename,
  onPreview,
  onLinkMenu,
  onApplyLink,
  onUpdateLink,
  onToggleLinks,
  onOpenNote,
  onCreateLinked
}: NoteEditorProps) {
  const [aiMenuOpen, setAiMenuOpen] = useState(false)
  const [lastSecondary, setLastSecondary] = useState<NoteAiAction | null>(readLastSecondary)
  const aiMenuRef = useRef<HTMLDivElement | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)

  const rememberSecondary = (action: NoteAiAction): void => {
    setLastSecondary(action)
    try {
      window.localStorage.setItem(LAST_SECONDARY_KEY, action)
    } catch {
      /* stockage refusé : le choix vaut pour la session */
    }
  }

  const runAction = (action: (typeof AI_ACTIONS)[number]): void => {
    if (action.tier === 'secondary') rememberSecondary(action.id)
    onRunAi(action.id)
  }

  const secondaryActions = lastSecondary
    ? [...SECONDARY_AI_ACTIONS].sort((a, b) =>
        a.id === lastSecondary ? -1 : b.id === lastSecondary ? 1 : 0
      )
    : SECONDARY_AI_ACTIONS
  const lastSecondaryLabel = SECONDARY_AI_ACTIONS.find(
    (action) => action.id === lastSecondary
  )?.label

  // Un clic hors du menu le referme ; Échap est traité depuis le menu lui-même
  // pour ne pas fermer aussi le tiroir des notes.
  useEffect(() => {
    if (!aiMenuOpen) return
    const closeOnOutside = (event: PointerEvent): void => {
      if (!aiMenuRef.current?.contains(event.target as Node)) setAiMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    return () => document.removeEventListener('pointerdown', closeOnOutside)
  }, [aiMenuOpen])

  // Le premier passage trouvé est amené au centre de l'aperçu.
  useEffect(() => {
    if (!preview || !highlight) return
    previewRef.current?.querySelector('mark.md-hit')?.scrollIntoView({ block: 'center' })
  }, [preview, highlight, draft.body])

  return (
    <div className="note-editor">
      <div className="note-editor-head">
        <button
          type="button"
          className="icon-btn"
          onClick={onBack}
          title="Retour aux notes"
          aria-label="Retour aux notes"
        >
          <Icon name="back" size={16} />
        </button>
        <input
          className="note-title-input"
          aria-label="Titre de la note"
          value={draft.title}
          placeholder="Titre de la note"
          onChange={(event) => onPatch({ title: event.target.value })}
        />
        <span
          className="note-head-state"
          data-dirty={dirty ? 'true' : undefined}
          role="status"
          aria-live="polite"
        >
          {aiBusy
            ? aiBusy === 'generate'
              ? 'Génération…'
              : 'Réécriture…'
            : saving
              ? 'Enregistrement…'
              : dirty
                ? 'Modifications…'
                : savedAt
                  ? <>
                      <Icon name="check" size={10} /> Enregistré
                    </>
                  : ''}
        </span>
        <button
          type="button"
          className="icon-btn"
          onClick={() => onPreview(!preview)}
          aria-pressed={preview}
          aria-label={preview ? 'Écrire' : 'Aperçu'}
          title={preview ? 'Revenir à l’écriture' : 'Aperçu Markdown'}
        >
          <Icon name={preview ? 'edit' : 'eye'} size={15} />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={onTogglePin}
          aria-pressed={draft.pinned}
          data-active={draft.pinned}
          title={
            draft.pinned
              ? `Désépingler (${shortcut('⇧P')})`
              : `Épingler en tête (${shortcut('⇧P')})`
          }
          aria-keyshortcuts="Meta+Shift+P Control+Shift+P"
        >
          <Icon name="star" size={15} filled={draft.pinned} />
        </button>
        <button
          type="button"
          className="icon-btn danger"
          onClick={onRemove}
          title={confirming ? 'Cliquer à nouveau pour confirmer' : 'Supprimer la note'}
          data-confirming={confirming}
          aria-label="Supprimer la note"
        >
          <Icon name={confirming ? 'warning' : 'trash'} size={15} />
        </button>
      </div>

      {(draft.url || draft.tags.length > 0) && (
        <div className="note-meta-row">
          {draft.url && (
            <span className="note-source">
              <Icon name="globe" size={12} />
              <span>{hostOf(draft.url)}</span>
              <button
                type="button"
                className="text-btn"
                onClick={() => onOpenSource(draft.url!)}
                title="Ouvrir la source dans un onglet"
              >
                Ouvrir
                <Icon name="external" size={10} />
              </button>
              <button
                type="button"
                className="text-btn"
                onClick={() => onPatch({ url: undefined })}
                title="Détacher la source"
              >
                Détacher
              </button>
            </span>
          )}
          <div className="note-tags editor">
            {draft.tags.map((tag) => (
              <span className="note-tag" key={tag}>
                {tag}
                <button
                  type="button"
                  onClick={() => onRemoveTag(tag)}
                  aria-label={`Retirer l’étiquette ${tag}`}
                >
                  <Icon name="close" size={10} />
                </button>
              </span>
            ))}
            <input
              className="note-tag-input"
              value={tagDraft}
              onChange={(event) => onTagDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ',') {
                  event.preventDefault()
                  onAddTag()
                }
                if (event.key === 'Backspace' && !tagDraft && draft.tags.length > 0) {
                  onRemoveTag(draft.tags[draft.tags.length - 1])
                }
              }}
              placeholder="+ étiquette"
              aria-label="Ajouter une étiquette"
            />
          </div>
        </div>
      )}

      <div className="note-toolbar" role="toolbar" aria-label="Mise en forme">
        <button
          type="button"
          className="note-tool"
          onClick={() => onInsert('## ')}
          title="Titre de section"
        >
          H2
        </button>
        <button
          type="button"
          className="note-tool"
          onClick={() => onInsert('**', '**')}
          title="Gras"
        >
          <b>B</b>
        </button>
        <button
          type="button"
          className="note-tool"
          onClick={() => onPrefix('- ')}
          title="Liste à puces"
        >
          <Icon name="list" size={14} />
        </button>
        <button
          type="button"
          className="note-tool"
          onClick={() => onPrefix('- [ ] ')}
          title="Liste de tâches"
        >
          <Icon name="check" size={14} />
        </button>
        <button
          type="button"
          className="note-tool"
          onClick={() => onInsert('```\n', '\n```', { block: true })}
          title="Bloc de code"
        >
          <Icon name="code" size={14} />
        </button>
        <button
          type="button"
          className="note-tool"
          onClick={() => onInsert('[', '](https://)')}
          title="Lien"
        >
          <Icon name="link" size={14} />
        </button>
        <button
          type="button"
          className="note-tool"
          onClick={() => {
            // On n'insère que l'ouverture : le titre choisi complète le lien.
            onInsert('[[')
            onLinkMenu({ query: '', index: 0 })
          }}
          title="Lien vers une note ([[)"
        >
          <span className="note-tool-brackets">[[ ]]</span>
        </button>
        <span className="note-tool-sep" aria-hidden="true" />
        <button
          type="button"
          className="note-tool"
          onClick={onRecorder}
          title="Enregistrer une note vocale"
          aria-label="Enregistrer une note vocale"
        >
          <Icon name="mic" size={14} />
        </button>
        <button type="button" className="note-tool" onClick={onSketch} title="Insérer un croquis">
          <Icon name="edit" size={14} />
        </button>
        {hasPage && (
          <button
            type="button"
            className="note-tool"
            onClick={onHighlight}
            title="Surligner la sélection de la page et l’ajouter ici"
          >
            <Icon name="sparkles" size={14} />
          </button>
        )}
        <span className="note-tool-sep" aria-hidden="true" />
        <div className="note-ai-more" ref={aiMenuRef}>
          <button
            type="button"
            className="note-ai-trigger"
            aria-label="Actions IA"
            aria-haspopup="menu"
            aria-expanded={aiMenuOpen}
            disabled={aiBusy !== null}
            onClick={() => setAiMenuOpen((open) => !open)}
            title={
              lastSecondaryLabel
                ? `Actions IA · dernière : ${lastSecondaryLabel}`
                : 'Actions IA : reformuler, résumer, traduire…'
            }
          >
            <Icon name="sparkles" size={12} />
            IA
            <Icon name="chevron-down" size={10} />
          </button>
          {aiMenuOpen && (
            <div
              className="note-ai-menu"
              role="menu"
              aria-label="Actions IA"
              onKeyDown={(event) => {
                if (event.key === 'Escape') setAiMenuOpen(false)
              }}
            >
              {[...secondaryActions, ...AI_ACTIONS.filter((action) => action.tier === 'primary')].map((action) => (
                <button
                  key={action.id}
                  type="button"
                  role="menuitem"
                  autoFocus={action.id === (lastSecondary ?? secondaryActions[0]?.id)}
                  data-last={action.id === lastSecondary}
                  disabled={aiBusy !== null}
                  onClick={() => {
                    setAiMenuOpen(false)
                    runAction(action)
                  }}
                  title={`${action.hint} (${shortcut(action.key)})`}
                  aria-keyshortcuts={`Meta+Alt+${action.digit} Control+Alt+${action.digit}`}
                >
                  <strong>
                    <span className="note-ai-name">
                      {aiBusy === action.id ? '…' : action.label}
                      {action.id === lastSecondary && (
                        <span className="note-ai-last">Dernière</span>
                      )}
                    </span>
                    <span className="note-ai-key">{shortcut(action.key)}</span>
                  </strong>
                  <small>{action.hint}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {linkMenu && (
        <div className="note-link-menu" role="listbox" aria-label="Liens vers une note">
          <p className="note-link-menu-head">
            <Icon name="notes" size={12} /> Lien vers une note
          </p>
          {linkSuggestions.map((note, index) => (
            <button
              key={note.id}
              type="button"
              role="option"
              aria-selected={linkMenu.index === index}
              className="note-link-option"
              data-active={linkMenu.index === index}
              onMouseEnter={() => onLinkMenu({ ...linkMenu, index })}
              onClick={() => onApplyLink(note.title)}
            >
              {note.title}
            </button>
          ))}
          {linkMenu.query.trim() && (
            <button
              type="button"
              role="option"
              aria-selected={linkSuggestions.length === 0}
              className="note-link-option"
              data-active={linkSuggestions.length === 0}
              onClick={() => onApplyLink(linkMenu.query)}
            >
              <Icon name="plus" size={12} /> Lier « {linkMenu.query.trim()} »
            </button>
          )}
          <span className="note-link-hint">Entrée pour insérer · Échap pour fermer</span>
        </div>
      )}


      {aiMode === 'demo' && !aiBusy && (
        <p className="note-ai-note">
          Repli local : aucun modèle n’est configuré (Réglages › Modèles).
        </p>
      )}

      {renameUndo && (
        <div className="note-rename-undo" role="status">
          <span>
            <Icon name="link" size={12} /> Liens mis à jour dans {renameUndo.updated} note
            {renameUndo.updated > 1 ? 's' : ''}
          </span>
          <button type="button" className="text-btn" onClick={onUndoRename}>
            Annuler
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onDismissRename}
            aria-label="Ignorer la modification des liens"
          >
            <Icon name="close" size={12} />
          </button>
        </div>
      )}

      {preview ? (
        <div className="note-preview" ref={previewRef}>
          {draft.body.trim() ? (
            <Markdown
              text={draft.body}
              highlight={highlight || undefined}
              links={noteLinks}
              audio={noteAudio}
            />
          ) : (
            <p className="note-empty-preview">Rien à prévisualiser.</p>
          )}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          className="note-textarea"
          aria-label="Texte de la note"
          value={draft.body}
          placeholder="Écrivez en Markdown, glissez un extrait depuis la page, ou liez une note avec [[Titre]]."
          spellCheck
          onChange={(event) => {
            const value = event.target.value
            onPatch({ body: value })
            onUpdateLink(value, event.target.selectionStart)
          }}
          onClick={(event) => onUpdateLink(draft.body, event.currentTarget.selectionStart)}
          onKeyDown={(event) => {
            if (!linkMenu) return
            if (event.key === 'Escape') {
              event.preventDefault()
              onLinkMenu(null)
              return
            }
            const count = linkSuggestions.length
            if (count === 0) return
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              onLinkMenu({ ...linkMenu, index: (linkMenu.index + 1) % count })
              return
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              onLinkMenu({ ...linkMenu, index: (linkMenu.index - 1 + count) % count })
              return
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
              event.preventDefault()
              onApplyLink(linkSuggestions[linkMenu.index]?.title ?? linkMenu.query)
            }
          }}
        />
      )}

      {draft.id &&
        graph &&
        (graph.outgoing.length > 0 || graph.incoming.length > 0 || graph.missing.length > 0) && (
          <section className="note-links" data-open={linksOpen} aria-label="Notes liées">
            <button
              type="button"
              className="note-links-head"
              aria-expanded={linksOpen}
              onClick={onToggleLinks}
            >
              <Icon name={linksOpen ? 'chevron-down' : 'chevron-right'} size={12} />
              Notes liées
              <span className="note-links-count">
                {graph.outgoing.length + graph.incoming.length + graph.missing.length}
              </span>
            </button>
            {linksOpen && (
              <div className="note-links-body">
                {graph.outgoing.length > 0 && (
                  <div className="note-links-group">
                    <h3>Vers</h3>
                    <ul>
                      {graph.outgoing.map((ref) => (
                        <li key={`out-${ref.id}`}>
                          <button type="button" onClick={() => ref.id && onOpenNote(ref.id)}>
                            {ref.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {graph.incoming.length > 0 && (
                  <div className="note-links-group">
                    <h3>Citée par</h3>
                    <ul>
                      {graph.incoming.map((ref) => (
                        <li key={`in-${ref.id}`}>
                          <button type="button" onClick={() => ref.id && onOpenNote(ref.id)}>
                            {ref.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {graph.missing.length > 0 && (
                  <div className="note-links-group broken">
                    <h3>Liens cassés</h3>
                    <ul>
                      {graph.missing.map((title) => (
                        <li key={`missing-${title}`}>
                          <span>{title}</span>
                          <button
                            type="button"
                            className="text-btn"
                            onClick={() => onCreateLinked(title)}
                          >
                            Créer la note
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

      <footer className="note-foot">
        {draft.body.trim() ? (
          <span
            title={`Raccourcis : ${shortcut('⇧F')} rechercher · ${shortcut('G')} résultat suivant · ${shortcut('⇧P')} épingler · ${shortcut('⇧C')} copier · ${shortcut('⌥↑')} / ${shortcut('⌥↓')} changer de note`}
          >
            {draft.body.length} caractères · {draft.body.split(/\s+/).filter(Boolean).length} mots ·{' '}
            {Math.max(1, Math.round(draft.body.split(/\s+/).filter(Boolean).length / 200))} min de
            lecture
          </span>
        ) : (
          <span />
        )}
        <div className="note-foot-actions">
          <button
            type="button"
            className="text-btn"
            onClick={onCopy}
            disabled={!draft.body.trim()}
            title={`Copier le Markdown (${shortcut('⇧C')})`}
            aria-keyshortcuts="Meta+Shift+C Control+Shift+C"
          >
            <Icon name="copy" size={13} />
            Copier
          </button>
          <button
            type="button"
            className="text-btn"
            onClick={onDuplicate}
            title="Dupliquer la note"
          >
            <Icon name="notes" size={13} />
            Dupliquer
          </button>
          <button
            type="button"
            className="text-btn"
            onClick={() => void window.vela.notes.openFolder()}
            title="Afficher le fichier dans le Finder"
          >
            <Icon name="folder" size={13} />
            Finder
          </button>
        </div>
      </footer>
    </div>
  )
}
