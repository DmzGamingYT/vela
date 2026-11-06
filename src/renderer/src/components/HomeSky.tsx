import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import type { SkyVariant } from '@shared/types'

/**
 * Ciel de l'accueil : des braises qui montent, ou une nuit étoilée avec sa
 * lune.
 *
 * Les deux pièces sont décoratives et `aria-hidden` : aucune image distante,
 * aucun motif repris d'une œuvre existante. Le canvas est mis en pause dès que
 * la fenêtre est masquée ; « Réduire les animations » supprime le mouvement.
 */

interface Ember {
  x: number
  y: number
  r: number
  vy: number
  drift: number
  phase: number
  alpha: number
  hue: number
}

const WARM = [26, 32, 38]

function seedEmbers(width: number, height: number): Ember[] {
  const count = Math.max(8, Math.min(24, Math.round(width / 70)))
  return Array.from({ length: count }, (_, index) => ({
    x: Math.random() * width,
    y: height - Math.random() * height * 0.4,
    r: 0.7 + Math.random() * 1.5,
    vy: 6 + Math.random() * 12,
    drift: -6 + Math.random() * 12,
    phase: (index / count) * Math.PI * 2 + Math.random(),
    alpha: 0.18 + Math.random() * 0.4,
    hue: WARM[index % WARM.length]
  }))
}

/** Tirage déterministe à partir d'un rang : même étoile à chaque rendu. */
function scatter(rank: number): number {
  const value = Math.sin(rank * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

/** Étoiles fixes : un tirage déterministe, sinon elles changeraient à chaque rendu. */
function useStars(count: number) {
  return useMemo(
    () =>
      Array.from({ length: count }, (_, index) => {
        const rank = index * 6
        return {
          left: scatter(rank + 1) * 100,
          top: scatter(rank + 2) * 100,
          size: 1 + Math.round(scatter(rank + 3) * 12) / 10,
          delay: -scatter(rank + 4) * 7,
          duration: 4.5 + scatter(rank + 5) * 5,
          alpha: 0.3 + scatter(rank + 6) * 0.55
        }
      }),
    [count]
  )
}

export default function HomeSky({
  active,
  calm,
  variant = 'braise'
}: {
  active: boolean
  calm: boolean
  variant?: SkyVariant
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stars = useStars(variant === 'nuit-etoilee' ? 54 : 0)

  useEffect(() => {
    if (!active || calm || variant !== 'braise') return
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    let width = 0
    let height = 0
    let embers: Ember[] = []
    let frame = 0
    let last = 0
    let visible = !document.hidden

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      width = Math.max(1, Math.round(rect.width))
      height = Math.max(1, Math.round(rect.height))
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      embers = seedEmbers(width, height)
    }

    const draw = (now: number): void => {
      frame = 0
      const delta = last ? Math.min(0.05, (now - last) / 1000) : 0.016
      last = now
      context.clearRect(0, 0, width, height)
      for (const ember of embers) {
        ember.y -= ember.vy * delta
        ember.phase += delta * 0.7
        ember.x += Math.sin(ember.phase) * ember.drift * delta
        if (ember.y < -4) {
          ember.y = height + 4
          ember.x = Math.random() * width
        }
        // Les braises s'éteignent en approchant du haut : le ciel se dégage.
        const fade = Math.min(1, ember.y / (height * 0.55))
        context.beginPath()
        context.arc(ember.x, ember.y, ember.r, 0, Math.PI * 2)
        context.fillStyle = `hsla(${ember.hue}, 92%, 62%, ${(ember.alpha * fade).toFixed(3)})`
        context.fill()
      }
      if (visible) frame = window.requestAnimationFrame(draw)
    }

    const start = (): void => {
      if (frame || !visible) return
      last = 0
      frame = window.requestAnimationFrame(draw)
    }
    const stop = (): void => {
      if (frame) window.cancelAnimationFrame(frame)
      frame = 0
    }
    const onVisibility = (): void => {
      visible = !document.hidden
      if (visible) {
        start()
      } else {
        stop()
        context.clearRect(0, 0, width, height)
      }
    }

    resize()
    start()
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [active, calm, variant])

  if (!active) return null

  return (
    <div className="home-sky" data-calm={calm ? 'true' : undefined} data-variant={variant} aria-hidden="true">
      {variant === 'nuit-etoilee' && (
        <div className="sky-night">
          {stars.map((star, index) => (
            <span
              key={index}
              className="sky-star"
              style={
                {
                  left: `${star.left.toFixed(2)}%`,
                  top: `${star.top.toFixed(2)}%`,
                  width: `${star.size}px`,
                  height: `${star.size}px`,
                  animationDelay: `${star.delay.toFixed(2)}s`,
                  animationDuration: `${star.duration.toFixed(2)}s`,
                  '--star-alpha': star.alpha.toFixed(2)
                } as CSSProperties
              }
            />
          ))}
          <div className="sky-moon">
            <svg viewBox="0 0 80 80" focusable="false">
              <circle cx="40" cy="40" r="29" />
              <circle cx="31" cy="32" r="6" />
              <circle cx="48" cy="46" r="4.4" />
              <circle cx="45" cy="26" r="3" />
              <circle cx="27" cy="47" r="3.4" />
            </svg>
          </div>
        </div>
      )}
      {variant === 'braise' && (
        <>
          <span className="home-sky-warmth" />
          {!calm && <canvas ref={canvasRef} className="home-sky-embers" />}
        </>
      )}
    </div>
  )
}
