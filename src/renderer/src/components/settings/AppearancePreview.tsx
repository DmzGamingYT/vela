import { useState, type CSSProperties } from 'react'
import {
  ambiencePreset,
  appearanceTokens,
  presetById,
  type ResolvedMode
} from '@shared/theme'
import type { Settings, Space } from '@shared/types'
import { greeting, weekdayLabel } from '../../lib/format'
import AmbienceScene from '../AmbienceScene'
import Favicon from '../Favicon'
import { Icon } from '../Icon'
import SpaceAvatar from '../space/SpaceAvatar'

/** Nom d’hôte lisible, sans www., pour les tuiles de l’aperçu. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'Site'
  }
}

/**
 * Mini-fenêtre Vela de l’aperçu d’apparence.
 *
 * Elle reprend la silhouette réelle du navigateur — rail, barre latérale,
 * reprise de session, recherche et carte Récemment — et rejoue les mêmes
 * jetons que le châssis. Le cadre est la coquille commune aux deux aperçus ;
 * l’intérieur reste décoratif, seuls les onglets et le mode sont actifs.
 */
export default function AppearancePreview({
  settings,
  mode,
  themeId,
  accent,
  activeSpace,
  onMode
}: {
  settings: Settings
  mode: ResolvedMode
  themeId: Settings['themeId']
  /**
   * Accent effectif du contexte : celui de l'espace actif s'il en porte un.
   * Absent, l'aperçu suit l'accent global des réglages.
   */
  accent?: { customAccent: string; accentOverride: boolean }
  activeSpace?: Space | null
  onMode: (value: ResolvedMode) => void
}) {
  const tokens = appearanceTokens({
    themeId,
    customAccent: accent?.customAccent ?? settings.customAccent,
    accentOverride: accent?.accentOverride ?? settings.accentOverride,
    mode,
    glass: settings.glass,
    glassBlur: settings.glassBlur,
    highContrast: settings.highContrast,
    ambience: settings.ambience,
    ambienceScope: settings.ambienceScope,
    ambienceIntensity: settings.ambienceIntensity
  }) as CSSProperties
  const blur = Math.round(settings.glassBlur * 0.55)
  // L'horloge est lue une fois, au montage : lire l'heure pendant un rendu est
  // impur, et l'aperçu n'a pas à changer de jour en direct.
  const [today] = useState(() => Date.now())
  const [surface, setSurface] = useState<'home' | 'profile'>('home')

  const themeLabel = presetById(themeId)?.label ?? 'Personnalisé'
  const ambienceLabel = ambiencePreset(settings.ambience)?.label ?? 'Aucune'
  const modeLabel = mode === 'dark' ? 'Sombre' : 'Clair'
  const profileName = activeSpace?.name ?? 'Profil 1'
  const profileColor = activeSpace?.color ?? settings.customAccent
  const profileAvatar = activeSpace?.avatar ?? null
  const shortcuts = activeSpace?.shortcuts ?? []
  const siteFact =
    shortcuts.length === 0
      ? 'Aucun site épinglé'
      : shortcuts.length === 1
        ? '1 site épinglé'
        : `${shortcuts.length} sites épinglés`

  return (
    <div
      className="pv"
      style={tokens}
      data-preview-mode={mode}
      data-preview-density={settings.density}
      data-preview-home={settings.homeBackground}
      data-preview-sky={settings.skyVariant}
      data-preview-intensity={settings.homeIntensity}
    >
      <div className="preview-card preview-card--wide">
        <header className="preview-head">
          <span className="preview-eyebrow">Aperçu</span>
          <span className="preview-context">Apparence</span>
          <div className="preview-head-tools">
            <div className="preview-tabs" role="group" aria-label="Surface de l’aperçu">
              <button
                type="button"
                aria-pressed={surface === 'home'}
                onClick={() => setSurface('home')}
              >
                Accueil
              </button>
              <button
                type="button"
                aria-pressed={surface === 'profile'}
                onClick={() => setSurface('profile')}
              >
                Profil
              </button>
            </div>
            <div className="preview-modes" role="radiogroup" aria-label="Aperçu clair ou sombre">
              {(['light', 'dark'] as ResolvedMode[]).map((entry) => (
                <button
                  key={entry}
                  type="button"
                  role="radio"
                  aria-checked={mode === entry}
                  aria-label={entry === 'light' ? 'Aperçu clair' : 'Aperçu sombre'}
                  title={entry === 'light' ? 'Clair' : 'Sombre'}
                  className="preview-mode"
                  onClick={() => onMode(entry)}
                >
                  <Icon name={entry === 'light' ? 'sun' : 'moon'} size={11} />
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="pv-body">
          <div className="pv-window" aria-hidden="true">
            <span className="pv-ambience-wrap">
              <AmbienceScene ambience={settings.ambience} className="pv-ambience" />
            </span>

            <div className="pv-rail">
              <span className="pv-rail-dot" />
              <span className="pv-rail-dot is-active" />
              <span className="pv-rail-dot" />
            </div>

            <div
              className="pv-side"
              style={{ backdropFilter: `blur(${blur}px)`, WebkitBackdropFilter: `blur(${blur}px)` }}
            >
              <span className="pv-brand">Vela.</span>
              <span className="pv-side-label">Favoris</span>
              <span className="pv-fav">
                <i /> Accueil
              </span>
              <span className="pv-side-label pv-side-label--tabs">Onglets</span>
              <span className="pv-tab is-active">
                <i /> Accueil
              </span>
              <span className="pv-tab">
                <i /> Notes
              </span>
            </div>

            {surface === 'home' ? (
              <div className="pv-home">
                <div className="pv-home-bg" />
                <div className="pv-home-sky" />
                <span className="pv-demo">Exemple</span>

                <div className="pv-home-copy">
                  <span className="pv-session">
                    <span className="pv-session-copy">
                      <strong>Reprendre la session</strong>
                      <span>3 onglets · Accueil</span>
                    </span>
                    <span className="pv-session-mark">↗</span>
                  </span>

                  <span className="pv-kicker">{weekdayLabel(today)}</span>
                  <strong className="pv-word">{greeting()}.</strong>

                  <span className="pv-search">
                    <i />
                    Adresse ou recherche
                  </span>

                  <span className="pv-recent">
                    <span className="pv-recent-label">Récemment</span>
                    <span className="pv-recent-card">
                      <strong>Le navigateur qui reste à vous</strong>
                      <span>vela.app · Aujourd’hui</span>
                    </span>
                  </span>
                </div>
                <span className="pv-fade" />
              </div>
            ) : (
              <div className="pv-profile">
                <div className="pv-profile-hero">
                  <SpaceAvatar
                    space={{ name: profileName, color: profileColor, avatar: profileAvatar }}
                    size={32}
                  />
                  <div className="pv-profile-copy">
                    <strong>{profileName}</strong>
                    <span>{siteFact} · sessions isolées</span>
                  </div>
                </div>
                <div className="pv-page-label">
                  Sites épinglés
                  <span className="pv-pill">{shortcuts.length ? 'Épinglés' : 'Aucun'}</span>
                </div>
                <div className="pv-site-tiles">
                  {shortcuts.slice(0, 3).map((shortcut) => (
                    <span className="pv-site-tile" key={shortcut.id}>
                      <Favicon
                        url={shortcut.url}
                        label={shortcut.title}
                        size={14}
                        spaceId={activeSpace?.id}
                        cacheOnly
                      />
                      <span className="pv-site-copy">
                        <strong>{shortcut.title}</strong>
                        <span>{hostOf(shortcut.url)}</span>
                      </span>
                    </span>
                  ))}
                  <span
                    className={
                      shortcuts.length
                        ? 'pv-site-tile pv-site-add'
                        : 'pv-site-tile pv-site-add pv-site-add-wide'
                    }
                  >
                    <Icon name="plus" size={10} />
                    {shortcuts.length ? null : <span>Un site suffit pour commencer</span>}
                  </span>
                </div>
                <div className="pv-lines">
                  <i />
                  <i />
                  <i />
                </div>
                <span className="pv-fade" />
              </div>
            )}
          </div>

          <aside className="preview-legend">
            <span className="preview-legend-kicker">Thème appliqué</span>
            <strong className="preview-legend-name">
              {themeLabel} · {ambienceLabel}
            </strong>
            <p>
              Ce cadre reprend la teinte et l’ambiance choisies ; le papier du reste de la fenêtre
              reste neutre.
            </p>
            <span className="preview-legend-foot">Sessions isolées · aucun compte</span>
          </aside>
        </div>

        <footer className="preview-foot">
          <ul className="preview-facts">
            <li className="preview-fact">
              <i aria-hidden="true" />
              Sessions isolées
            </li>
            <li className="preview-fact">
              <i aria-hidden="true" />
              {siteFact}
            </li>
            <li className="preview-fact">
              <i className="is-tint" aria-hidden="true" />
              {themeLabel} <span>· {modeLabel}</span>
            </li>
          </ul>
          <p className="preview-note">
            Seul cet aperçu prend la teinte et l’ambiance ; le reste de la fenêtre garde le papier
            neutre.
          </p>
        </footer>
      </div>
    </div>
  )
}
