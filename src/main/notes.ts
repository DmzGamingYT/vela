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
import { audioRefs, noteGraph, rewriteWikiTargets, type NoteGraph } from '@shared/noteLinks'
import type { Note, NoteMeta, PageHighlight } from '@shared/types'

interface NoteIndexEntry {
  id: string
  title: string
  file: string
  spaceId: string
  url?: string
  tags: string[]
  pinned: boolean
  updatedAt: number
}

/** Étiquettes courtes, sans doublon, dans l'ordre saisi. */
export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const tags: string[] = []
  for (const value of input) {
    if (typeof value !== 'string') continue
    const tag = value
      .trim()
      .replace(/^#+/, '')
      .replace(/\s+/g, ' ')
      .slice(0, 24)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
    if (tags.length >= 8) break
  }
  return tags
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
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '[croquis]')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#+\s*/gm, '')
    .replace(/\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g, (_match, target: string, alias?: string) => alias || target)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[[ xX]\]\s?/g, '')
    .replace(/[*_>`|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 120 ? `${text.slice(0, 119)}…` : text
}

/**
 * Notes Markdown réelles sur le disque, dans <userData>/notes.
 * Le fichier .md contient le corps ; l'index garde le titre, l'espace, l'URL
 * d'origine, les étiquettes et l'épinglage.
 */
export class NotesStore {
  readonly dir: string
  private readonly indexFile: string
  private entries: NoteIndexEntry[]
  private indexReadable = true

  constructor(baseDir: string) {
    this.dir = join(baseDir, 'notes')
    mkdirSync(this.dir, { recursive: true })
    this.indexFile = join(this.dir, 'index.json')
    this.entries = this.readIndex()
  }

  private readIndex(): NoteIndexEntry[] {
    if (!existsSync(this.indexFile)) {
      // Un index absent n’est normal que pour un dossier réellement neuf.
      try {
        const files = readdirSync(this.dir)
        if (files.some((file) => file.endsWith('.md')) ||
            (existsSync(join(this.dir, 'audio')) && readdirSync(join(this.dir, 'audio')).length > 0)) {
          this.indexReadable = false
        }
      } catch {
        this.indexReadable = false
      }
      return []
    }
    try {
      const raw = JSON.parse(readFileSync(this.indexFile, 'utf8'))
      if (!Array.isArray(raw) || raw.some((entry) =>
        !entry || typeof entry.id !== 'string' || typeof entry.file !== 'string' || typeof entry.title !== 'string'
      )) {
        this.indexReadable = false
        return []
      }
      return (raw as NoteIndexEntry[]).map((entry) => ({
          ...entry,
          tags: normalizeTags((entry as { tags?: unknown }).tags),
          pinned: (entry as { pinned?: unknown }).pinned === true
        }))
    } catch {
      this.indexReadable = false
      return []
    }
  }

  /** L’index illisible ne doit jamais devenir une liste vide sauvegardée. */
  get canReadIndex(): boolean {
    if (!this.indexReadable) return false
    // Une note inaccessible peut contenir une référence à un enregistrement.
    return this.entries.every((entry) => {
      try {
        readFileSync(join(this.dir, entry.file), 'utf8')
        return true
      } catch {
        return false
      }
    })
  }

  private requireReadableIndex(): void {
    if (!this.canReadIndex) throw new Error('Index ou fichier de note illisible : les fichiers ont été conservés. Restaurez-les avant de modifier les notes.')
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
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        preview: previewOf(this.bodyOf(entry)),
        spaceId: entry.spaceId,
        url: entry.url,
        tags: entry.tags,
        pinned: entry.pinned,
        updatedAt: entry.updatedAt
      }))
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
      tags: entry.tags,
      pinned: entry.pinned,
      updatedAt: entry.updatedAt
    }
  }

  /** Note rattachée à cette URL, la plus récente d'abord. */
  findByUrl(url: string): Note | null {
    const entry = this.entries
      .filter((item) => item.url === url)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0]
    return entry ? this.get(entry.id) : null
  }

  save(input: {
    id?: string
    title: string
    body: string
    spaceId: string
    url?: string
    tags?: unknown
    pinned?: unknown
  }): Note {
    this.requireReadableIndex()
    const existing = input.id ? this.entries.find((entry) => entry.id === input.id) : undefined
    const id = existing?.id ?? newId()
    const previousTitle = existing?.title
    const title = input.title.trim() || 'Note sans titre'
    const filename = `${slugify(title)}-${id.slice(0, 8)}.md`

    // Un renommage met à jour les liens qui citaient l'ancien titre, dans
    // toutes les notes, mais seulement après que la note et l'index ont été
    // écrits : une interruption laisse alors la note renommée et des liens
    // anciens, jamais l'inverse (des liens neufs vers un titre inexistant).
    let body = input.body
    if (existing && previousTitle && previousTitle !== title) {
      body = rewriteWikiTargets(body, previousTitle, title).body
    }

    const oldFile = existing ? join(this.dir, existing.file) : ''
    const moved = Boolean(existing && existing.file !== filename && existsSync(oldFile))
    if (moved) renameSync(oldFile, join(this.dir, filename))
    writeFileSync(join(this.dir, filename), body, 'utf8')

    const tags = input.tags === undefined ? existing?.tags ?? [] : normalizeTags(input.tags)
    const pinned = input.pinned === undefined ? existing?.pinned ?? false : input.pinned === true
    const next: NoteIndexEntry = {
      id,
      title,
      file: filename,
      spaceId: input.spaceId,
      url: input.url,
      tags,
      pinned,
      updatedAt: Date.now()
    }
    const previousEntries = this.entries
    this.entries = existing ? this.entries.map((entry) => (entry.id === id ? next : entry)) : [next, ...this.entries]
    try {
      this.writeIndex()
    } catch (error) {
      // Sans index valide, le fichier renommé serait introuvable : on remet
      // tout en place avant de remonter l'erreur.
      this.entries = previousEntries
      if (moved) {
        try {
          renameSync(join(this.dir, filename), oldFile)
        } catch {
          // la note reste sous son nouveau nom, l'index garde l'ancien : signalé plus haut
        }
      }
      throw error
    }

    let linksUpdated = 0
    let linksFailed = 0
    if (existing && previousTitle && previousTitle !== title) {
      for (const entry of this.entries) {
        if (entry.id === id) continue
        const source = this.bodyOf(entry)
        const rewritten = rewriteWikiTargets(source, previousTitle, title)
        if (rewritten.count === 0) continue
        try {
          writeFileSync(join(this.dir, entry.file), rewritten.body, 'utf8')
          linksUpdated += 1
        } catch {
          // La note garde son ancien texte : on le compte pour le dire.
          linksFailed += 1
        }
      }
    }

    return {
      id,
      title,
      body,
      spaceId: next.spaceId,
      url: next.url,
      tags: next.tags,
      pinned: next.pinned,
      updatedAt: next.updatedAt,
      linksUpdated,
      linksFailed
    }
  }

  /**
   * Renomme sans passer par le corps de l'éditeur, et rend de quoi annuler :
   * l'ancien titre et le nombre de notes dont les liens ont suivi.
   */
  rename(id: string, title: string): { note: Note; previous: string; updated: number } | null {
    const entry = this.entries.find((item) => item.id === id)
    if (!entry) return null
    const previous = entry.title
    const note = this.save({
      id,
      title,
      body: this.bodyOf(entry),
      spaceId: entry.spaceId,
      url: entry.url,
      tags: entry.tags,
      pinned: entry.pinned
    })
    return { note, previous, updated: note.linksUpdated ?? 0 }
  }

  /** Liens entrants, sortants et cassés de la note ouverte. */
  graph(id: string): NoteGraph {
    return noteGraph(
      this.entries.map((entry) => ({ id: entry.id, title: entry.title, body: this.bodyOf(entry) })),
      id
    )
  }

  /** Enregistrements vocaux cités par au moins une note. */
  audioNames(): Set<string> {
    const names = new Set<string>()
    for (const entry of this.entries) for (const name of audioRefs(this.bodyOf(entry))) names.add(name)
    return names
  }

  remove(id: string): void {
    this.requireReadableIndex()
    const entry = this.entries.find((item) => item.id === id)
    if (!entry) return
    this.entries = this.entries.filter((item) => item.id !== id)
    const file = join(this.dir, entry.file)
    if (existsSync(file)) unlinkSync(file)
    this.writeIndex()
  }

  /** Nettoie les fichiers orphelins (fichier supprimé à la main, index obsolète). */
  prune(): void {
    if (!this.canReadIndex) return
    const files = new Set(readdirSync(this.dir))
    this.entries = this.entries.filter((entry) => files.has(entry.file))
  }
}

/**
 * Surlignages par page, dans <userData>/notes/highlights.json.
 * Ils servent à repeindre les annotations à l'ouverture d'une page et à
 * alimenter la note qui lui est rattachée.
 */
export class HighlightsStore {
  private readonly file: string
  private entries: PageHighlight[]

  constructor(baseDir: string) {
    const dir = join(baseDir, 'notes')
    mkdirSync(dir, { recursive: true })
    this.file = join(dir, 'highlights.json')
    this.entries = this.read()
  }

  private read(): PageHighlight[] {
    if (!existsSync(this.file)) return []
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8'))
      if (!Array.isArray(raw)) return []
      return raw.filter(
        (entry): entry is PageHighlight =>
          entry &&
          typeof entry.id === 'string' &&
          typeof entry.url === 'string' &&
          typeof entry.text === 'string'
      )
    } catch {
      return []
    }
  }

  private write(): void {
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.entries, null, 2), 'utf8')
    renameSync(tmp, this.file)
  }

  list(url: string): PageHighlight[] {
    return this.entries.filter((entry) => entry.url === url).sort((a, b) => a.createdAt - b.createdAt)
  }

  add(input: { url: string; title: string; text: string }): PageHighlight {
    const existing = this.entries.find(
      (entry) => entry.url === input.url && entry.text === input.text
    )
    if (existing) return existing
    const highlight: PageHighlight = {
      id: newId(),
      url: input.url,
      title: input.title,
      text: input.text.slice(0, 2000),
      createdAt: Date.now()
    }
    this.entries = [...this.entries, highlight]
    this.write()
    return highlight
  }

  remove(id: string): void {
    this.entries = this.entries.filter((entry) => entry.id !== id)
    this.write()
  }

  removeForUrl(url: string): void {
    this.entries = this.entries.filter((entry) => entry.url !== url)
    this.write()
  }
}
