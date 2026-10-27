import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { avatarFile, avatarGalleryId, avatarIcon, avatarImage } from '@shared/space'
import { readableOn } from '@shared/theme'
import GalleryAvatar from './GalleryAvatar'

/**
 * Avatar d'espace : photo (data URL ou fichier local), marque dessinée,
 * galerie ou initiale. Rien n'est chargé depuis le réseau.
 */

const files = new Map<string, Promise<string | null>>()

function fileImage(name: string): Promise<string | null> {
  const known = files.get(name)
  if (known) return known
  const task = window.vela.avatars.read(name).catch(() => null)
  files.set(name, task)
  return task
}

/** Après un changement de photo, la prochaine lecture repasse par le disque. */
export function clearAvatarFileMemo(): void {
  files.clear()
}

export default function SpaceAvatar({
  space,
  size = 28,
  className
}: {
  space: { name: string; color: string; avatar?: string | null }
  size?: number
  className?: string
}) {
  const name = avatarFile(space.avatar)
  const [stored, setStored] = useState<string | null>(null)

  useEffect(() => {
    if (!name) {
      setStored(null)
      return
    }
    let alive = true
    void fileImage(name).then((data) => {
      if (alive) setStored(data)
    })
    return () => {
      alive = false
    }
  }, [name])

  const image = avatarImage(space.avatar) ?? stored
  const gallery = avatarGalleryId(space.avatar)
  const icon = avatarIcon(space.avatar)
  const initial = space.name.trim().slice(0, 1).toUpperCase() || '·'
  const round = Math.round(size * 0.32)

  return (
    <span
      className={className ? `space-avatar ${className}` : 'space-avatar'}
      style={
        {
          '--space': space.color,
          width: size,
          height: size,
          borderRadius: round,
          fontSize: Math.round(size * 0.42),
          // Sur un ambre ou un jaune, l'initiale blanche serait illisible.
          color: readableOn(space.color)
        } as CSSProperties
      }
      aria-hidden="true"
    >
      {image ? (
        <img src={image} alt="" draggable={false} />
      ) : gallery ? (
        <GalleryAvatar id={gallery} initial={initial} size={size} />
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
