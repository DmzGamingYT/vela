import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { newId } from '@shared/defaults'
import type { Note, NoteMeta } from '@shared/types'

interface NoteIndexEntry {
  id: string
  title: string
  file: string
  spaceId: string
  url?: string
  updatedAt: number
}

function slugify(title: string): string {
  return (
    title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'note'
  )
}

function previewOf(body: string): string {
  const text = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#+\s*/gm, '')
    .replace(/[*_>`|-]/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 120 ? `${text.slice(0, 119)}…` : text
}

/**
 * Notes Markdown réelles sur le disque, dans <userData>/notes.
 * Le fichier .md contient le corps ; l'index garde le titre, l'espace et l'URL d'origine.
 */
export class NotesStore {
  readonly dir: string
  private readonly indexFile: string
  private entries: NoteIndexEntry[]

  constructor(baseDir: string) {
    this.dir = join(baseDir, 'notes')
    mkdirSync(this.dir, { recursive: true })
    this.indexFile = join(this.dir, 'index.json')
    this.entries = this.readIndex()
  }

  private readIndex(): NoteIndexEntry[] {
    if (!existsSync(this.indexFile)) return []
    try {
      const raw = JSON.parse(readFileSync(this.indexFile, 'utf8'))
      if (!Array.isArray(raw)) return []
      return raw.filter(
        (entry): entry is NoteIndexEntry =>
          entry && typeof entry.id === 'string' && typeof entry.file === 'string' && typeof entry.title === 'string'
      )
    } catch {
      return []
    }
  }

  private writeIndex(): void {
    const tmp = `${this.indexFile}.tmp`
    writeFileSync(tmp, JSON.stringify(this.entries, null, 2), 'utf8')
    renameSync(tmp, this.indexFile)
  }

  private bodyOf(entry: NoteIndexEntry): string {
    const file = join(this.dir, entry.file)
    if (!existsSync(file)) return ''
    try {
      return readFileSync(file, 'utf8')
    } catch {
      return ''
    }
  }

  list(): NoteMeta[] {
    return this.entries
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((entry) => {
        const body = this.bodyOf(entry)
        return {
          id: entry.id,
          title: entry.title,
          preview: previewOf(body),
          spaceId: entry.spaceId,
          url: entry.url,
          updatedAt: entry.updatedAt
        }
      })
  }

  get(id: string): Note | null {
    const entry = this.entries.find((item) => item.id === id)
    if (!entry) return null
    return {
      id: entry.id,
      title: entry.title,
      body: this.bodyOf(entry),
      spaceId: entry.spaceId,
      url: entry.url,
      updatedAt: entry.updatedAt
    }
  }

  save(input: { id?: string; title: string; body: string; spaceId: string; url?: string }): Note {
    const existing = input.id ? this.entries.find((entry) => entry.id === input.id) : undefined
    const id = existing?.id ?? newId()
    const title = input.title.trim() || 'Note sans titre'
    const body = input.body
    const filename = `${slugify(title)}-${id.slice(0, 8)}.md`

    if (existing && existing.file !== filename) {
      const oldFile = join(this.dir, existing.file)
      if (existsSync(oldFile)) {
        try {
          renameSync(oldFile, join(this.dir, filename))
        } catch {
          // garde l'ancien fichier si le renommage échoue
        }
      }
    }
    writeFileSync(join(this.dir, filename), body, 'utf8')

    const next: NoteIndexEntry = {
      id,
      title,
      file: filename,
      spaceId: input.spaceId,
      url: input.url,
      updatedAt: Date.now()
    }
    this.entries = existing ? this.entries.map((entry) => (entry.id === id ? next : entry)) : [next, ...this.entries]
    this.writeIndex()
    return { id, title, body, spaceId: next.spaceId, url: next.url, updatedAt: next.updatedAt }
  }

  remove(id: string): void {
    const entry = this.entries.find((item) => item.id === id)
    if (!entry) return
    this.entries = this.entries.filter((item) => item.id !== id)
    const file = join(this.dir, entry.file)
    if (existsSync(file)) unlinkSync(file)
    this.writeIndex()
  }

  /** Nettoie les fichiers orphelins (fichier supprimé à la main, index obsolète). */
  prune(): void {
    const files = new Set(readdirSync(this.dir))
    this.entries = this.entries.filter((entry) => files.has(entry.file))
  }
}
