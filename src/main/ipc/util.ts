import { readFile } from 'node:fs/promises'
import type { PaneRect } from '@shared/types'

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

export function asId(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Identifiant invalide.')
  return value
}

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif'
}

/** Lit une image locale pour l'aperçu d'accueil, sans dépasser 8 Mo. */
export async function readImageDataUrl(file: string): Promise<string | null> {
  const extension = file.split('.').pop()?.toLowerCase() ?? ''
  const mime = IMAGE_MIME[extension]
  if (!mime) return null
  try {
    const buffer = await readFile(file)
    if (buffer.byteLength > 8 * 1024 * 1024) return null
    return `data:${mime};base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}

export function isPane(value: unknown): value is PaneRect {
  const pane = value as PaneRect
  return Boolean(
    pane &&
    typeof pane.tabId === 'string' &&
    Number.isFinite(pane.x) &&
    Number.isFinite(pane.y) &&
    Number.isFinite(pane.width) &&
    Number.isFinite(pane.height)
  )
}
