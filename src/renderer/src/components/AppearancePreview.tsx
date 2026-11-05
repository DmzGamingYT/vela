import type { CSSProperties } from 'react'
import { appearanceTokens, type ResolvedMode } from '@shared/theme'
import type { Settings } from '@shared/types'
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
            <i /> Travail
          </span>
          <span className="pv-nav">
            <i /> Lecture
          </span>
          <span className="pv-side-foot">
            <i /> Brief
          </span>
        </div>
        <div className="pv-home">
          <div className="pv-home-sky" />
          <div className="pv-home-copy">
            <span className="pv-kicker">Mardi 5 novembre</span>
            <strong className="pv-word">Bonsoir.</strong>
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
        {settings.density === 'compact' ? 'compacte' : settings.density === 'airy' ? 'aérée' : 'normale'}
      </p>
    </div>
  )
}
