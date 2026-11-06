import { SPACE_BACKGROUNDS, SPACE_PRESETS, shortcutsForSet, type SpacePreset } from '@shared/space'
import Favicon from '../Favicon'
import { Icon } from '../Icon'
import SpaceAvatar from '../SpaceAvatar'
import { countLabel, rovingKeyDown, SectionTitle } from './spaceParts'

interface SpaceTemplatesProps {
  starter: string | null
  appliedTemplate: string | null
  iconSpaceId: string | undefined
  onBlank(): void
  onPreset(preset: SpacePreset): void
  onRestore(): void
}

/** Section 2 : espace vierge, modèles et retour au brouillon précédent. */
export default function SpaceTemplates({
  starter,
  appliedTemplate,
  iconSpaceId,
  onBlank,
  onPreset,
  onRestore
}: SpaceTemplatesProps) {
  return (
    <section className="space-section">
      <SectionTitle index={2} title="Point de départ" />
      <div
        className="space-templates"
        role="radiogroup"
        aria-label="Point de départ de l’espace"
        data-columns="2"
        onKeyDown={rovingKeyDown}
      >
        <button
          type="button"
          role="radio"
          aria-checked={starter === 'blank'}
          tabIndex={starter === 'blank' ? 0 : -1}
          className="space-template space-template-wide"
          data-active={starter === 'blank' ? 'true' : undefined}
          onClick={onBlank}
        >
          <span className="space-template-mark space-template-blank" aria-hidden="true">
            <Icon name="plus" size={14} />
          </span>
          <span className="space-template-copy">
            <strong>Espace vierge</strong>
            <small>
              <span>Aucun site</span>
              <span className="space-template-sep">·</span>
              <span>Aucune ambiance</span>
            </small>
          </span>
          <span className="space-check" aria-hidden="true">
            <Icon name="check" size={11} />
          </span>
        </button>

        {SPACE_PRESETS.map((preset) => {
          const sites = shortcutsForSet(preset.id)
          const ambience =
            SPACE_BACKGROUNDS.find((item) => item.id === preset.background)?.label ?? 'Aucune'
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
              <span className="space-template-mark" aria-hidden="true">
                <SpaceAvatar
                  space={{ name: preset.label, color: preset.color, avatar: preset.avatar }}
                  size={26}
                />
              </span>
              <span className="space-template-copy">
                <strong>{preset.label}</strong>
                <small>
                  <span>{countLabel(sites.length)}</span>
                  <span className="space-template-sep">·</span>
                  <span>{ambience}</span>
                </small>
                <span className="space-template-icons" aria-hidden="true">
                  {sites.slice(0, 5).map((site) => (
                    <Favicon
                      key={site.id}
                      url={site.url}
                      label={site.title}
                      size={11}
                      spaceId={iconSpaceId}
                      cacheOnly
                    />
                  ))}
                </span>
              </span>
              <span className="space-check" aria-hidden="true">
                <Icon name="check" size={11} />
              </span>
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
            Le modèle remplit l’apparence et les sites. Un nom déjà saisi n’est pas écrasé.
          </span>
        )}
      </div>
    </section>
  )
}
