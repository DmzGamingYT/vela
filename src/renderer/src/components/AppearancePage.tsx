import { useState, type CSSProperties, type ReactNode } from 'react'
import {
  ACCENT_THEMES,
  MAX_GLASS_BLUR,
  SKY_THEME,
  adjustAccent,
  parseHex,
  readableOn,
  type HomeBackground,
  type ResolvedMode,
  type SkyVariant,
  type ThemeId
} from '@shared/theme'
import type { SettingsPatch } from '@shared/api'
import type { Settings } from '@shared/types'
import { Icon } from './Icon'
import AppearancePreview from './AppearancePreview'
import RadioCards, { type ChoiceOption } from './RadioCards'
import { useBrowser } from '../store/browser'

const MODES = [
  { value: 'light', label: 'Clair', hint: 'Fond clair' },
  { value: 'dark', label: 'Sombre', hint: 'Fond sombre' },
  { value: 'system', label: 'Système', hint: 'Suit votre Mac ou Windows' }
] satisfies ChoiceOption<'light' | 'dark' | 'system'>[]

const DENSITIES: ChoiceOption<'compact' | 'normal' | 'airy'>[] = [
  { value: 'compact', label: 'Compacte' },
  { value: 'normal', label: 'Normale' },
  { value: 'airy', label: 'Aérée' }
]

const TEXT_SIZES: ChoiceOption<'small' | 'normal' | 'large'>[] = [
  { value: 'small', label: 'Petite' },
  { value: 'normal', label: 'Normale' },
  { value: 'large', label: 'Grande' }
]

const SIDES: ChoiceOption<'left' | 'right'>[] = [
  { value: 'left', label: 'Gauche' },
  { value: 'right', label: 'Droite' }
]

const MOTION: ChoiceOption<'system' | 'reduce' | 'full'>[] = [
  { value: 'system', label: 'Système', hint: 'Suit votre appareil' },
  { value: 'reduce', label: 'Oui', hint: 'Fige les animations' },
  { value: 'full', label: 'Non', hint: 'Garde les animations' }
]

const SKIES: ChoiceOption<SkyVariant>[] = [
  {
    value: 'braise',
    label: 'Braises',
    hint: 'Des braises montent dans le ciel',
    visual: <span className="sky-thumb" data-sky="braise" />
  },
  {
    value: 'nuit-etoilee',
    label: 'Nuit étoilée',
    hint: 'Un ciel étoilé et sa lune',
    visual: <span className="sky-thumb" data-sky="nuit-etoilee" />
  }
]

/** Miniature de l'interface pour les trois modes, pas un simple aplat. */
function ModeThumb({ mode }: { mode: 'light' | 'dark' | 'system' }) {
  return (
    <span className="mode-thumb" data-thumb={mode}>
      <span className="mode-thumb-side" />
      <span className="mode-thumb-main">
        <span className="mode-thumb-word" />
        <span className="mode-thumb-field" />
        <span className="mode-thumb-tiles">
          <i />
          <i />
          <i />
        </span>
      </span>
    </span>
  )
}

/** Miniature d'un fond d'accueil, dessinée en CSS. */
function HomeThumb({ kind }: { kind: HomeBackground }) {
  return (
    <span className="home-thumb" data-kind={kind}>
      {kind === 'image' && <Icon name="image" size={13} />}
    </span>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  children
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: () => void
  children?: ReactNode
}) {
  return (
    <div className="setting-row app-toggle">
      <div className="app-toggle-copy">
        <span className="app-toggle-label">{label}</span>
        {hint && <p className="app-help">{hint}</p>}
        {children}
      </div>
      <div className="app-toggle-control">
        <span className="switch-state" data-on={checked}>
          {checked ? 'Activé' : 'Désactivé'}
        </span>
        <button
          type="button"
          className="switch"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          data-on={checked}
          onClick={onChange}
        >
          <span />
        </button>
      </div>
    </div>
  )
}

/**
 * Page « Apparence » : un seul endroit pour le mode, la couleur, le fond de
 * l'accueil, l'interface, l'accessibilité et le thème automatique.
 *
 * Chaque réglage s'applique dès le clic ; il n'y a pas de bouton
 * « Enregistrer ». L'aperçu à droite rejoue les mêmes jetons que le châssis.
 */
