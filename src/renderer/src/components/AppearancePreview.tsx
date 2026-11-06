import { useState, type CSSProperties } from 'react'
import { appearanceTokens, type ResolvedMode } from '@shared/theme'
import type { Settings } from '@shared/types'
import { greeting, weekdayLabel } from '../lib/format'
import AmbienceScene from './AmbienceScene'

/**
 * Mini-fenêtre Vela de l'aperçu d'apparence.
 *
 * Elle ne duplique pas l'accueil réel : elle en garde la silhouette (rail,
 * barre latérale, mot d'accueil, recherche, tuiles) et rejoue les mêmes jetons
 * que le châssis. Tout est décoratif et `aria-hidden` : le texte de la section
 * décrit le résultat, l'aperçu ne parle pas aux lecteurs d'écran.
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
    ambience: settings.ambience
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
          <span className="pv-nav is-active">
            <i /> Accueil
          </span>
          <span className="pv-nav">
            <i /> Atelier
          </span>
          <span className="pv-nav">
            <i /> Notes
          </span>
          <span className="pv-side-foot">
            <i /> Sessions
          </span>
        </div>
        <div className="pv-home">
          <div className="pv-home-sky" />
          <div className="pv-home-copy">
            {/* La date et le mot d’accueil viennent du même code que l’accueil
                réel : l’aperçu ne peut pas annoncer un autre jour. */}
            <span className="pv-kicker">{weekdayLabel(today)}</span>
            <strong className="pv-word">{greeting()}.</strong>
            <span className="pv-search">
              <i />
              Rechercher ou saisir une adresse
            </span>
            <div className="pv-tiles">
              <span className="pv-tile" style={{ backdropFilter: `blur(${blur}px)` }} />
              <span className="pv-tile" style={{ backdropFilter: `blur(${blur}px)` }} />
              <span className="pv-tile" style={{ backdropFilter: `blur(${blur}px)` }} />
            </div>
          </div>
        </div>
      </div>
      <p className="pv-caption">
        {settings.homeBackground === 'image' && settings.homeImage
          ? 'Image locale, sur cet appareil'
          : settings.homeBackground === 'sky'
            ? settings.skyVariant === 'nuit-etoilee'
              ? 'Ciel · nuit étoilée'
              : 'Ciel · braises'
            : settings.homeBackground === 'plain'
              ? 'Fond uni'
              : 'Dégradé du thème'}
        {' · '}
        {settings.density === 'compact'
          ? 'compacte'
          : settings.density === 'airy'
            ? 'aérée'
            : 'normale'}
      </p>
    </div>
  )
}
