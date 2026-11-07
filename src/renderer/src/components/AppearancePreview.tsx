import { useState, type CSSProperties } from 'react'
import { appearanceTokens, type ResolvedMode } from '@shared/theme'
import type { Settings } from '@shared/types'
import { greeting, weekdayLabel } from '../lib/format'
import AmbienceScene from './AmbienceScene'

/**
 * Mini-fenêtre Vela de l'aperçu d'apparence.
 *
 * Elle reprend la silhouette réelle du navigateur — rail, barre latérale
 * Favoris/Onglets, reprise de session, recherche et carte Récemment — et
 * rejoue les mêmes jetons que le châssis. Les données sont des exemples
 * visibles ; l'ensemble est décoratif et `aria-hidden`.
 */
export default function AppearancePreview({
  settings,
  mode,
  themeId
}: {
  settings: Settings
  mode: ResolvedMode
  themeId: Settings['themeId']
}) {
  const tokens = appearanceTokens({
    themeId,
    customAccent: settings.customAccent,
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

  return (
    <div
      className="pv"
      style={tokens}
      data-preview-mode={mode}
      data-preview-density={settings.density}
      data-preview-home={settings.homeBackground}
      data-preview-sky={settings.skyVariant}
      data-preview-intensity={settings.homeIntensity}
      aria-hidden="true"
    >
      <div className="pv-window">
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
              Rechercher ou saisir une adresse
            </span>

            <span className="pv-recent">
              <span className="pv-recent-label">Récemment</span>
              <span className="pv-recent-card">
                <strong>Le navigateur qui reste à vous</strong>
                <span>vela.app · Aujourd’hui</span>
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
