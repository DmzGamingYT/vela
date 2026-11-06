import { THEME_PRESETS, type ThemeId } from '@shared/theme'
import { Icon } from '../Icon'

interface SpaceAdvancedProps {
  open: boolean
  onOpen(value: boolean): void
  blockTrackers: boolean
  onBlockTrackers(value: boolean): void
  theme: ThemeId | null
  onTheme(value: ThemeId | null): void
  perSpaceThemes: boolean
  globalThemeLabel: string
  watchlist: boolean
  onWatchlist(value: boolean): void
  letterboxd: string
  onLetterboxd(value: string): void
  letterboxdError: string | null
}

/** Section 5, repliée : traqueurs, thème propre, liste à voir et Letterboxd. */
export default function SpaceAdvanced({
  open,
  onOpen,
  blockTrackers,
  onBlockTrackers,
  theme,
  onTheme,
  perSpaceThemes,
  globalThemeLabel,
  watchlist,
  onWatchlist,
  letterboxd,
  onLetterboxd,
  letterboxdError
}: SpaceAdvancedProps) {
  return (
    <details
      className="space-fold"
      open={open}
      onToggle={(event) => onOpen(event.currentTarget.open)}
    >
      <summary className="space-fold-summary">
        <span className="space-section-index" aria-hidden="true">
          5
        </span>
        <span className="space-fold-title">Avancé</span>
        <span className="space-fold-hint">Réglages propres à cet espace</span>
        <Icon name="chevron-down" size={13} />
      </summary>
      <div className="space-fold-body">
        <div className="space-toggle-row">
          <div>
            <span>Filtrer les traqueurs</span>
            <small>Publicités et mesure, pour cet espace seulement.</small>
          </div>
          <button
            type="button"
            className="switch"
            role="switch"
            aria-checked={blockTrackers}
            data-on={blockTrackers ? 'true' : 'false'}
            onClick={() => onBlockTrackers(!blockTrackers)}
            aria-label="Filtrer les traqueurs dans cet espace"
          >
            <span />
          </button>
        </div>

        {perSpaceThemes ? (
          <label className="field">
            <span>Thème de couleur de l’espace</span>
            <select
              className="select"
              value={theme ?? ''}
              onChange={(event) => onTheme((event.target.value || null) as ThemeId | null)}
            >
              <option value="">Thème global ({globalThemeLabel})</option>
              {THEME_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
              <option value="custom">Couleur personnalisée</option>
            </select>
          </label>
        ) : null}

        <div className="space-toggle-row">
          <div>
            <span>Liste à voir</span>
            <small>
              Une carte sur l’accueil de cet espace : titres à voir et tirage « Ce soir ».
            </small>
          </div>
          <button
            type="button"
            className="switch"
            role="switch"
            aria-checked={watchlist}
            data-on={watchlist ? 'true' : 'false'}
            onClick={() => onWatchlist(!watchlist)}
            aria-label="Afficher la liste à voir sur l’accueil"
          >
            <span />
          </button>
        </div>

        <label className="field">
          <span>Compte Letterboxd</span>
          <input
            className="space-name-input"
            value={letterboxd}
            placeholder="votre-nom"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            onChange={(event) => onLetterboxd(event.target.value)}
          />
        </label>
        <p className="space-help">
          Facultatif. Ouvre vos pages Letterboxd dans votre session. L’import du journal lit une
          fois le flux RSS public du profil, à votre clic.
        </p>
        {letterboxdError ? (
          <p className="space-error" role="alert">
            {letterboxdError}
          </p>
        ) : null}
        <p className="space-help">
          Niveau de blocage, moteur de recherche, page de démarrage et historique restent des
          réglages globaux : ils sont dans Réglages, pas ici.
        </p>
      </div>
    </details>
  )
}
