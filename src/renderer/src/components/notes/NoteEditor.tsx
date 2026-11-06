import type { NoteAiAction } from '@shared/api'
import type { NoteGraph } from '@shared/noteLinks'
import { hostOf } from '@shared/url'
import { timeAgo } from '../../lib/format'
import { Markdown, type NoteAudioContext, type NoteLinkContext } from '../../lib/markdown'
import { Icon } from '../Icon'
import type { Draft } from './draft'

const AI_ACTIONS: { id: NoteAiAction; label: string; hint: string }[] = [
  { id: 'reformulate', label: 'Reformuler', hint: 'Phrases claires, même contenu' },
  { id: 'summarize', label: 'Résumer', hint: 'Cinq points et une synthèse' },
  { id: 'translate', label: 'Traduire', hint: 'En français, structure conservée' },
  { id: 'correct', label: 'Corriger', hint: 'Orthographe et grammaire' },
  { id: 'beautify', label: 'Embellir', hint: 'Mise en page Markdown' }
]

interface NoteEditorProps {
  draft: Draft
  confirming: boolean
  saving: boolean
  dirty: boolean
  savedAt: number | null
  preview: boolean
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
        <button
          type="button"
          className="icon-btn"
          onClick={onTogglePin}
          aria-pressed={draft.pinned}
          data-active={draft.pinned}
          title={draft.pinned ? 'Désépingler' : 'Épingler en tête'}
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
                  ×
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
        <button type="button" className="note-tool" onClick={() => onInsert('## ')} title="Titre de section">
          H2
        </button>
        <button type="button" className="note-tool" onClick={() => onInsert('**', '**')} title="Gras">
          <b>B</b>
        </button>
        <button type="button" className="note-tool" onClick={() => onPrefix('- ')} title="Liste à puces">
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
      </div>

      <div className="note-ai-row">
        <span className="note-ai-label">
          <Icon name="sparkles" size={12} /> IA
        </span>
        {AI_ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            className="note-ai"
            onClick={() => onRunAi(action.id)}
            disabled={aiBusy !== null}
            title={action.hint}
          >
            {aiBusy === action.id ? '…' : action.label}
          </button>
        ))}
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

      <div className="note-modes">
        <button type="button" className="seg" data-active={!preview} onClick={() => onPreview(false)}>
          Écrire
        </button>
        <button type="button" className="seg" data-active={preview} onClick={() => onPreview(true)}>
          Aperçu
        </button>
        <span className="note-saved" role="status">
          {aiBusy
            ? aiBusy === 'generate'
              ? 'Génération…'
              : 'Réécriture…'
            : saving
              ? 'Enregistrement…'
              : dirty
                ? 'Modifié'
                : savedAt
                  ? `Enregistré · ${timeAgo(savedAt)}`
                  : 'Brouillon'}
        </span>
      </div>

      {aiMode === 'demo' && !aiBusy && (
        <p className="note-ai-note">Repli local : aucun modèle n’est configuré (Réglages › Modèles).</p>
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
        <div className="note-preview">
          {draft.body.trim() ? (
            <Markdown text={draft.body} links={noteLinks} audio={noteAudio} />
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
        <span>
          {draft.body.length} caractères · {draft.body.split(/\s+/).filter(Boolean).length} mots
        </span>
        <button
          type="button"
          className="text-btn"
          onClick={() => void window.vela.notes.openFolder()}
        >
          <Icon name="folder" size={13} />
          Dossier
        </button>
      </footer>
    </div>
  )
}
