import { useId } from 'react'

/**
 * La boussole de Vela.
 *
 * Une seule copie du dessin, deux jeux de teintes : les couleurs passent par
 * des classes (`boussole-*`) que `82-boussole.css` règle sur `data-mode`, si
 * bien que le changement de thème se fait sans rendu React et sans requête.
 *
 * Les tracés viennent du maître `build/boussole-light.svg` (mêmes coordonnées,
 * viewBox 180) : la marque de l'app et l'icône du Finder sont le même dessin.
 */
export function Boussole({ size = 18 }: { size?: number }) {
  // Deux exemplaires peuvent vivre ensemble (barre latérale et À propos) :
  // un identifiant par instance évite que le second réutilise les dégradés
  // du premier si les teintes divergent un jour.
  const id = useId().replace(/:/g, '')

  return (
    <svg
      className="boussole"
      width={size}
      height={size}
      viewBox="0 0 180 180"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop className="boussole-bg-a" offset="0" />
          <stop className="boussole-bg-b" offset="1" />
        </linearGradient>
        <linearGradient id={`${id}gloss`} x1="0" y1="0" x2="0" y2="1">
          <stop className="boussole-gloss-a" offset="0" />
          <stop className="boussole-gloss-b" offset="1" />
        </linearGradient>
        <linearGradient id={`${id}edge`} x1="0" y1="0" x2="1" y2="1">
          <stop className="boussole-edge-a" offset="0" />
          <stop className="boussole-edge-b" offset="0.5" />
          <stop className="boussole-edge-c" offset="1" />
        </linearGradient>
      </defs>

      <rect width="180" height="180" rx="40" fill={`url(#${id}bg)`} />
      <circle className="boussole-face" cx="90" cy="90" r="60" />
      <g className="boussole-ticks">
        <line x1="90" y1="38" x2="90" y2="46" />
        <line x1="90" y1="134" x2="90" y2="142" />
        <line x1="38" y1="90" x2="46" y2="90" />
        <line x1="134" y1="90" x2="142" y2="90" />
      </g>
      <g transform="rotate(35 90 90)">
        <polygon className="boussole-nord" points="90,48 103,90 77,90" />
        <polygon className="boussole-sud" points="90,132 103,90 77,90" />
      </g>
      <circle className="boussole-hub" cx="90" cy="90" r="6" />
      <rect x="4" y="4" width="172" height="92" rx="36" fill={`url(#${id}gloss)`} />
      <rect
        x="1"
        y="1"
        width="178"
        height="178"
        rx="39"
        fill="none"
        className="boussole-rim"
        stroke={`url(#${id}edge)`}
      />
    </svg>
  )
}
