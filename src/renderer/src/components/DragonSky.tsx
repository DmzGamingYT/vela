import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import type { SkyVariant } from '@shared/types'

/**
 * Ciel de braise : la couche d'animation du thème Braise, dans sa variante
 * braises ou dans celle de la nuit étoilée (« Nuit de Westeros »).
 *
 * Deux pièces seulement, toutes deux décoratives et `aria-hidden` : une
 * silhouette de dragon dessinée ici (aucune image distante, aucun visuel
 * repris d'une œuvre existante) qui traverse lentement l'accueil, et un
 * canvas de braises qui montent. Le canvas est mis en pause dès que la
 * fenêtre est masquée ; « Réduire les animations » fige la silhouette et
 * supprime les braises.
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

/** Étoiles fixes : un tirage déterministe, sinon elles changeraient à chaque rendu. */
function useStars(count: number) {
  return useMemo(() => {
    let seed = 20174
    const next = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }
    return Array.from({ length: count }, () => ({
      left: next() * 100,
      top: next() * 100,
      size: 1 + Math.round(next() * 12) / 10,
      delay: -next() * 7,
      duration: 4.5 + next() * 5,
      alpha: 0.3 + next() * 0.55
    }))
  }, [count])
}

export default function DragonSky({
  active,
  calm,
  variant = 'braise'
}: {
  active: boolean
  calm: boolean
  variant?: SkyVariant
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stars = useStars(variant === 'westeros' ? 54 : 0)

  useEffect(() => {
    if (!active || calm) return
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
  }, [active, calm])

  if (!active) return null

  return (
    <div
      className="dragon-sky"
      data-calm={calm ? 'true' : undefined}
      data-variant={variant}
      aria-hidden="true"
    >
      {variant === 'westeros' && (
        <div className="westeros-sky">
          {stars.map((star, index) => (
            <span
              key={index}
              className="westeros-star"
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
          <div className="westeros-moon">
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
      {!calm && <canvas ref={canvasRef} className="dragon-embers" />}
      <div className="dragon-drift">
        <div className="dragon-flight">
          <svg className="dragon-shape" viewBox="0 0 400 200" focusable="false">
            {/* Aile lointaine : plus petite, levée vers la droite, derrière le corps. */}
            <g className="dragon-wing dragon-wing-far">
              <path d="M262 110c14-30 38-54 70-68-6 20-10 40-10 60-20-2-42 1-60 8Z" />
            </g>
            {/* Queue longue et effilée, vers le bas-gauche. */}
            <path
              className="dragon-tail"
              d="M152 126c-32 6-66 16-94 32-14 8-26 18-34 28l-6 12 4-14c8-18 24-32 44-42 26-12 54-18 86-16Z"
            />
            {/* Corps, cou et tête d'un seul tenant : une proue fine vers la droite. */}
            <path
              className="dragon-body"
              d="M148 118c34-10 76-14 114-12 24 2 44 6 62 12l-18 6 10 3-8 5-14 2-16 14c-20 8-46 10-74 8-32-2-58-10-78-22l14-4-6-4Z"
            />
            {/* Pattes repliées sous le ventre. */}
            <path className="dragon-legs" d="M222 142l4 18 7-16ZM252 142l4 17 7-15Z" />
            {/* Aile proche : la grande voile qui bat. */}
            <g className="dragon-wing dragon-wing-near">
              <path d="M252 112C232 82 200 52 156 30c6 28 12 52 16 74 18-4 42-2 62 4Z" />
              <path className="dragon-wing-rib" d="M196 40c14 12 28 26 40 44M170 60c14 10 28 22 42 36" />
            </g>
          </svg>
        </div>
      </div>
    </div>
  )
}
