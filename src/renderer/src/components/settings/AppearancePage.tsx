import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  MAX_GLASS_BLUR,
  SKY_THEME,
  type HomeBackground,
  type HomeIntensity,
  type ResolvedMode,
  type SkyVariant,
  type ThemeId
} from '@shared/theme'
import type { SettingsPatch } from '@shared/api'
import type { Settings } from '@shared/types'
import { Icon } from '../Icon'
import AccentColorSection from './AccentColorSection'
import AmbienceSection from './AmbienceSection'
import AppearancePreview from './AppearancePreview'
import RadioCards, { type ChoiceOption } from '../RadioCards'
import { useBrowser } from '../../store/browser'
import { resolveTab } from './settingsSearch'

/* Les trois cartes portent une ligne d'explication : sans elle, « Système »
   était la seule à en avoir une et les trois libellés tombaient à des hauteurs
   différentes. `ariaLabel` garde le nom court attendu au clavier et aux tests. */
const MODES: ChoiceOption<Settings['theme']>[] = [
  { value: 'light', label: 'Clair', hint: 'Toujours clair', ariaLabel: 'Clair' },
  { value: 'dark', label: 'Sombre', hint: 'Toujours sombre', ariaLabel: 'Sombre' },
  { value: 'system', label: 'Système', hint: 'Suit votre système', ariaLabel: 'Système' }
]

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

const HOME_LEVELS: ChoiceOption<HomeIntensity>[] = [
  { value: 'discreet', label: 'Discret' },
  { value: 'normal', label: 'Normal' },
  { value: 'marked', label: 'Marqué' }
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

type Tab = 'mode' | 'home' | 'interface' | 'accessibility'

const TABS: { id: Tab; label: string }[] = [
  { id: 'mode', label: 'Mode & couleur' },
  { id: 'home', label: 'Accueil' },
  { id: 'interface', label: 'Interface' },
  { id: 'accessibility', label: 'Accessibilité' }
]

/** Miniature de l'interface pour les trois modes, pas un simple aplat. */
function ModeThumb({ mode }: { mode: Settings['theme'] }) {
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
  children,
  anchor
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: () => void
  children?: ReactNode
  anchor?: string
}) {
  return (
    <div className="setting-row app-toggle" data-settings-anchor={anchor}>
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
 * Trois cartes de mode dans un vrai groupe de boutons radio.
 *
 * Les entrées natives gardent la sémantique et le comportement du navigateur ;
 * les flèches, Home et End sont explicitement traités pour que le changement
 * soit aussi fiable dans les tests et les environnements sans comportement
 * radio natif complet.
 */
function ModeCards({
  value,
  onChange
}: {
  value: Settings['theme']
  onChange: (value: Settings['theme']) => void
}) {
  const inputs = useRef(new Map<Settings['theme'], HTMLInputElement | null>())
  const values = MODES.map((mode) => mode.value)

  const move = (current: Settings['theme'], delta: number): void => {
    const index = values.indexOf(current)
    const next = values[(index + delta + values.length) % values.length]
    if (!next) return
    inputs.current.get(next)?.focus()
    onChange(next)
  }

  return (
    <div className="mode-cards" role="radiogroup" aria-labelledby="appearance-mode">
      {MODES.map((mode) => {
        const active = value === mode.value
        return (
          <label className="mode-card" data-active={active} key={mode.value}>
            <input
              ref={(node) => {
                inputs.current.set(mode.value, node)
              }}
              className="mode-card-input"
              type="radio"
              name="appearance-mode"
              // Le libellé visible contient aussi la ligne d'explication :
              // sans ce nom court, le bouton radio s'annoncerait « Clair
              // Toujours clair » aux lecteurs d'écran et aux tests.
              aria-label={mode.ariaLabel ?? mode.label}
              value={mode.value}
              checked={active}
              onChange={() => onChange(mode.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                  event.preventDefault()
                  move(mode.value, 1)
                } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                  event.preventDefault()
                  move(mode.value, -1)
                } else if (event.key === 'Home') {
                  event.preventDefault()
                  inputs.current.get(values[0])?.focus()
                  onChange(values[0])
                } else if (event.key === 'End') {
                  event.preventDefault()
                  inputs.current.get(values[values.length - 1])?.focus()
                  onChange(values[values.length - 1])
                }
              }}
            />
            <span className="mode-card-check" aria-hidden="true">
              {active && <Icon name="check" size={13} />}
            </span>
            <ModeThumb mode={mode.value} />
            <span className="mode-card-label">{mode.label}</span>
            {mode.hint && <span className="mode-card-hint">{mode.hint}</span>}
          </label>
        )
      })}
    </div>
  )
}

