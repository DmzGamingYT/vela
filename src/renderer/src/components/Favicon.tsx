import { useState } from 'react'
import { initials, tintFor } from '../lib/format'

/**
 * Icône d'un site sans requête supplémentaire : on réutilise le favicon déjà
 * chargé par la page (`tab.favicon`). Sinon, monogramme coloré — jamais de
 * contact avec un tiers ni d'erreur réseau dans la console.
 */
export default function Favicon({
  src,
  label,
  size = 16
}: {
  src?: string | null
  label?: string
  size?: number
}) {
  const [broken, setBroken] = useState(false)
  const tint = tintFor(label || 'vela')

  return (
    <span className="favicon" style={{ color: tint, background: `${tint}1c` }} aria-hidden="true">
      {src && !broken ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          referrerPolicy="no-referrer"
          draggable={false}
          onError={() => setBroken(true)}
        />
      ) : (
        <span>{initials(label || '·')}</span>
      )}
    </span>
  )
}
