import type { SettingsPatch } from '@shared/api'
import type { HomeBackground } from '@shared/theme'
import type { Settings, SkyVariant, Theme } from '@shared/types'
import { Icon, type IconName } from './Icon'

const SKY_OPTIONS: { value: SkyVariant; label: string; detail: string; icon: 'sparkles' | 'moon' }[] = [
  { value: 'braise', label: 'Braises', detail: 'Un dragon traverse le ciel, des braises montent.', icon: 'sparkles' },
  { value: 'westeros', label: 'Nuit de Westeros', detail: 'Un ciel étoilé, sa lune et le même dragon.', icon: 'moon' }
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
 * Page « Apparence » des réglages : le mode, l'accueil et les options.
 *
 * Les réglages fins (accents, teinte libre, verre) vivent dans « Tweaks » et
 * les ambiances animées dans « Thèmes » : cette page ne garde que ce qui
 * structure le châssis au quotidien.
 */
export default function AppearancePage({
  settings,
  updateSettings,
  chooseBackground
}: {
  settings: Settings
  updateSettings: (patch: SettingsPatch) => Promise<void>
  chooseBackground: (value: HomeBackground) => Promise<void>
}) {
  return (
    <section className="setting-block">
      <div className="setting-head">
        <h2>Mode</h2>
        <p>Clair, sombre, ou comme le système. Il se combine avec la teinte d’accent et l’ambiance.</p>
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
            <span className="mode-preview" data-mode-preview={theme.value} aria-hidden="true">
              <span className="mode-preview-rail" />
              <span className="mode-preview-side" />
              <span className="mode-preview-pane" />
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
            <p className="setting-hint">
              {settings.homeBlur} px · {settings.homeImage.split(/[\\/]/).pop()}
            </p>
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
    </section>
  )
}
