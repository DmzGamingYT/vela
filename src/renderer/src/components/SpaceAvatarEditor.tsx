import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Icon } from './Icon'

/**
 * Recadrage d'une photo d'espace : cadrage carré, zoom, déplacement et teinte
 * aux couleurs de l'espace. L'image de sortie est réduite à 144 px et reste
 * une data URL : rien ne quitte l'appareil.
 */

const SIZE = 232
const OUTPUT = 144

function scaleFor(image: HTMLImageElement, zoom: number): { scale: number; width: number; height: number } {
  const scale = Math.max(SIZE / image.width, SIZE / image.height) * zoom
  return { scale, width: image.width * scale, height: image.height * scale }
}

function clampOffset(image: HTMLImageElement, zoom: number, offset: { x: number; y: number }): { x: number; y: number } {
  const { width, height } = scaleFor(image, zoom)
  return {
    x: Math.min(0, Math.max(SIZE - width, offset.x)),
    y: Math.min(0, Math.max(SIZE - height, offset.y))
  }
}

export default function SpaceAvatarEditor({
  src,
  color,
  onAccept,
  onCancel
}: {
  src: string
  color: string
  onAccept: (avatar: string) => void
  onCancel: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [tint, setTint] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const next = new Image()
    next.onload = () => {
      setImage(next)
      setZoom(1)
      setOffset({ x: 0, y: 0 })
      setError(false)
    }
    next.onerror = () => setError(true)
    next.src = src
  }, [src])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context || !image) return
    const { width, height } = scaleFor(image, zoom)
    const x = (SIZE - width) / 2 + offset.x
    const y = (SIZE - height) / 2 + offset.y
    context.clearRect(0, 0, SIZE, SIZE)
    context.fillStyle = color
    context.fillRect(0, 0, SIZE, SIZE)
    context.drawImage(image, x, y, width, height)
    if (tint) {
      context.globalCompositeOperation = 'soft-light'
      context.globalAlpha = 0.45
      context.fillStyle = color
      context.fillRect(0, 0, SIZE, SIZE)
      context.globalCompositeOperation = 'source-over'
      context.globalAlpha = 1
    }
  }, [image, zoom, offset, tint, color])

  const startDrag = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!image) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, y: event.clientY }
  }

  const moveDrag = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!drag.current || !image) return
    // Le canevas est affiché à une autre taille que son tampon : on ramène le
    // geste dans les coordonnées du dessin pour que le cadrage suive le doigt.
    const ratio = SIZE / event.currentTarget.getBoundingClientRect().width
    const delta = {
      x: (event.clientX - drag.current.x) * ratio,
      y: (event.clientY - drag.current.y) * ratio
    }
    drag.current = { x: event.clientX, y: event.clientY }
    setOffset((previous) => clampOffset(image, zoom, { x: previous.x + delta.x, y: previous.y + delta.y }))
  }

  const endDrag = (): void => {
    drag.current = null
  }

  const changeZoom = (value: number): void => {
    setZoom(value)
    if (image) setOffset((previous) => clampOffset(image, value, previous))
  }

  const accept = (): void => {
    if (!image) return
    const output = document.createElement('canvas')
    output.width = OUTPUT
    output.height = OUTPUT
    const context = output.getContext('2d')
    if (!context) return
    const ratio = OUTPUT / SIZE
    const { width, height } = scaleFor(image, zoom)
    const x = ((SIZE - width) / 2 + offset.x) * ratio
    const y = ((SIZE - height) / 2 + offset.y) * ratio
    context.fillStyle = color
    context.fillRect(0, 0, OUTPUT, OUTPUT)
    context.drawImage(image, x, y, width * ratio, height * ratio)
    if (tint) {
      context.globalCompositeOperation = 'soft-light'
      context.globalAlpha = 0.45
      context.fillStyle = color
      context.fillRect(0, 0, OUTPUT, OUTPUT)
      context.globalCompositeOperation = 'source-over'
      context.globalAlpha = 1
    }
    onAccept(`image:${output.toDataURL('image/jpeg', 0.86)}`)
  }

  return (
    <div className="avatar-editor">
      <div className="avatar-editor-head">
        <span>Recadrer la photo</span>
        <button type="button" className="icon-btn" onClick={onCancel} title="Fermer">
          <Icon name="close" size={15} />
        </button>
      </div>

      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        className="avatar-canvas"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
      {error ? (
        <p className="avatar-editor-hint">Cette image n’a pas pu être lue.</p>
      ) : (
        <p className="avatar-editor-hint">Glissez pour cadrer, zoomez au curseur. Le cadre devient l’avatar de l’espace.</p>
      )}

      <label className="avatar-zoom">
        <span>Zoom</span>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(event) => changeZoom(Number(event.target.value))}
          aria-label="Zoom de la photo"
        />
        <span className="avatar-zoom-value">{zoom.toFixed(1)}×</span>
      </label>

      <div className="avatar-tint">
        <button
          type="button"
          className="switch"
          role="switch"
          aria-checked={tint}
          data-on={tint ? 'true' : 'false'}
          onClick={() => setTint((value) => !value)}
        >
          <span />
        </button>
        <span>Teinter de la couleur de l’espace</span>
      </div>

      <div className="avatar-editor-actions">
        <button type="button" className="action" onClick={onCancel}>
          Annuler
        </button>
        <button type="button" className="action primary" onClick={accept} disabled={!image}>
          Utiliser la photo
        </button>
      </div>
    </div>
  )
}
