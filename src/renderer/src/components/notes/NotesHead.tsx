import { Icon } from '../Icon'

interface NotesHeadProps {
  width: number
  onWidth(value: number): void
  onCommitWidth(): void
  noteCount: number
  onNew(): void
  onClose(): void
}

/** Poignée de largeur et en-tête du tiroir, avec ses deux actions. */
export default function NotesHead({
  width,
  onWidth,
  onCommitWidth,
  noteCount,
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
          const move = (moveEvent: PointerEvent): void => {
            const next = Math.min(760, Math.max(320, startWidth + (startX - moveEvent.clientX)))
            onWidth(next)
          }
          const up = (): void => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
            document.body.style.cursor = ''
            onCommitWidth()
          }
          document.body.style.cursor = 'col-resize'
          window.addEventListener('pointermove', move)
          window.addEventListener('pointerup', up)
        }}
      />

      <header className="notes-head">
        <div className="notes-title">
          <span className="notes-mark">
            <Icon name="notes" size={15} />
          </span>
          <div>
            <h2>Notes</h2>
            <p>
              {noteCount} note{noteCount > 1 ? 's' : ''} · Markdown local
            </p>
          </div>
        </div>
        <div className="notes-head-actions">
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
