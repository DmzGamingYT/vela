import { useEffect, useRef } from 'react'

/**
 * Fond du tunnel : constellation discrète qui relie les points proches et suit
 * le pointeur. Rien n'est cliquable, tout est peint sur un canvas unique.
 * L'animation s'arrête avec `prefers-reduced-motion`, onglet masqué ou carte
 * démontée, et la densité suit la surface pour rester légère.
 */

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  r: number
}

const LINK_DISTANCE = 128
const CURSOR_DISTANCE = 168

export default function TunnelBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    let width = 0
    let height = 0
    let particles: Particle[] = []
    let frame = 0
    let running = false
    const pointer = { x: -9999, y: -9999, active: false }

    const accent = (): string => {
      const value = getComputedStyle(document.documentElement).getPropertyValue('--accent-b').trim()
      return value || '#a8a3ff'
    }
    let tint = accent()

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.min(72, Math.max(24, Math.round((width * height) / 19000)))
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: 0.9 + Math.random() * 1.5
      }))
      tint = accent()
      draw(0)
    }

    const draw = (time: number): void => {
      context.clearRect(0, 0, width, height)
      context.strokeStyle = tint
      context.fillStyle = tint

      for (const particle of particles) {
        particle.x += particle.vx
        particle.y += particle.vy
        if (particle.x < 0 || particle.x > width) particle.vx *= -1
        if (particle.y < 0 || particle.y > height) particle.vy *= -1

        if (pointer.active) {
          const dx = pointer.x - particle.x
          const dy = pointer.y - particle.y
          const distance = Math.hypot(dx, dy)
          if (distance < CURSOR_DISTANCE && distance > 0.1) {
            const pull = ((CURSOR_DISTANCE - distance) / CURSOR_DISTANCE) * 0.006
            particle.vx += (dx / distance) * pull
            particle.vy += (dy / distance) * pull
            // Une dérive lente : la constellation respire au lieu de filer.
            particle.vx *= 0.995
            particle.vy *= 0.995
          }
        }
      }

      for (let i = 0; i < particles.length; i += 1) {
        for (let j = i + 1; j < particles.length; j += 1) {
          const a = particles[i]
          const b = particles[j]
          const distance = Math.hypot(a.x - b.x, a.y - b.y)
          if (distance > LINK_DISTANCE) continue
          context.globalAlpha = (1 - distance / LINK_DISTANCE) * 0.16
          context.lineWidth = 0.7
          context.beginPath()
          context.moveTo(a.x, a.y)
          context.lineTo(b.x, b.y)
          context.stroke()
        }
      }

      if (pointer.active) {
        for (const particle of particles) {
          const distance = Math.hypot(pointer.x - particle.x, pointer.y - particle.y)
          if (distance > CURSOR_DISTANCE) continue
          context.globalAlpha = (1 - distance / CURSOR_DISTANCE) * 0.3
          context.lineWidth = 0.8
          context.beginPath()
          context.moveTo(pointer.x, pointer.y)
          context.lineTo(particle.x, particle.y)
          context.stroke()
        }
        context.globalAlpha = 0.5
        context.beginPath()
        context.arc(pointer.x, pointer.y, 2.2, 0, Math.PI * 2)
        context.fill()
      }

      for (const particle of particles) {
        context.globalAlpha = 0.34
        context.beginPath()
        context.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2)
        context.fill()
      }
      context.globalAlpha = 1

      if (running && time > 0) frame = requestAnimationFrame(draw)
    }

    const start = (): void => {
      if (running) return
      if (reduced.matches) {
        draw(0)
        return
      }
      running = true
      frame = requestAnimationFrame(draw)
    }
    const stop = (): void => {
      running = false
      cancelAnimationFrame(frame)
    }

    const onPointer = (event: PointerEvent): void => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = event.clientX - rect.left
      pointer.y = event.clientY - rect.top
      pointer.active = pointer.x >= 0 && pointer.y >= 0 && pointer.x <= rect.width && pointer.y <= rect.height
    }
    const onLeave = (): void => {
      pointer.active = false
      pointer.x = -9999
      pointer.y = -9999
    }
    const onVisibility = (): void => {
      if (document.hidden) stop()
      else start()
    }
    const onMotion = (): void => {
      stop()
      start()
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    start()

    window.addEventListener('pointermove', onPointer, { passive: true })
    window.addEventListener('pointerleave', onLeave)
    document.addEventListener('visibilitychange', onVisibility)
    reduced.addEventListener('change', onMotion)

    return () => {
      stop()
      observer.disconnect()
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('visibilitychange', onVisibility)
      reduced.removeEventListener('change', onMotion)
    }
  }, [])

  return <canvas ref={canvasRef} className="tunnel-backdrop" aria-hidden="true" />
}
