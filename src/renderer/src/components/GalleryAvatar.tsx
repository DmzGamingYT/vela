import { useId } from 'react'
import { galleryAvatar, type GalleryShape } from '@shared/avatarGallery'

/**
 * Avatar de la galerie : un SVG du dépôt, teinté par la définition choisie.
 * Aucune image distante, aucun texte alternatif inventé : le nom accessible
 * est celui de l'avatar, ou rien quand il accompagne déjà le nom de l'espace.
 */
export default function GalleryAvatar({
  id,
  initial,
  size = 24,
  label
}: {
  id: string
  initial?: string
  size?: number
  label?: string
}) {
  const entry = galleryAvatar(id)
  const raw = useId()
  const gradient = `gallery-${raw.replace(/[^a-zA-Z0-9]/g, '')}`
  if (!entry) return null

  const shape = (item: GalleryShape, index: number) => {
    const opacity = item.o ?? 1
    if (item.kind === 'circle') {
      return <circle key={index} cx={item.cx} cy={item.cy} r={item.r} fill={entry.ink} opacity={opacity} />
    }
    if (item.kind === 'rect') {
      return (
        <rect
          key={index}
          x={item.x}
          y={item.y}
          width={item.w}
          height={item.h}
          rx={item.rx ?? 0}
          fill={entry.ink}
          opacity={opacity}
        />
      )
    }
    return (
      <path
        key={index}
        d={item.d}
        fill={item.stroke ? 'none' : entry.ink}
        stroke={item.stroke ? entry.ink : undefined}
        strokeWidth={item.stroke ? 2.4 : undefined}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={opacity}
      />
    )
  }

  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className="gallery-avatar"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={entry.from} />
          <stop offset="1" stopColor={entry.to} />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill={`url(#${gradient})`} />
      {entry.shapes.map(shape)}
      {entry.initial && (
        <text
          x="24"
          y="25"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="21"
          fontWeight="600"
          fill={entry.ink}
          className="gallery-avatar-initial"
        >
          {initial || '·'}
        </text>
      )}
    </svg>
  )
}
