import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { newId } from '@shared/defaults'
import { MAX_RECORDING_BYTES } from '@shared/recorder'

/**
 * Enregistrements vocaux des notes : de vrais fichiers dans
 * <userData>/notes/audio/<espace>/, jamais dans vela.json.
 *
 * Les noms sont validés avant tout accès disque : un nom venu du renderer ne
 * peut pas sortir du dossier audio.
 */

const MIME_BY_EXT: Record<string, string> = {
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  mp4: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav'
}

const EXT_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav'
}

const NAME = /^([a-z0-9-]{1,64})\/([a-z0-9]{4,40})\.(webm|ogg|mp4|mp3|wav)$/

/** true si le nom désigne un fichier audio de l'espace, sans remontée de chemin. */
export function isAudioName(value: unknown): value is string {
  return typeof value === 'string' && NAME.test(value)
}

function spaceFolder(spaceId: unknown): string {
  const raw = typeof spaceId === 'string' ? spaceId.toLowerCase().replace(/[^a-z0-9-]/g, '-') : ''
  return raw.slice(0, 64) || 'espace'
}

/** Décode une data URL audio ; `null` si le type ou la taille ne convient pas. */
export function parseAudioDataUrl(value: unknown): { mime: string; ext: string; bytes: Buffer } | null {
  if (typeof value !== 'string') return null
  const match = value.match(/^data:(audio\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i)
  if (!match) return null
  const mime = match[1].toLowerCase()
  const ext = EXT_BY_MIME[mime]
  if (!ext) return null
  let bytes: Buffer
  try {
    bytes = Buffer.from(match[2], 'base64')
  } catch {
    return null
  }
  if (bytes.length === 0 || bytes.length > MAX_RECORDING_BYTES) return null
  return { mime, ext, bytes }
}

export class NoteAudioStore {
  readonly dir: string

  constructor(baseDir: string) {
    this.dir = join(baseDir, 'notes', 'audio')
    mkdirSync(this.dir, { recursive: true })
  }

  private pathOf(name: string): string {
    return join(this.dir, name)
  }

  /** Écrit un enregistrement ; renvoie son nom relatif, ou `null` si refusé. */
  save(spaceId: unknown, dataUrl: unknown): { name: string; bytes: number } | null {
    const parsed = parseAudioDataUrl(dataUrl)
    if (!parsed) return null
    const folder = spaceFolder(spaceId)
    const target = join(this.dir, folder)
    mkdirSync(target, { recursive: true })
    const name = `${folder}/${newId().replace(/[^a-z0-9]/gi, '').slice(0, 24)}.${parsed.ext}`
    if (!isAudioName(name)) return null
    try {
      writeFileSync(this.pathOf(name), parsed.bytes)
    } catch {
      return null
    }
    return { name, bytes: parsed.bytes.length }
  }

  /** Data URL pour le lecteur de la note, ou `null` si le fichier a disparu. */
  read(name: unknown): string | null {
    if (!isAudioName(name)) return null
    const file = this.pathOf(name)
    if (!existsSync(file)) return null
    try {
      const ext = name.split('.').pop() ?? 'webm'
      const mime = MIME_BY_EXT[ext] ?? 'audio/webm'
      return `data:${mime};base64,${readFileSync(file).toString('base64')}`
    } catch {
      return null
    }
  }

  /** Fichier brut, pour une transcription ; `null` si absent ou trop gros. */
  file(name: unknown): { buffer: Buffer; mime: string; filename: string } | null {
    if (!isAudioName(name)) return null
    const file = this.pathOf(name)
    if (!existsSync(file)) return null
    try {
      if (statSync(file).size > MAX_RECORDING_BYTES) return null
      const ext = name.split('.').pop() ?? 'webm'
      return {
        buffer: readFileSync(file),
        mime: MIME_BY_EXT[ext] ?? 'audio/webm',
        filename: `${name.split('/')[1].replace(/\.[a-z0-9]+$/, '')}.${ext}`
      }
    } catch {
      return null
    }
  }

  remove(name: unknown): boolean {
    if (!isAudioName(name)) return false
    const file = this.pathOf(name)
    if (!existsSync(file)) return false
    try {
      unlinkSync(file)
      return true
    } catch {
      return false
    }
  }

  /** Supprime les fichiers qu'aucune note ne cite plus. */
  prune(referenced: Set<string>): number {
    let removed = 0
    let folders: string[] = []
    try {
      folders = readdirSync(this.dir)
    } catch {
      return 0
    }
    for (const folder of folders) {
      const full = join(this.dir, folder)
      let files: string[] = []
      try {
        if (!statSync(full).isDirectory()) continue
        files = readdirSync(full)
      } catch {
        continue
      }
      for (const file of files) {
        const name = `${folder}/${file}`
        if (referenced.has(name)) continue
        try {
          rmSync(join(full, file), { force: true })
          removed += 1
        } catch {
          /* fichier verrouillé : il repartira au prochain passage */
        }
      }
    }
    return removed
  }
}