/**
 * Page « Apparence » : mode, couleur, fond de l'accueil, interface,
 * accessibilité et automatique.
 *
 * Elle réunit les anciennes pages Tweaks et Thèmes. Les quatre onglets
 * reprennent la maquette validée ; l'aperçu reste au-dessus pour que chaque
 * changement se juge sans changer d'onglet.
 */
export default function AppearancePage({
  settings,
  mode,
  previewThemeId,
  updateSettings,
  chooseBackground,
  resetAppearance,
  initialTab
}: {
  settings: Settings
  mode: ResolvedMode
  /** Thème effectif (celui de l'espace s'il en a un). */
  previewThemeId: ThemeId
  updateSettings: (patch: SettingsPatch) => Promise<void>
  chooseBackground: (value: HomeBackground) => Promise<void>
  resetAppearance: () => void
  initialTab?: string
}) {
  const setOverlay = useBrowser((state) => state.setOverlay)
  const skyTheme = settings.themeId === SKY_THEME
  const [tab, setTab] = useState<Tab>(() => resolveTab(initialTab, TABS, 'mode'))
  const tabRefs = useRef(new Map<Tab, HTMLButtonElement | null>())

  const chooseTab = (next: Tab): void => {
    setTab(next)
    tabRefs.current.get(next)?.focus()
  }

  const tabKeys = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const steps: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 }
    let next: number | null = null
    if (event.key in steps) next = (index + steps[event.key] + TABS.length) % TABS.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = TABS.length - 1
    if (next === null) return
    event.preventDefault()
    chooseTab(TABS[next].id)
  }

  const backgroundOptions: ChoiceOption<HomeBackground>[] = [
    {
      value: 'gradient',
      label: 'Dégradé du thème',
      hint: 'La couleur, en fondu',
      visual: <HomeThumb kind="gradient" />
    },
    {
      value: 'sky',
      label: 'Ciel',
      hint: skyTheme ? 'Braises ou nuit étoilée' : 'Réservé au thème Braise',
      disabled: !skyTheme,
      visual: <HomeThumb kind="sky" />
    },
    {
      value: 'plain',
      label: 'Couleur unie',
      hint: 'Un seul fond, sans dégradé',
      visual: <HomeThumb kind="plain" />
    },
    {
      value: 'image',
      label: 'Image locale',
      hint: 'L’image reste sur cet appareil',
      visual: <HomeThumb kind="image" />
    }
  ]

  return (
    <div className="appearance-page">
      <section className="appearance-preview-block" aria-label="Aperçu">
        <AppearancePreview settings={settings} mode={mode} themeId={previewThemeId} />
        <p className="pv-caption">Aperçu</p>
      </section>

      <div className="appearance-tabs" role="tablist" aria-label="Sous-sections de l’apparence">
        {TABS.map((entry, index) => {
          const active = tab === entry.id
          return (
            <button
              key={entry.id}
              ref={(node) => {
                if (node) tabRefs.current.set(entry.id, node)
                else tabRefs.current.delete(entry.id)
              }}
              type="button"
              role="tab"
              id={`appearance-tab-${entry.id}`}
              aria-selected={active}
              aria-controls={`appearance-panel-${entry.id}`}
              tabIndex={active ? 0 : -1}
              className="appearance-tab"
              data-active={active}
              onClick={() => setTab(entry.id)}
              onKeyDown={(event) => tabKeys(event, index)}
            >
              {entry.label}
            </button>
          )
        })}
      </div>

      {tab === 'mode' && (
        <div
          className="appearance-panel"
          role="tabpanel"
          id="appearance-panel-mode"
          aria-labelledby="appearance-tab-mode"
          tabIndex={0}
        >
          <section className="appearance-section" aria-labelledby="appearance-mode">
            <div className="setting-head">
              <h2 id="appearance-mode">Mode</h2>
              <p>Clair, sombre, ou comme votre système.</p>
            </div>
            <ModeCards
              value={settings.theme}
              onChange={(value) => void updateSettings({ theme: value })}
            />
          </section>

          <AccentColorSection
            settings={settings}
            mode={mode}
            updateSettings={updateSettings}
            title="Accent"
            help="Une teinte, déclinée sur tout le châssis. Le contenu des sites n’est jamais recoloré."
            anchor="appearance-accent"
          />

          <section className="appearance-section" aria-labelledby="appearance-auto">
            <div className="setting-head">
              <h2 id="appearance-auto">Automatique</h2>
              <p>Ce qui change sans que vous y touchiez.</p>
            </div>
            <ToggleRow
              label="Thème selon l’heure"
              anchor="appearance-hour-theme"
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
                    onChange={(event) =>
                      void updateSettings({ hourStart: Number(event.target.value) })
                    }
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
                    onChange={(event) =>
                      void updateSettings({ hourEnd: Number(event.target.value) })
                    }
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
              anchor="appearance-per-space"
              hint="Chaque espace garde son thème ; sinon le thème global s’applique."
              checked={settings.perSpaceThemes}
              onChange={() => void updateSettings({ perSpaceThemes: !settings.perSpaceThemes })}
            >
              <button type="button" className="link-btn" onClick={() => setOverlay('space')}>
                Modifier un espace
              </button>
            </ToggleRow>
          </section>

          <section className="appearance-section" aria-labelledby="appearance-advanced">
            <div className="setting-head">
              <h2 id="appearance-advanced">Avancé</h2>
              <p>Le verre et la remise à zéro de l’apparence.</p>
            </div>
            <div className="appearance-slider">
              <label className="appearance-slider-head" htmlFor="glass-blur">
                <span>Verre dépoli</span>
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

            <div className="glass-demo">
              <span className="glass-demo-orb" aria-hidden="true" />
              <div className="glass-demo-stack">
                <span
                  className="glass-slab"
                  style={{ backdropFilter: `blur(${settings.glassBlur}px)` }}
                />
                <span
                  className="glass-slab is-raised"
                  style={{ backdropFilter: `blur(${settings.glassBlur}px)` }}
                />
                <span
                  className="glass-slab is-top"
                  style={{ backdropFilter: `blur(${settings.glassBlur}px)` }}
                />
              </div>
            </div>

            <button type="button" className="action wide tweak-reset" onClick={resetAppearance}>
              <Icon name="refresh" size={13} />
              Réinitialiser l’apparence
            </button>
          </section>
        </div>
      )}

      {tab === 'home' && (
        <div
          className="appearance-panel"
          role="tabpanel"
          id="appearance-panel-home"
          aria-labelledby="appearance-tab-home"
          tabIndex={0}
        >
          <section className="appearance-section" aria-labelledby="appearance-home">
            <div className="setting-head">
              <h2 id="appearance-home">Fond de l’accueil</h2>
              <p>Le fond derrière le mot d’accueil et la recherche.</p>
            </div>

            <div className="appearance-field" data-settings-anchor="home-intensity">
              <span className="appearance-field-label" id="home-intensity-label">
                Intensité
              </span>
              <RadioCards
                ariaLabel="Fond de l’accueil"
                value={settings.homeIntensity}
                options={HOME_LEVELS}
                variant="segment"
                onChange={(value) => void updateSettings({ homeIntensity: value })}
              />
            </div>

            <div className="appearance-field" data-settings-anchor="home-style">
              <span className="appearance-field-label" id="home-style-label">
                Style
              </span>
              <RadioCards
                ariaLabel="Style du fond de l’accueil"
                value={settings.homeBackground}
                options={backgroundOptions}
                onChange={(value) => void chooseBackground(value)}
              />
            </div>

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
                      onClick={() =>
                        void window.vela.appearance.pickImage().then((picked) => {
                          if (picked)
                            void updateSettings({ homeImage: picked.path, homeBackground: 'image' })
                        })
                      }
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
                    onChange={(event) =>
                      void updateSettings({ homeBlur: Number(event.target.value) })
                    }
                  />
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'interface' && (
        <div
          className="appearance-panel"
          role="tabpanel"
          id="appearance-panel-interface"
          aria-labelledby="appearance-tab-interface"
          tabIndex={0}
        >
          <section className="appearance-section" aria-labelledby="appearance-interface">
            <div className="setting-head">
              <h2 id="appearance-interface">Interface</h2>
              <p>Densité et taille du texte de l’interface Vela, jamais ceux des pages.</p>
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
          </section>

          <AmbienceSection settings={settings} mode={mode} updateSettings={updateSettings} />
        </div>
      )}

      {tab === 'accessibility' && (
        <div
          className="appearance-panel"
          role="tabpanel"
          id="appearance-panel-accessibility"
          aria-labelledby="appearance-tab-accessibility"
          tabIndex={0}
        >
          <section className="appearance-section" aria-labelledby="appearance-a11y">
            <div className="setting-head">
              <h2 id="appearance-a11y">Accessibilité</h2>
              <p>Deux réglages qui s’appliquent à toute l’interface.</p>
            </div>
            <ToggleRow
              label="Contraste élevé"
              anchor="appearance-contrast"
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
            <p className="appearance-note">
              Le zoom des sites se règle dans Navigation › Pages web ; l’accessibilité de Vela ne
              modifie pas le rendu des pages.
            </p>
          </section>
        </div>
      )}
    </div>
  )
}
