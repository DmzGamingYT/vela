import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

interface SketchOptions {
  hasDraft: boolean
  insertMarkdown(before: string): void
  toast(message: string): void
}

/** Toile du croquis : initialisation, tracé au pointeur et insertion PNG. */
export function useSketch({ hasDraft, insertMarkdown, toast }: SketchOptions) {
  const [sketchOpen, setSketchOpen] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef<{ active: boolean; x: number; y: number } | null>(null)

  useEffect(() => {
    if (!sketchOpen) return
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.fillStyle = '#fffdf9'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.strokeStyle = '#221f2e'
    context.lineWidth = 2.6
    context.lineCap = 'round'
    context.lineJoin = 'round'
  }, [sketchOpen])

  const startDraw = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height
    drawing.current = { active: true, x, y }
    canvas.setPointerCapture(event.pointerId)
  }

  const moveDraw = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    const state = drawing.current
    if (!canvas || !context || !state?.active) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height
    context.beginPath()
    context.moveTo(state.x, state.y)
    context.lineTo(x, y)
    context.stroke()
    drawing.current = { active: true, x, y }
  }

  const endDraw = (): void => {
    drawing.current = null
  }

  const insertSketch = (): void => {
    const canvas = canvasRef.current
    if (!canvas || !hasDraft) return
    const dataUrl = canvas.toDataURL('image/png')
    insertMarkdown(`\n\n![Croquis](${dataUrl})\n\n`)
    setSketchOpen(false)
    toast('Croquis inséré dans la note.')
  }

  return { sketchOpen, setSketchOpen, canvasRef, startDraw, moveDraw, endDraw, insertSketch }
}
