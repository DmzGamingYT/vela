import { useEffect, useRef } from 'react'
import { languageName } from '@shared/language'

interface TranslatePopoverProps {
  source: string | null
  target: string
  always: boolean
  /** Langues proposées par l’interface ; jamais recopiées ici. */
  languages: { id: string; label: string }[]
  error: string | null
  onTarget: (code: string) => void
  onAlways: (value: boolean) => void
  onOriginal: () => void
  onClose: () => void
}

/**
 * Fenêtre de traduction : ouverte depuis la pastille à l’état « traduite ».
 * Échap, clic extérieur ou perte du focus clavier la referment ; le retour du
 * focus sur la pastille est assuré par l’en-tête, qui possède la référence.
 */
export default function TranslatePopover({
  source,
  target,
  always,
  languages,
  error,
  onTarget,
  onAlways,
  onOriginal,
  onClose
}: TranslatePopoverProps) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const outside = (event: PointerEvent): void => {
      const node = event.target
      if (node instanceof Node && panel.current?.contains(node)) return
      onClose()
    }
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [onClose])

  return (
    <div
      ref={panel}
      className="translate-popover"
      role="dialog"
      aria-label="Traduction de la page"
      onBlur={(event) => {
        const next = event.relatedTarget
        if (next instanceof Node && panel.current?.contains(next)) return
        // Perte du focus clavier : la fenêtre se referme, le focus revient à la
        // pastille par l’en-tête.
        onClose()
      }}
    >
      <h2 className="translate-popover-title">Page traduite</h2>
      <p className="translate-popover-sub">
        De {languageName(source)} vers {languageName(target)}
      </p>

      <label className="translate-popover-field">
        <span>Traduire en</span>
        <select value={target} onChange={(event) => onTarget(event.target.value)}>
          {languages.map((language) => (
            <option key={language.id} value={language.id}>
              {language.label}
            </option>
          ))}
        </select>
      </label>

      <label className="translate-popover-check">
        <input
          type="checkbox"
          checked={always}
          onChange={(event) => onAlways(event.target.checked)}
        />
        <span>Toujours traduire {languageName(source)}</span>
      </label>

      {error && <p className="translate-popover-error">{error}</p>}

      <button type="button" className="translate-popover-original" onClick={onOriginal}>
        Voir l’original
      </button>
    </div>
  )
}
