import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

/** Les quatre sources d’avatar, réunies derrière un seul sélecteur. */
export type AvatarSource = 'monogram' | 'icons' | 'gallery' | 'photo'

/** La valeur stockée dit d’elle-même d’où vient l’avatar. */
export function sourceOf(value: string | null): AvatarSource {
  if (!value || value === 'monogram') return 'monogram'
  if (value.startsWith('icon:')) return 'icons'
  if (value.startsWith('gallery:')) return 'gallery'
  return 'photo'
}

/** Flèches dans une grille de radios : le focus bouge, pas la sélection. */
export function rovingKeyDown(event: ReactKeyboardEvent<HTMLElement>): void {
  const keys = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End']
  if (!keys.includes(event.key)) return
  const radios = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not([disabled])')
  )
  if (radios.length === 0) return
  const current = radios.indexOf(event.target as HTMLElement)
  if (current < 0) return
  event.preventDefault()
  const columns = Math.max(1, Number(event.currentTarget.dataset.columns || 0) || 1)
  let next = current
  if (event.key === 'ArrowRight') next = Math.min(radios.length - 1, current + 1)
  if (event.key === 'ArrowLeft') next = Math.max(0, current - 1)
  if (event.key === 'ArrowDown') next = Math.min(radios.length - 1, current + columns)
  if (event.key === 'ArrowUp') next = Math.max(0, current - columns)
  if (event.key === 'Home') next = 0
  if (event.key === 'End') next = radios.length - 1
  radios[next]?.focus()
}

export function countLabel(count: number): string {
  return `${count} ${count === 1 ? 'site' : 'sites'}`
}

/** Intitulé de section : un libellé, une valeur. Plus de numérotation — le
    dialogue n'est pas un assistant et les numéros 4 et 5 tombaient sous la
    ligne de flottaison. */
export function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="space-section-head">
      <h2 className="space-section-title">{title}</h2>
      {hint ? <span className="space-section-hint">{hint}</span> : null}
    </div>
  )
}
