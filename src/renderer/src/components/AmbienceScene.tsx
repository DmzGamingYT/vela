import { useEffect, useRef, type CSSProperties } from 'react'
import type { AmbienceId } from '@shared/theme'

/** Vrai quand le mouvement doit être figé, par choix ou par préférence système. */
function motionReduced(): boolean {
  if (typeof document === 'undefined') return false
  if (document.documentElement.dataset.motion === 'reduce') return true
  // jsdom et certains hôtes n'implémentent pas matchMedia : sans cette garde,
  // monter l'ambiance jette et emporte l'écran qui la contient.
  if (typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Calques d'ambiance du châssis.
 *
 * Le composant ne peint rien lui-même : il pose `data-ambience` et quatre
 * calques que `22-ambiances.css` anime. Les teintes viennent des jetons
 * `--amb-1` / `--amb-2` posés sur `:root`, sauf pour les aperçus des réglages
 * qui passent leurs propres couleurs.
 *
 * Le suivi du curseur n'écrit que des variables CSS dans une frame : pas de
 * rendu React, pas de recalcul de mise en page, et les animations ne touchent
 * que `transform` et `opacity` (calques composés par le GPU). Le contenu des
 * pages vit dans des `WebContentsView` séparées : aucun de ces calques, aucun
 * de ces jetons ne l'atteint.
 */
export default function AmbienceScene({
  ambience,
  className = '',
  colors,
  style
}: {
  ambience: AmbienceId
  className?: string
  /** Teintes imposées, pour un aperçu ; sinon celles du thème actif. */
  colors?: [string, string]
  style?: CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node || ambience === 'none') return
    if (motionReduced()) return

    let frame = 0
    const onMove = (event: PointerEvent): void => {
      // Le réglage des réglages prime sur la préférence du système : la
      // parallaxe se tait dès que « Réduire les animations » est actif.
      if (motionReduced()) return
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const rect = node.getBoundingClientRect()
        if (!rect.width || !rect.height) return
        const nx = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
        const ny = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
        node.style.setProperty('--mx', `${(nx * 100).toFixed(2)}%`)
        node.style.setProperty('--my', `${(ny * 100).toFixed(2)}%`)
        node.style.setProperty('--parallax-x', `${((nx - 0.5) * 18).toFixed(2)}px`)
        node.style.setProperty('--parallax-y', `${((ny - 0.5) * 14).toFixed(2)}px`)
      })
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [ambience])

  if (ambience === 'none') return null

  return (
    <div
      ref={ref}
      className={`ambience-scene ${className}`.trim()}
      data-ambience={ambience}
      style={
        colors ? ({ '--amb-1': colors[0], '--amb-2': colors[1], ...style } as CSSProperties) : style
      }
      aria-hidden="true"
    >
      <span className="amb-layer amb-base" />
      <span className="amb-layer amb-clouds" />
      <span className="amb-layer amb-particles" />
      <span className="amb-layer amb-sheen" />
    </div>
  )
}
