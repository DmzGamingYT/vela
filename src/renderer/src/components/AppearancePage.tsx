import type { CSSProperties } from 'react'
import {
  DRAGON_THEME,
  THEME_PRESETS,
  type GlassIntensity,
  type HomeBackground,
  type ResolvedMode
} from '@shared/theme'
import type { SettingsPatch } from '@shared/api'
import type { Settings, SkyVariant, Theme } from '@shared/types'
import { swatchColor } from '../lib/appearance'
import { Icon, type IconName } from './Icon'

const SKY_OPTIONS: { value: SkyVariant; label: string; detail: string; icon: IconName }[] = [
  { value: 'braise', label: 'Braises', detail: 'Un dragon traverse le ciel, des braises montent.', icon: 'sparkles' },
  { value: 'westeros', label: 'Nuit de Westeros', detail: 'Un ciel étoilé, sa lune et le même dragon.', icon: 'moon' }
]

const GLASS_OPTIONS: { value: GlassIntensity; label: string }[] = [
  { value: 'light', label: 'Léger' },
  { value: 'normal', label: 'Normal' },
  { value: 'strong', label: 'Prononcé' }
]

const BACKGROUND_OPTIONS: { value: HomeBackground; label: string; icon: IconName }[] = [
  { value: 'gradient', label: 'Dégradé du thème', icon: 'sparkles' },
  { value: 'plain', label: 'Couleur unie', icon: 'circle' },
  { value: 'image', label: 'Image locale', icon: 'image' }
]

const THEMES: { value: Theme; label: string; detail: string; icon: IconName }[] = [
  { value: 'light', label: 'Clair', detail: 'Verre blanc sur ciel clair.', icon: 'sun' },
  { value: 'dark', label: 'Sombre', detail: 'Verre fumé sur nuit profonde.', icon: 'moon' },
  { value: 'system', label: 'Système', detail: 'Suit votre Mac ou Windows.', icon: 'monitor' }
]

/**
 * Page « Apparence » des réglages : mode, couleur, ciel, transparence, fond.
 * Extraite de SettingsPanel pour que chaque page tienne dans un fichier.
 */
