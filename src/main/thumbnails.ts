import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { WebContents } from 'electron'

/**
 * Vignettes de pages récentes : une capture réduite, écrite dans `thumbs/` du
 * dossier de données. Aucune requête réseau, aucune synchronisation, et rien
 * n'est capturé tant que le réglage est désactivé.
 */

const WIDTH = 320
const QUALITY = 62
const MAX_BYTES = 90 * 1024

function keyOf(url: string): string {
  return createHash('sha1').update(url).digest('hex').slice(0, 24)
}

export function thumbnailDir(dir: string): string {
  return join(dir, 'thumbs')
}

export class Thumbnails {
  constructor(
    private readonly dir: string,
    private readonly enabled: () => boolean
  ) {}

  private path(url: string): string {
    return join(thumbnailDir(this.dir), `${keyOf(url)}.jpg`)
  }

  /** Capture l'onglet au moment de sa fermeture. Échoue en silence. */
  async capture(contents: WebContents, url: string): Promise<boolean> {
    if (!this.enabled() || !/^https?:/i.test(url)) return false
    try {
      // Fermer un onglet ne doit jamais attendre la capture : au-delà de
      // 400 ms, on laisse tomber la vignette et la page se ferme.
      const image = await Promise.race([
        contents.capturePage(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 400))
      ])
      if (!image) return false
      const size = image.getSize()
      if (!size.width || !size.height) return false
      const resized = image.resize({
        width: WIDTH,
        height: Math.max(1, Math.round((size.height * WIDTH) / size.width)),
        quality: 'good'
      })
      const jpeg = resized.toJPEG(QUALITY)
      if (!jpeg.byteLength || jpeg.byteLength > MAX_BYTES) return false
      mkdirSync(thumbnailDir(this.dir), { recursive: true })
      writeFileSync(this.path(url), jpeg)
      return true
    } catch {
      return false
    }
  }

  /** Data URL de la vignette, ou null si elle n'existe pas. */
  dataUrl(url: string): string | null {
    if (!this.enabled() || !/^https?:/i.test(url)) return null
    try {
      const bytes = readFileSync(this.path(url))
      return `data:image/jpeg;base64,${bytes.toString('base64')}`
    } catch {
      return null
    }
  }

  count(): number {
    try {
      return readdirSync(thumbnailDir(this.dir)).filter((name) => name.endsWith('.jpg')).length
    } catch {
      return 0
    }
  }

  /** Supprime toutes les vignettes ; renvoie le nombre effacé. */
  purge(): number {
    let removed = 0
    let names: string[]
    try {
      names = readdirSync(thumbnailDir(this.dir))
    } catch {
      return 0
    }
    for (const name of names) {
      if (!name.endsWith('.jpg')) continue
      try {
        unlinkSync(join(thumbnailDir(this.dir), name))
        removed += 1
      } catch {
        /* fichier déjà parti */
      }
    }
    return removed
  }

  /** Vrai si une vignette existe déjà pour cette adresse. */
  has(url: string): boolean {
    return existsSync(this.path(url))
  }
}
