import type { CSSProperties } from 'react'
import { avatarIcon, avatarImage } from '@shared/space'
import { readableOn } from '@shared/theme'

/**
 * Avatar d'espace : photo recadrée, marque dessinée ou initiale. Rien n'est
 * chargé depuis le réseau — l'image est une data URL validée à l'entrée.
 */
export default function SpaceAvatar({
  space,
  size = 28,
  className
}: {
  space: { name: string; color: string; avatar?: string | null }
  size?: number
  className?: string
}) {
  const image = avatarImage(space.avatar)
  const icon = avatarIcon(space.avatar)
  const initial = space.name.trim().slice(0, 1).toUpperCase() || '·'

  return (
    <span
      className={className ? `space-avatar ${className}` : 'space-avatar'}
      style={
        {
          '--space': space.color,
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.32),
          fontSize: Math.round(size * 0.42),
          // Sur un ambre ou un jaune, l'initiale blanche serait illisible.
          color: readableOn(space.color)
        } as CSSProperties
      }
      aria-hidden="true"
    >
      {image ? (
        <img src={image} alt="" draggable={false} />
      ) : icon ? (
        <svg viewBox="0 0 24 24" width={Math.round(size * 0.56)} height={Math.round(size * 0.56)}>
          <path
            d={icon.path}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <span>{initial}</span>
      )}
    </span>
  )
}
