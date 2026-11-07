import type { TrashedNote } from '@shared/types'
import { timeAgo } from '../../lib/format'
import { Icon } from '../Icon'

interface TrashPanelProps {
  notes: TrashedNote[]
  busy: boolean
  onRestore(id: string): void
  onClose(): void
}

/** Notes supprimées : elles restent lisibles et peuvent revenir dans la liste. */
export default function TrashPanel({ notes, busy, onRestore, onClose }: TrashPanelProps) {
  return (
    <div className="notes-trash-layer">
      <button
        type="button"
        className="notes-trash-scrim"
        aria-label="Fermer la corbeille"
        onClick={onClose}
      />
      <section className="notes-trash" role="dialog" aria-label="Corbeille">
        <header className="notes-trash-head">
          <span className="notes-trash-mark">
            <Icon name="trash" size={14} />
          </span>
          <div>
            <h3>Corbeille</h3>
            <p>
              {notes.length === 0
                ? 'Aucune note supprimée'
                : `${notes.length} note${notes.length > 1 ? 's' : ''} supprimée${notes.length > 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            title="Fermer"
            aria-label="Fermer la corbeille"
          >
            <Icon name="close" size={14} />
          </button>
        </header>

        <div className="notes-trash-body">
          {notes.length === 0 ? (
            <div className="notes-trash-empty">
              <span>
                <Icon name="trash" size={20} />
              </span>
              <p>La corbeille est vide.</p>
              <small>Les notes supprimées apparaîtront ici et pourront être restaurées.</small>
            </div>
          ) : (
            notes.map((note) => (
              <article className="notes-trash-row" key={note.id}>
                <div className="notes-trash-row-main">
                  <span className="notes-trash-title">{note.title}</span>
                  <span className="notes-trash-meta">
                    {timeAgo(note.deletedAt)}
                    {note.tags.length > 0 ? ` · ${note.tags.join(', ')}` : ''}
                  </span>
                  {note.preview && <p className="notes-trash-preview">{note.preview}</p>}
                </div>
                <button
                  type="button"
                  className="action"
                  disabled={busy}
                  onClick={() => onRestore(note.id)}
                  title="Remettre cette note dans la liste"
                >
                  <Icon name="reload" size={12} />
                  Restaurer
                </button>
              </article>
            ))
          )}
        </div>

        <footer className="notes-trash-foot">
          <small>Les fichiers restent dans notes/corbeille.</small>
          <button type="button" className="text-btn" onClick={onClose}>
            Fermer
          </button>
        </footer>
      </section>
    </div>
  )
}
