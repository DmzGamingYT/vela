import { SPACE_PRESETS, shortcutsForSet, type SpacePreset } from '@shared/space'
import { Icon } from '../Icon'
import { rovingKeyDown, SectionTitle } from './spaceParts'

interface SpaceTemplatesProps {
  starter: string | null
  appliedTemplate: string | null
  onBlank(): void
  onPreset(preset: SpacePreset): void
  onRestore(): void
}

/** Point de départ : une pastille par modèle, le nombre de sites à droite. */
export default function SpaceTemplates({
  starter,
  appliedTemplate,
  onBlank,
  onPreset,
  onRestore
}: SpaceTemplatesProps) {
  return (
    <section className="space-section">
      <SectionTitle title="Point de départ" hint="Remplit l’apparence et les sites" />
      <div
        className="space-templates"
        role="radiogroup"
        aria-label="Point de départ du profil"
        data-columns="6"
        onKeyDown={rovingKeyDown}
      >
        <button
          type="button"
          role="radio"
          aria-checked={starter === 'blank'}
          tabIndex={starter === 'blank' ? 0 : -1}
          className="space-template"
          data-active={starter === 'blank' ? 'true' : undefined}
          onClick={onBlank}
        >
          <Icon name="plus" size={12} />
          Profil vierge
        </button>

        {SPACE_PRESETS.map((preset) => {
          const sites = shortcutsForSet(preset.id)
          const active = starter === preset.id
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              className="space-template"
              data-active={active ? 'true' : undefined}
              data-preset={preset.id}
              onClick={() => onPreset(preset)}
            >
              <span
                className="space-template-dot"
                style={{ background: preset.color }}
                aria-hidden="true"
              />
              {preset.label}
              <span className="space-template-count">{sites.length}</span>
            </button>
          )
        })}
      </div>
      <div className="space-template-status" aria-live="polite">
        {appliedTemplate ? (
          <span className="space-applied">
            Modèle appliqué · {appliedTemplate}
            <button type="button" className="space-inline-link" onClick={onRestore}>
              Annuler
            </button>
          </span>
        ) : (
          <span className="space-help">
            Un nom déjà saisi n’est pas écrasé par le modèle.
          </span>
        )}
      </div>
    </section>
  )
}
