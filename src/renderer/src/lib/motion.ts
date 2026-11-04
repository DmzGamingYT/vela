import type { PointerEvent as ReactPointerEvent } from 'react'

/**
 * Micro-interactions des réglages d'apparence.
 *
 * Les deux fonctions écrivent directement dans le DOM : la lueur magnétique
 * n'est qu'une position de dégradé (`--mx`, `--my`) et l'ondulation un élément
 * retiré à la fin de son animation. Aucun état React n'est créé au survol,
 * donc aucune surface ne se remonte pendant qu'on la traverse.
 */

/** Fait suivre la lueur de la carte ou du bouton au curseur. */
export function trackGlow(event: ReactPointerEvent<HTMLElement>): void {
  const node = event.currentTarget
  const rect = node.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  node.style.setProperty('--mx', `${(((event.clientX - rect.left) / rect.width) * 100).toFixed(2)}%`)
  node.style.setProperty('--my', `${(((event.clientY - rect.top) / rect.height) * 100).toFixed(2)}%`)
}

/** Onde de propagation discrète au clic, désactivée si le mouvement est réduit. */
export function spawnRipple(event: ReactPointerEvent<HTMLElement>): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const node = event.currentTarget
  const rect = node.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const size = Math.max(rect.width, rect.height) * 0.7
  const ripple = document.createElement('span')
  ripple.className = 'motion-ripple'
  ripple.style.width = `${size}px`
  ripple.style.height = `${size}px`
  ripple.style.left = `${event.clientX - rect.left - size / 2}px`
  ripple.style.top = `${event.clientY - rect.top - size / 2}px`
  node.appendChild(ripple)
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true })
}