export default function AppearancePage({
  settings,
  mode,
  previewThemeId,
  updateSettings,
  chooseBackground,
  resetAppearance
}: {
  settings: Settings
  mode: ResolvedMode
  /** Thème effectif (celui de l'espace s'il en a un). */
  previewThemeId: ThemeId
  updateSettings: (patch: SettingsPatch) => Promise<void>
  chooseBackground: (value: HomeBackground) => Promise<void>
  resetAppearance: () => void
}) {
  const setOverlay = useBrowser((state) => state.setOverlay)
  const [hex, setHex] = useState(settings.customAccent.toUpperCase())
  const [colorNote, setColorNote] = useState<{ text: string; tone: 'info' | 'error' } | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const skyTheme = settings.themeId === SKY_THEME
  const isCustom = settings.themeId === 'custom'

  const applyCustom = (value: string): void => {
    const parsed = parseHex(value)
    if (!parsed) {
      setColorNote({ text: 'Couleur invalide : utilisez un code #RRGGBB.', tone: 'error' })
      return
    }
    const result = adjustAccent(parsed, mode)
    setHex(result.color.toUpperCase())
    void updateSettings({ customAccent: result.color, themeId: 'custom' })
    setColorNote(
      result.adjusted && result.reason
        ? { text: result.reason, tone: 'info' }
        : { text: `Couleur appliquée : ${result.color.toUpperCase()}.`, tone: 'info' }
    )
  }

  const chooseTheme = (id: ThemeId): void => {
    const patch: SettingsPatch = { themeId: id }
    // Le ciel n'appartient qu'au thème Braise : un autre thème de couleur
    // revient au dégradé pour ne pas laisser un fond inactif.
    if (id !== SKY_THEME && settings.homeBackground === 'sky') patch.homeBackground = 'gradient'
    setColorNote(null)
    void updateSettings(patch)
  }

  const colorOptions: ChoiceOption<ThemeId>[] = [
    ...ACCENT_THEMES.map((preset) => ({
      value: preset.id,
      label: preset.label,
      ariaLabel: preset.label,
      visual: (
        <span
          className="swatch-disc"
          style={
            {
              '--swatch': mode === 'dark' ? preset.dark : preset.light,
              '--swatch-ink': readableOn(mode === 'dark' ? preset.dark : preset.light)
            } as CSSProperties
          }
        />
      )
    })),
    {
      value: 'custom',
      label: 'Personnalisée',
      ariaLabel: 'Couleur personnalisée',
      visual: (
        <span
          className="swatch-disc"
          style={
            {
              '--swatch': settings.customAccent,
              '--swatch-ink': readableOn(settings.customAccent)
            } as CSSProperties
          }
        />
      )
    }
  ]

  const backgroundOptions: ChoiceOption<HomeBackground>[] = [
    { value: 'gradient', label: 'Dégradé du thème', hint: 'La couleur, en fondu', visual: <HomeThumb kind="gradient" /> },
    {
      value: 'sky',
      label: 'Ciel',
      hint: skyTheme ? 'Braises ou nuit étoilée' : 'Réservé au thème Braise',
      disabled: !skyTheme,
      visual: <HomeThumb kind="sky" />
    },
    { value: 'plain', label: 'Couleur unie', hint: 'Un seul fond, sans dégradé', visual: <HomeThumb kind="plain" /> },
    {
      value: 'image',
      label: 'Image locale',
      hint: 'L’image reste sur cet appareil',
      visual: <HomeThumb kind="image" />
    }
  ]

  return (
    <div className="appearance-page">
      <section className="setting-block appearance-preview-block" aria-labelledby="appearance-preview-title">
        <div className="setting-head">
          <h2 id="appearance-preview-title">Aperçu en direct</h2>
          <p>Chaque réglage s’applique tout de suite, sans bouton Enregistrer.</p>
        </div>
        <AppearancePreview settings={settings} mode={mode} themeId={previewThemeId} />
      </section>

      <div className="appearance-details">
        <section className="setting-block" aria-labelledby="appearance-mode">
          <div className="setting-head">
            <h2 id="appearance-mode">Mode</h2>
            <p>Clair, sombre, ou comme l’appareil.</p>
          </div>
          <RadioCards
            ariaLabel="Mode de l’interface"
            value={settings.theme}
            options={MODES.map((option) => ({
              ...option,
              visual: <ModeThumb mode={option.value} />
            }))}
            onChange={(value) => void updateSettings({ theme: value })}
          />
        </section>

        <section className="setting-block" aria-labelledby="appearance-color">
          <div className="setting-head">
            <h2 id="appearance-color">Couleur</h2>
            <p>Une teinte d’accent pour toute l’interface Vela. Le contenu des pages n’est jamais recoloré.</p>
          </div>
          <RadioCards
            ariaLabel="Thème de couleur"
            value={settings.themeId}
            options={colorOptions}
            variant="swatch"
            onChange={chooseTheme}
          />
          {settings.themeId === SKY_THEME && (
            <p className="appearance-note">
              Braise est le thème du ciel de l’accueil : il se choisit depuis « Fond de l’accueil ».
            </p>
          )}

          <div className="custom-color" data-active={isCustom}>
            <span
              className="custom-color-preview"
              style={
                {
                  '--swatch': settings.customAccent,
                  '--swatch-ink': readableOn(settings.customAccent)
                } as CSSProperties
              }
              aria-hidden="true"
            >
              {isCustom && <Icon name="check" size={12} />}
            </span>
            <div className="custom-color-copy">
              <span className="custom-color-name">Couleur personnalisée</span>
              <p className="app-help">Choisissez une teinte, ou saisissez son code hexadécimal.</p>
            </div>
            <div className="custom-color-fields">
              <input
                type="color"
                aria-label="Choisir une couleur personnalisée"
                value={settings.customAccent}
                onChange={(event) => applyCustom(event.target.value)}
              />
              <input
                type="text"
                className="custom-color-hex"
                aria-label="Code hexadécimal de la couleur"
                value={hex}
                spellCheck={false}
                autoComplete="off"
                onBlur={(event) => applyCustom(event.target.value)}
                onChange={(event) => setHex(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  applyCustom(event.currentTarget.value)
                }}
              />
            </div>
          </div>
          {colorNote && (
            <p className="custom-color-note" data-tone={colorNote.tone} role="status">
              {colorNote.text}
            </p>
          )}
        </section>

        <section className="setting-block" aria-labelledby="appearance-home">
          <div className="setting-head">
            <h2 id="appearance-home">Fond de l’accueil</h2>
            <p>Le fond derrière le mot d’accueil et la recherche.</p>
          </div>
          <RadioCards
            ariaLabel="Fond de l’accueil"
            value={settings.homeBackground}
            options={backgroundOptions}
            onChange={(value) => void chooseBackground(value)}
          />
          {!skyTheme && (
            <p className="appearance-note">
              Le ciel demande le thème Braise.{' '}
              <button
                type="button"
                className="link-btn"
                onClick={() => void updateSettings({ themeId: SKY_THEME, homeBackground: 'sky' })}
              >
                Choisir Braise
              </button>
            </p>
          )}
          {settings.homeBackground === 'sky' && skyTheme && (
            <div className="appearance-sub">
              <span className="appearance-sub-title">Ambiance du ciel</span>
              <RadioCards
                ariaLabel="Ambiance du ciel"
                value={settings.skyVariant}
                options={SKIES}
                onChange={(value) => void updateSettings({ skyVariant: value })}
              />
            </div>
          )}
          {settings.homeBackground === 'image' && (
            <div className="appearance-sub">
              {settings.homeImage ? (
                <div className="image-row">
                  <span className="image-frame" aria-hidden="true" />
                  <div className="image-copy">
                    <span className="image-name">Image de l’accueil</span>
                    <p className="app-help">
                      {settings.homeImage.split(/[\\/]/).pop()} · l’image reste sur cet appareil.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="action ghost"
                    onClick={() => void window.vela.appearance.pickImage().then((picked) => {
                      if (picked) void updateSettings({ homeImage: picked.path, homeBackground: 'image' })
                    })}
                  >
                    Changer
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="action wide"
                  onClick={() => void chooseBackground('image')}
                >
                  <Icon name="image" size={13} />
                  Choisir une image
                </button>
              )}
              <div className="appearance-slider">
                <label className="appearance-slider-head" htmlFor="home-blur">
                  <span>Flou de l’image</span>
                  <span className="appearance-slider-value">{settings.homeBlur} px</span>
                </label>
                <input
                  id="home-blur"
                  type="range"
                  min={0}
                  max={40}
                  step={1}
                  value={settings.homeBlur}
                  onChange={(event) => void updateSettings({ homeBlur: Number(event.target.value) })}
                />
              </div>
            </div>
          )}
        </section>

        <section className="setting-block" aria-labelledby="appearance-interface">
          <div className="setting-head">
            <h2 id="appearance-interface">Interface</h2>
            <p>Densité, verre et taille du texte de l’interface Vela, jamais ceux des pages.</p>
          </div>
          <div className="appearance-field">
            <span className="appearance-field-label" id="density-label">
              Densité
            </span>
            <RadioCards
              ariaLabel="Densité de l’interface"
              value={settings.density}
              options={DENSITIES}
              variant="segment"
              onChange={(value) => void updateSettings({ density: value })}
            />
          </div>
          <div className="appearance-field">
            <span className="appearance-field-label" id="text-size-label">
              Taille du texte
            </span>
            <RadioCards
              ariaLabel="Taille du texte de l’interface"
              value={settings.textSize}
              options={TEXT_SIZES}
              variant="segment"
              onChange={(value) => void updateSettings({ textSize: value })}
            />
          </div>
          <div className="appearance-field">
            <span className="appearance-field-label" id="side-label">
              Barre latérale
            </span>
            <RadioCards
              ariaLabel="Position de la barre latérale"
              value={settings.sidebarSide}
              options={SIDES}
              variant="segment"
              onChange={(value) => void updateSettings({ sidebarSide: value })}
            />
          </div>
          <div className="appearance-slider">
            <label className="appearance-slider-head" htmlFor="glass-blur">
              <span>Intensité du verre</span>
              <span className="appearance-slider-value">{settings.glassBlur} px</span>
            </label>
            <input
              id="glass-blur"
              type="range"
              min={0}
              max={MAX_GLASS_BLUR}
              step={1}
              value={settings.glassBlur}
              aria-valuetext={`${settings.glassBlur} pixels de flou`}
              onChange={(event) => void updateSettings({ glassBlur: Number(event.target.value) })}
            />
            <div className="appearance-scale" aria-hidden="true">
              <span>Net</span>
              <span>Laiteux</span>
            </div>
          </div>
        </section>

        <section className="setting-block" aria-labelledby="appearance-a11y">
          <div className="setting-head">
            <h2 id="appearance-a11y">Accessibilité</h2>
            <p>Deux réglages qui s’appliquent à toute l’interface.</p>
          </div>
          <ToggleRow
            label="Contraste élevé"
            hint="Bordures renforcées, transparences supprimées."
            checked={settings.highContrast}
            onChange={() => void updateSettings({ highContrast: !settings.highContrast })}
          />
          <div className="appearance-field">
            <span className="appearance-field-label" id="motion-label">
              Réduire les animations
            </span>
            <RadioCards
              ariaLabel="Réduire les animations"
              value={settings.reduceMotion}
              options={MOTION}
              variant="segment"
              onChange={(value) => void updateSettings({ reduceMotion: value })}
            />
            <p className="app-help">Fige aussi les ciels animés de l’accueil.</p>
          </div>
        </section>

        <section className="setting-block" aria-labelledby="appearance-auto">
          <div className="setting-head">
            <h2 id="appearance-auto">Automatique</h2>
            <p>Ce qui change sans que vous y touchiez.</p>
          </div>
          <ToggleRow
            label="Thème selon l’heure"
            hint="Clair le jour, sombre le soir, avec la même couleur."
            checked={settings.hourTheme}
            onChange={() => void updateSettings({ hourTheme: !settings.hourTheme })}
          />
          {settings.hourTheme && (
            <div className="hour-range">
              <label>
                <span>Clair à partir de</span>
                <select
                  value={settings.hourStart}
                  onChange={(event) => void updateSettings({ hourStart: Number(event.target.value) })}
                >
                  {Array.from({ length: 24 }, (_, hour) => (
                    <option key={hour} value={hour}>
                      {hour} h
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Sombre à partir de</span>
                <select
                  value={settings.hourEnd}
                  onChange={(event) => void updateSettings({ hourEnd: Number(event.target.value) })}
                >
                  {Array.from({ length: 24 }, (_, hour) => (
                    <option key={hour} value={hour}>
                      {hour} h
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <ToggleRow
            label="Un thème par espace"
            hint="Chaque espace garde son thème ; sinon le thème global s’applique."
            checked={settings.perSpaceThemes}
            onChange={() => void updateSettings({ perSpaceThemes: !settings.perSpaceThemes })}
          >
            <button type="button" className="link-btn" onClick={() => setOverlay('space')}>
              Modifier un espace
            </button>
          </ToggleRow>
        </section>

        <section className="setting-block appearance-reset-block" aria-labelledby="appearance-reset">
          <div className="setting-head">
            <h2 id="appearance-reset">Réinitialiser</h2>
            <p>Couleur, fond, image et options d’interface reviennent aux valeurs d’origine.</p>
          </div>
          {confirmReset ? (
            <div className="reset-confirm" role="group" aria-label="Confirmer la réinitialisation">
              <p>Tout effacer sur cet appareil ?</p>
              <div className="reset-actions">
                <button type="button" className="action ghost" onClick={() => setConfirmReset(false)}>
                  Annuler
                </button>
                <button
                  type="button"
                  className="action primary"
                  onClick={() => {
                    resetAppearance()
                    setColorNote(null)
                    setHex('#5B5BD6')
                    setConfirmReset(false)
                  }}
                >
                  Réinitialiser
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="action" onClick={() => setConfirmReset(true)}>
              <Icon name="refresh" size={13} />
              Réinitialiser l’apparence
            </button>
          )}
        </section>
      </div>
    </div>
  )
}
