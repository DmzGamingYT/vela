import { useId } from 'react'

const WIDTH = 132
const HEIGHT = 40
const PAD = 4

function points(values: readonly number[]): { x: number; y: number }[] {
  const max = Math.max(...values, 1)
  const step = values.length > 1 ? WIDTH / (values.length - 1) : WIDTH
  return values.map((value, index) => ({
    x: values.length > 1 ? index * step : WIDTH / 2,
    y: HEIGHT - PAD - (value / max) * (HEIGHT - PAD * 2)
  }))
}

/** Courbe lissée : les segments passent par les points, sans à-coups. */
function curve(list: { x: number; y: number }[]): string {
  if (list.length === 0) return ''
  let path = `M ${list[0].x.toFixed(2)} ${list[0].y.toFixed(2)}`
  for (let index = 0; index < list.length - 1; index += 1) {
    const before = list[index - 1] ?? list[index]
    const from = list[index]
    const to = list[index + 1]
    const after = list[index + 2] ?? to
    const c1x = from.x + (to.x - before.x) / 6
    const c1y = from.y + (to.y - before.y) / 6
    const c2x = to.x - (after.x - from.x) / 6
    const c2y = to.y - (after.y - from.y) / 6
    path += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${to.x.toFixed(2)} ${to.y.toFixed(2)}`
  }
  return path
}

/**
 * Courbe d'activité d'un profil : une ligne lissée, une aire très légère
 * dessous et un point sur le dernier jour. Décorative pour les lecteurs
 * d'écran — le total et les jours sont écrits à côté, en toutes lettres.
 */
export default function ActivityCurve({
  values,
  className
}: {
  values: readonly number[]
  className?: string
}) {
  const id = useId().replace(/:/g, '')
  if (values.length === 0) return null
  const list = points(values)
  const line = curve(list)
  const area = `${line} L ${WIDTH} ${HEIGHT} L 0 ${HEIGHT} Z`
  const last = list[list.length - 1]
  return (
    <svg
      className={className ? `activity-curve ${className}` : 'activity-curve'}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`ac-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="activity-stop-a" />
          <stop offset="1" className="activity-stop-b" />
        </linearGradient>
      </defs>
      <path className="activity-area" d={area} fill={`url(#ac-${id})`} />
      <path className="activity-line" d={line} />
      <circle className="activity-dot" cx={last.x} cy={last.y} r={2.1} />
    </svg>
  )
}
