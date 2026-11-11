import type { CSSProperties } from 'react'
import { SPACE_BACKGROUNDS, type SpaceBackground } from '@shared/space'
import { Icon } from '../Icon'
import { rovingKeyDown, SectionTitle } from './spaceParts'

interface SpaceAmbienceProps {
  color: string
  background: SpaceBackground
  onBackground(id: SpaceBackground): void
}

/** Ambiance : cinq vignettes, le nom sous l’aperçu. */
export default function SpaceAmbience({ color, background, onBackground }: SpaceAmbienceProps) {
  const label = SPACE_BACKGROUNDS.find((entry) => entry.id === background)?.label ?? 'Aucune'
  return (
    <section className="space-section">
      <SectionTitle title="Ambiance" hint={label} />
      <div
        className="space-ambiences"
        role="radiogroup"
        aria-labelledby="space-ambience-label"
        data-columns="5"
        onKeyDown={rovingKeyDown}
      >
        <span className="sr-only" id="space-ambience-label">
          Ambiance du profil
        </span>
        {SPACE_BACKGROUNDS.map((entry) => {
          const active = background === entry.id
          return (
            <button
              key={entry.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${entry.label} — ${entry.detail}`}
              title={entry.detail}
              tabIndex={active ? 0 : -1}
              className="space-ambience"
              data-active={active ? 'true' : undefined}
              data-bg={entry.id}
              style={{ '--space-color': color } as CSSProperties}
              onClick={() => onBackground(entry.id)}
            >
              <span className="space-ambience-swatch" aria-hidden="true" />
              <span className="space-ambience-copy">{entry.label}</span>
              <span className="space-check" aria-hidden="true">
                <Icon name="check" size={10} />
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
