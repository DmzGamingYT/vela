import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { Icon } from '../Icon'

interface NoteSketchProps {
  canvasRef: RefObject<HTMLCanvasElement | null>
  onClose(): void
  onInsert(): void
  onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>): void
  onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>): void
  onPointerEnd(): void
}

/** Fenêtre de croquis : un dessin au pointeur, inséré en Markdown. */
export default function NoteSketch({
  canvasRef,
  onClose,
  onInsert,
  onPointerDown,
  onPointerMove,
  onPointerEnd
}: NoteSketchProps) {
  return (
    <div className="note-sketch" role="dialog" aria-modal="true" aria-label="Croquis">
      <div className="note-sketch-card">
        <header>
          <strong>Croquis</strong>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Fermer le croquis"
          >
            <Icon name="close" size={15} />
          </button>
        </header>
        <canvas
          ref={canvasRef}
          width={640}
          height={360}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          aria-label="Zone de dessin"
        />
        <footer>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              const canvas = canvasRef.current
              const context = canvas?.getContext('2d')
              if (!canvas || !context) return
              context.fillStyle = '#fffdf9'
              context.fillRect(0, 0, canvas.width, canvas.height)
            }}
          >
            Effacer
          </button>
          <button type="button" className="ghost-btn" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="action" onClick={onInsert}>
            <Icon name="check" size={13} /> Insérer
          </button>
        </footer>
      </div>
    </div>
  )
}
