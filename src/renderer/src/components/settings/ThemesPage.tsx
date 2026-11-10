import type { CSSProperties } from 'react'
import {
  AMBIENCE_PRESETS,
  ambienceColors,
  ambiencePreset,
  type AmbienceScope,
  type ResolvedMode
} from '@shared/theme'
import type { SettingsPatch } from '@shared/api'
import type { Settings } from '@shared/types'
import AmbienceScene from '../AmbienceScene'
import { Icon } from '../Icon'
import RadioCards, { type ChoiceOption } from '../RadioCards'

const SCOPES: ChoiceOption<AmbienceScope>[] = [
  {
    value: 'page',
    label: 'Toute la page',
    hint: 'L’ambiance passe derrière l’accueil et le châssis.'
  },
  {
    value: 'chrome',
    label: 'Châssis seul',
    hint: 'L’accueil garde son fond opaque, l’ambiance reste dans le verre.'
  }
]

/**
 * Page « Thèmes » des réglages : les huit ambiances animées du châssis, leur
 * portée et leur présence.
 *
 * Une ambiance n'est pas un thème de couleur : elle ne change aucun accent et
 * ne touche jamais au contenu des pages. Chaque carte montre l'animation en
 * petit, la scène du haut la joue en grand, et le choix s'applique en direct.
 */
export default function ThemesPage({
  mode,
  settings,
  updateSettings
}: {
  mode: ResolvedMode
  settings: Settings
  updateSettings: (patch: SettingsPatch) => Promise<void>
}) {
  const active = ambiencePreset(settings.ambience)

  return (
    <section className="setting-block">
      <div className="setting-head">
        <h2>Ambiance</h2>
        <p>
          Une atmosphère animée derrière le verre. Elle ne recolore jamais le contenu des pages
          ouvertes : l’ambiance s’arrête à l’interface Vela.
        </p>
      </div>

      <div className="ambience-stage" data-live={settings.ambience !== 'none'}>
        <AmbienceScene
          ambience={settings.ambience}
          className="ambience-stage-scene"
          colors={active ? ambienceColors(active, mode) : undefined}
        />
        <div className="ambience-stage-glass">
          <span className="ambience-stage-kicker">
            <Icon name="sparkles" size={12} />
            {active ? active.label : 'Fond sobre'}
          </span>
          <p>
            {active
              ? active.tagline
              : 'Aucune ambiance : le fond du produit, sans animation de fond.'}
          </p>
          <div className="ambience-stage-stack" aria-hidden="true">
            <span className="ambience-stage-slab" />
            <span className="ambience-stage-slab is-raised" />
            <span className="ambience-stage-slab is-top" />
          </div>
        </div>
      </div>

      <div className="ambience-controls">
        <div className="appearance-field">
          <span className="appearance-field-label" id="ambience-scope-label">
            Portée
          </span>
          <RadioCards
            ariaLabel="Portée de l’ambiance"
            value={settings.ambienceScope}
            options={SCOPES}
            variant="segment"
            onChange={(value) => void updateSettings({ ambienceScope: value })}
          />
        </div>
        <div className="appearance-slider">
          <label className="appearance-slider-head" htmlFor="ambience-intensity">
            <span>Présence</span>
            <span className="appearance-slider-value">{settings.ambienceIntensity} %</span>
          </label>
          <input
            id="ambience-intensity"
            type="range"
            min={0}
            max={100}
            step={1}
            value={settings.ambienceIntensity}
            aria-valuetext={`${settings.ambienceIntensity} pour cent`}
            onChange={(event) =>
              void updateSettings({ ambienceIntensity: Number(event.target.value) })
            }
          />
          <div className="appearance-scale" aria-hidden="true">
            <span>Discrète</span>
            <span>Vibrante</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="ambience-off"
        data-active={settings.ambience === 'none'}
        aria-pressed={settings.ambience === 'none'}
        onClick={() => void updateSettings({ ambience: 'none' })}
      >
        <span className="ambience-off-mark">
          <Icon name="circle" size={13} />
        </span>
        <span className="ambience-off-copy">
          <span className="ambience-off-name">Aucune ambiance</span>
          <span className="ambience-off-hint">
            Le fond sobre d’origine, zéro animation de fond.
          </span>
        </span>
        {settings.ambience === 'none' && <Icon name="check" size={14} />}
      </button>

      <div className="ambience-grid" role="radiogroup" aria-label="Ambiances animées">
        {AMBIENCE_PRESETS.map((preset) => {
          const isActive = settings.ambience === preset.id
          const [first, second] = ambienceColors(preset, mode)
          return (
            <button
              type="button"
              key={preset.id}
              role="radio"
              aria-checked={isActive}
              className="ambience-card"
              data-active={isActive}
              data-ambience-card={preset.id}
              style={{ '--amb-1': first, '--amb-2': second } as CSSProperties}
              onClick={() => void updateSettings({ ambience: preset.id })}
            >
              <span
                className="ambience-thumb"
                data-ambience={preset.id}
                style={{ '--amb-1': first, '--amb-2': second } as CSSProperties}
                aria-hidden="true"
              >
                <span className="amb-layer amb-base" />
                <span className="amb-layer amb-clouds" />
                <span className="amb-layer amb-particles" />
              </span>
              <span className="ambience-card-copy">
                <span className="ambience-card-name">
                  {preset.label}
                  {isActive && <Icon name="check" size={13} />}
                </span>
                <span className="ambience-card-tagline">{preset.tagline}</span>
                <span className="ambience-card-motion">{preset.motion}</span>
              </span>
            </button>
          )
        })}
      </div>

      <p className="setting-hint ambience-note">
        Les animations ne déplacent et ne font varier que des calques composés (transform, opacité).
        « Réduire les animations » dans le système les fige, et le contraste élevé les atténue.
      </p>
    </section>
  )
}