export default function AppearancePage({
  mode,
  settings,
  updateSettings,
  applyCustom,
  chooseBackground,
  resetAppearance,
  hexNote
}: {
  mode: ResolvedMode
  settings: Settings
  updateSettings: (patch: SettingsPatch) => Promise<void>
  applyCustom: (value: string) => void
  chooseBackground: (value: HomeBackground) => Promise<void>
  resetAppearance: () => void
  hexNote: { text: string; tone: 'info' | 'error' } | null
}) {
  return (
    <section className="setting-block">
      <div className="setting-head">
        <h2>Mode</h2>
        <p>Clair, sombre, ou comme le système. Il se combine avec le thème de couleur.</p>
      </div>
      <div className="theme-cards">
        {THEMES.map((theme) => (
          <button
            type="button"
            key={theme.value}
            className="theme-card"
            data-active={settings.theme === theme.value}
            onClick={() => void updateSettings({ theme: theme.value })}
          >
            <span className="theme-preview" data-theme-preview={theme.value}>
              <span className="theme-preview-rail" />
              <span className="theme-preview-side" />
              <span className="theme-preview-pane" />
            </span>
            <span className="theme-copy">
              <span className="theme-name">
                <Icon name={theme.icon} size={14} />
                {theme.label}
                {settings.theme === theme.value && <Icon name="check" size={13} />}
              </span>
              <span className="theme-detail">{theme.detail}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="setting-head accent-head">
        <h2>Thème de couleur</h2>
        <p>Une seule teinte, déclinée sur tout le châssis. Le contenu des sites n’est jamais recoloré.</p>
      </div>
      <div className="theme-swatches" role="group" aria-label="Thème de couleur">
        {THEME_PRESETS.map((preset) => {
          const active = settings.themeId === preset.id
          return (
            <button
              type="button"
              key={preset.id}
              aria-pressed={active}
              aria-label={preset.label}
              className="theme-tile"
              data-active={active}
              data-featured={preset.id === DRAGON_THEME}
              style={{ '--swatch': swatchColor(preset.id, settings.customAccent, mode) } as CSSProperties}
              onClick={() => void updateSettings({ themeId: preset.id })}
            >
              <span className="theme-tile-preview">
                <span className="theme-tile-rail" />
                <span className="theme-tile-side" />
                <span className="theme-tile-pane">
                  <span className="theme-tile-dot" />
                </span>
              </span>
              <span className="theme-tile-name">
                {preset.label}
                {active && <span className="theme-tile-badge" />}
              </span>
            </button>
          )
        })}
        {/* La teinte libre occupe sa propre rangée : les dix thèmes
            remplissent deux rangées pleines, sans tuile orpheline, et
            la couleur n'a qu'un seul endroit pour être réglée. */}
        <div className="theme-custom" data-active={settings.themeId === 'custom'}>
          <span
            className="theme-custom-swatch"
            style={{ '--swatch': settings.customAccent } as CSSProperties}
            aria-hidden="true"
          />
          <div className="theme-custom-copy">
            <span className="theme-custom-name">Personnalisé</span>
            <span className="theme-custom-hint">Teinte libre, saisie ci-contre</span>
          </div>
          <div className="custom-color">
            <input
              type="color"
              aria-label="Choisir une couleur personnalisée"
              value={settings.customAccent}
              onChange={(event) => applyCustom(event.target.value)}
            />
            <input
              type="text"
              aria-label="Code hexadécimal"
              key={settings.customAccent}
              defaultValue={settings.customAccent.toUpperCase()}
              spellCheck={false}
              onBlur={(event) => applyCustom(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  applyCustom(event.currentTarget.value)
                }
              }}
            />
          </div>
          {settings.themeId === 'custom' ? (
            <span className="theme-custom-state">
              <Icon name="check" size={12} />
              Active
            </span>
          ) : (
            <button
              type="button"
              className="action"
              onClick={() => void updateSettings({ themeId: 'custom' })}
            >
              Utiliser
            </button>
          )}
        </div>
      </div>

      {hexNote && (
        <p className="custom-color-note" data-tone={hexNote.tone}>
          {hexNote.text}
        </p>
      )}

      <div className="setting-head">
        <h2>Intensité du verre</h2>
        <p>Teinte et transparence du fond des panneaux.</p>
      </div>
      <div className="appearance-grid" role="radiogroup" aria-label="Intensité du verre">
        {GLASS_OPTIONS.map((option) => (
          <button
            type="button"
            key={option.value}
            role="radio"
            aria-checked={settings.glass === option.value}
            className="appearance-choice"
            data-active={settings.glass === option.value}
            onClick={() => void updateSettings({ glass: option.value })}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="setting-head">
        <h2>Arrière-plan de l’accueil</h2>
        <p>Le dégradé suit le thème. Une image reste sur cet appareil.</p>
      </div>
      <div className="appearance-grid" role="radiogroup" aria-label="Arrière-plan de l’accueil">
        {BACKGROUND_OPTIONS.map((option) => (
          <button
            type="button"
            key={option.value}
            role="radio"
            aria-checked={settings.homeBackground === option.value}
            className="appearance-choice"
            data-active={settings.homeBackground === option.value}
            onClick={() => void chooseBackground(option.value)}
          >
            <Icon name={option.icon} size={13} />
            {option.label}
          </button>
        ))}
      </div>
      {settings.homeBackground === 'image' && settings.homeImage && (
        <div className="setting-row">
          <div>
            <label>Flou de l’image</label>
            <p className="setting-hint">{settings.homeBlur} px · {settings.homeImage.split(/[\\/]/).pop()}</p>
          </div>
          <input
            type="range"
            min={0}
            max={40}
            step={1}
            aria-label="Flou de l’image d’accueil"
            value={settings.homeBlur}
            onChange={(event) => void updateSettings({ homeBlur: Number(event.target.value) })}
          />
        </div>
      )}

      <div className="setting-head">
        <h2>Options</h2>
        <p>Accessibilité et variation automatique, sans changer de thème.</p>
      </div>
      <div className="setting-toggles">
        <div className="setting-row">
          <div>
            <label>Ambiance du ciel</label>
            <p className="setting-hint">
              Deux ciels pour l’accueil, avec le thème Braise : braises et dragon, ou nuit étoilée.
              « Réduire les animations » les fige.
            </p>
          </div>
          <button
            type="button"
            className="switch"
            role="switch"
            aria-checked={settings.dragonSky}
            data-on={settings.dragonSky}
            aria-label="Ambiance du ciel"
            onClick={() => void updateSettings({ dragonSky: !settings.dragonSky })}
          >
            <span />
          </button>
        </div>
        <div className="setting-row" data-disabled={!settings.dragonSky}>
          <div>
            <label>Ciel de l’accueil</label>
            <p className="setting-hint">Le dragon passe dans les deux, plus haut que la carte météo.</p>
          </div>
          <div className="appearance-grid" role="radiogroup" aria-label="Ciel de l’accueil">
            {SKY_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.value}
                role="radio"
                aria-checked={settings.skyVariant === option.value}
                aria-label={`${option.label}. ${option.detail}`}
                className="appearance-choice"
                data-active={settings.skyVariant === option.value}
                disabled={!settings.dragonSky}
                onClick={() => void updateSettings({ skyVariant: option.value })}
              >
                <Icon name={option.icon} size={13} />
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row">
          <div>
            <label>Contraste élevé</label>
            <p className="setting-hint">Bordures renforcées, transparences supprimées.</p>
          </div>
          <button
            type="button"
            className="switch"
            role="switch"
            aria-checked={settings.highContrast}
            data-on={settings.highContrast}
            onClick={() => void updateSettings({ highContrast: !settings.highContrast })}
          >
            <span />
          </button>
        </div>
        <div className="setting-row">
          <div>
            <label>Thème selon l’heure</label>
            <p className="setting-hint">Clair de 7 h à 19 h, sombre le soir, avec la même couleur.</p>
          </div>
          <button
            type="button"
            className="switch"
            role="switch"
            aria-checked={settings.hourTheme}
            data-on={settings.hourTheme}
            onClick={() => void updateSettings({ hourTheme: !settings.hourTheme })}
          >
            <span />
          </button>
        </div>
        <div className="setting-row">
          <div>
            <label>Un thème par espace</label>
            <p className="setting-hint">
              Chaque espace garde son thème ; sinon le thème global s’applique. Voir Modifier un espace.
            </p>
          </div>
          <button
            type="button"
            className="switch"
            role="switch"
            aria-checked={settings.perSpaceThemes}
            data-on={settings.perSpaceThemes}
            onClick={() => void updateSettings({ perSpaceThemes: !settings.perSpaceThemes })}
          >
            <span />
          </button>
        </div>
      </div>

      <button type="button" className="action wide" onClick={resetAppearance}>
        <Icon name="refresh" size={13} />
        Réinitialiser l’apparence
      </button>
    </section>
  )
}
