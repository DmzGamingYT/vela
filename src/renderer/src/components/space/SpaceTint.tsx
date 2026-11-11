import { SPACE_TINTS } from '@shared/defaults'
import { Icon } from '../Icon'
import { rovingKeyDown, SectionTitle } from './spaceParts'

interface SpaceTintProps {
  color: string
  tint: { label: string } | null
  tintError: string | null
  tintNotice: string | null
  customOpen: boolean
  customInput: string
  onCustomInput(value: string): void
  onToggleCustom(): void
  onCommitTint(raw: string): void
  onTint(color: string): void
}

/** Teinte : onze pastilles, une valeur lisible, rien de plus. */
export default function SpaceTint({
  color,
  tint,
  tintError,
  tintNotice,
  customOpen,
  customInput,
  onCustomInput,
  onToggleCustom,
  onCommitTint,
  onTint
}: SpaceTintProps) {
  return (
    <section className="space-section">
      <SectionTitle title="Teinte" hint={tint?.label ?? 'Personnalisée'} />
      <div
        className="space-tints"
        role="radiogroup"
        aria-labelledby="space-tint-label"
        data-columns="11"
        onKeyDown={rovingKeyDown}
      >
        <span className="sr-only" id="space-tint-label">
          Teinte du profil
        </span>
        {SPACE_TINTS.map((entry, index) => {
          const active = entry.color.toLowerCase() === color.toLowerCase()
          return (
            <button
              key={entry.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={entry.label}
              title={entry.label}
              tabIndex={active ? 0 : !tint && index === 0 ? 0 : -1}
              className="space-tint"
              data-active={active ? 'true' : undefined}
              onClick={() => onTint(entry.color)}
            >
              <span
                className="space-tint-dot"
                style={{ background: entry.color }}
                aria-hidden="true"
              >
                {active ? <Icon name="check" size={11} /> : null}
              </span>
              <span className="space-tint-name">{entry.label}</span>
            </button>
          )
        })}
        <button
          type="button"
          role="radio"
          aria-checked={!tint}
          aria-label="Teinte personnalisée"
          title="Personnalisée"
          tabIndex={!tint ? 0 : -1}
          className="space-tint space-tint-custom"
          data-active={!tint ? 'true' : undefined}
          onClick={onToggleCustom}
        >
          <span className="space-tint-dot space-tint-rainbow" aria-hidden="true">
            {!tint ? <Icon name="check" size={11} /> : null}
          </span>
          <span className="space-tint-name">Personnalisée</span>
        </button>
      </div>

      {customOpen || !tint ? (
        <div className="space-custom-tint">
          <input
            type="color"
            className="space-color-input"
            value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#5b5bd6'}
            aria-label="Choisir une couleur personnalisée"
            onChange={(event) => onCommitTint(event.target.value)}
          />
          <input
            className="space-hex-input"
            value={customInput}
            spellCheck={false}
            aria-label="Couleur hexadécimale"
            onChange={(event) => onCustomInput(event.target.value)}
            onBlur={() => onCommitTint(customInput)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onCommitTint(customInput)
              }
            }}
          />
          <span className="space-help">Sélecteur ou code hexadécimal.</span>
        </div>
      ) : null}
      {tintError ? (
        <p className="space-error" role="alert">
          {tintError}
        </p>
      ) : null}
      {tintNotice ? <p className="space-help">{tintNotice}</p> : null}
    </section>
  )
}
