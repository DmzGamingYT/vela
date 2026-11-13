import { plural } from '../../lib/format'
import { Icon } from '../Icon'

interface NotesHeadProps {
  width: number
  onWidth(value: number): void
  onCommitWidth(): void
  noteCount: number
  wide: boolean
  onToggleWide(): void
  onNew(): void
  onClose(): void
}

/** Poignée de largeur et en-tête du tiroir, avec ses deux actions. */
export default function NotesHead({
  width,
  onWidth,
  onCommitWidth,
  noteCount,
  wide,
  onToggleWide,
  onNew,
  onClose
}: NotesHeadProps) {
  return (
    <>
      <div
        className="notes-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionner les notes"
        onPointerDown={(event) => {
          event.preventDefault()
          const startX = event.clientX
          const startWidth = width
          let pending = startWidth
          let frame = 0
          // Une écriture par image : chaque pas du pointeur redessinait tout le
          // tiroir (liste, éditeur, aperçu Markdown) deux à trois fois de trop.
          const paint = (): void => {
            frame = 0
            onWidth(pending)
          }
          const move = (moveEvent: PointerEvent): void => {
            pending = Math.min(760, Math.max(320, startWidth + (startX - moveEvent.clientX)))
            if (!frame) frame = requestAnimationFrame(paint)
          }
          const up = (): void => {
            if (frame) cancelAnimationFrame(frame)
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
            // Un geste interrompu par le système ne doit pas laisser les deux
            // écouteurs accrochés à `window`.
            window.removeEventListener('pointercancel', up)
            document.body.style.cursor = ''
            onCommitWidth()
          }
          document.body.style.cursor = 'col-resize'
          window.addEventListener('pointermove', move)
          window.addEventListener('pointerup', up)
          window.addEventListener('pointercancel', up)
        }}
      />

      <header className="notes-head">
        <div className="notes-title">
          <span className="notes-mark">
            <Icon name="notes" size={15} />
          </span>
          <div>
            <h2>Notes</h2>
            <p>{plural(noteCount, 'note')} · Markdown local</p>
          </div>
        </div>
        <div className="notes-head-actions">
          {noteCount > 1 && (
            <button
              type="button"
              className="icon-btn"
              onClick={onToggleWide}
              aria-pressed={wide}
              data-active={wide}
              title={wide ? 'Masquer la liste' : 'Afficher la liste'}
              aria-label={wide ? 'Masquer la liste des notes' : 'Afficher la liste des notes'}
            >
              <Icon name="panel" size={15} />
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            onClick={onNew}
            title="Nouvelle note"
            aria-label="Nouvelle note"
          >
            <Icon name="plus" size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            title="Fermer (Échap)"
            aria-label="Fermer les notes"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      </header>
    </>
  )
}
