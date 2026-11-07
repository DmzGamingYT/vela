import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { newId } from '@shared/defaults'
import { audioRefs, noteGraph, rewriteWikiTargets, type NoteGraph } from '@shared/noteLinks'
import { matchesSearch, parseSearchQuery } from '@shared/search'
import type { Note, NoteMeta, PageHighlight, TrashedNote } from '@shared/types'

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

interface TrashIndexEntry extends NoteIndexEntry {
  deletedAt: number
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

function pressText(body: string): string {
  return body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '[croquis]')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#+\s*/gm, '')
    // Deux puces ramenées sur une ligne se lisaient comme une phrase :
    // « À vérifier La densité… ». Le point médian garde la césure.
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, ' · ')
    .replace(/\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g, (_match, target: string, alias?: string) => alias || target)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[[ xX]\]\s?/g, '')
    .replace(/[*_>`|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^(?:·\s*)+/, '')
    .trim()
}

/**
 * Aperçu d'une note pour sa carte. Le premier titre du corps répète presque
 * toujours le titre de la note : la carte l'affiche déjà, l'aperçu commence
 * donc après lui (« Un site de vitrine… », pas « Hébergement statique Un site… »).
 */
function previewOf(body: string, title = ''): string {
  let text = pressText(body)
  const words = title.trim().split(/\s+/).filter(Boolean).length
  if (words > 0) {
    const same =
      text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().slice(0, title.trim().length) ===
      title.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    if (same) {
      const rest = text.split(/\s+/).slice(words).join(' ').replace(/^[·—–-]+\s*/, '')
      if (rest) text = rest
    }
  }
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
  private readonly trashDir: string
  private readonly trashIndexFile: string
  private entries: NoteIndexEntry[]
  private trashed: TrashIndexEntry[]
  private indexReadable = true
  private trashReadable = true

  constructor(baseDir: string) {
    this.dir = join(baseDir, 'notes')
    mkdirSync(this.dir, { recursive: true })
    this.indexFile = join(this.dir, 'index.json')
    this.trashDir = join(this.dir, 'corbeille')
    mkdirSync(this.trashDir, { recursive: true })
    this.trashIndexFile = join(this.trashDir, 'index.json')
    this.entries = this.readIndex()
    this.trashed = this.readTrash()
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

  /** Index de la corbeille : les fichiers déplacés, avec leur date de suppression. */
  private readTrash(): TrashIndexEntry[] {
    if (!existsSync(this.trashIndexFile)) {
      try {
        if (readdirSync(this.trashDir).some((file) => file.endsWith('.md'))) this.trashReadable = false
      } catch {
        this.trashReadable = false
      }
      return []
    }
    try {
      const raw = JSON.parse(readFileSync(this.trashIndexFile, 'utf8'))
      if (
        !Array.isArray(raw) ||
        raw.some(
          (entry) =>
            !entry ||
            typeof entry.id !== 'string' ||
            typeof entry.file !== 'string' ||
            typeof entry.title !== 'string'
        )
      ) {
        this.trashReadable = false
        return []
      }
      return (raw as TrashIndexEntry[]).map((entry) => ({
        ...entry,
        tags: normalizeTags((entry as { tags?: unknown }).tags),
        pinned: (entry as { pinned?: unknown }).pinned === true,
        deletedAt: Number((entry as { deletedAt?: unknown }).deletedAt) || 0
      }))
    } catch {
      this.trashReadable = false
      return []
    }
  }

  private requireTrash(): void {
    if (!this.trashReadable) {
      throw new Error(
        'La corbeille est illisible : ses fichiers ont été conservés. Restaurez son index avant de supprimer ou restaurer une note.'
      )
    }
  }

  private writeTrash(): void {
    const tmp = `${this.trashIndexFile}.tmp`
    writeFileSync(tmp, JSON.stringify(this.trashed, null, 2), 'utf8')
    renameSync(tmp, this.trashIndexFile)
  }

  private bodyIn(dir: string, entry: NoteIndexEntry): string {
    const file = join(dir, entry.file)
    if (!existsSync(file)) return ''
    try {
      return readFileSync(file, 'utf8')
    } catch {
      return ''
    }
  }

  private bodyOf(entry: NoteIndexEntry): string {
    return this.bodyIn(this.dir, entry)
  }

  list(): NoteMeta[] {
    return this.entries
      .slice()
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        preview: previewOf(this.bodyOf(entry), entry.title),
        spaceId: entry.spaceId,
        url: entry.url,
        tags: entry.tags,
        pinned: entry.pinned,
        updatedAt: entry.updatedAt
      }))
  }

  /**
   * Identifiants des notes dont le titre, les étiquettes ou le corps correspond
   * à la recherche : mots tous présents, expressions entre guillemets et
   * exclusions préfixées par `-`.
   */
  search(query: string): string[] {
    const parsed = parseSearchQuery(query)
    if (parsed.include.length === 0 && parsed.exclude.length === 0) return []
    return this.entries
      .filter((entry) =>
        matchesSearch(
          `${entry.title}\n${entry.tags.join(' ')}\n${this.bodyOf(entry)}`,
          parsed
        )
      )
      .map((entry) => entry.id)
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

  /** Enregistrements vocaux cités par au moins une note, corbeille comprise. */
  audioNames(): Set<string> {
    const names = new Set<string>()
    for (const entry of this.entries) for (const name of audioRefs(this.bodyOf(entry))) names.add(name)
    for (const entry of this.trashed) {
      for (const name of audioRefs(this.bodyIn(this.trashDir, entry))) names.add(name)
    }
    return names
  }

  listTrash(): TrashedNote[] {
    return this.trashed
      .slice()
      .sort((a, b) => b.deletedAt - a.deletedAt)
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        preview: previewOf(this.bodyIn(this.trashDir, entry), entry.title),
        spaceId: entry.spaceId,
        url: entry.url,
        tags: entry.tags,
        pinned: entry.pinned,
        updatedAt: entry.updatedAt,
        deletedAt: entry.deletedAt
      }))
  }

  /** Remet une note de la corbeille dans la liste, avec son contenu et ses métadonnées. */
  restore(id: string): Note | null {
    this.requireReadableIndex()
    this.requireTrash()
    const entry = this.trashed.find((item) => item.id === id)
    if (!entry) return null
    // Une note déjà présente ne doit pas être dupliquée dans l’index.
    if (this.entries.some((item) => item.id === id)) return null
    const source = join(this.trashDir, entry.file)
    if (!existsSync(source)) {
      throw new Error('Le fichier de cette note est introuvable dans la corbeille.')
    }
    const base = entry.file.replace(/\.md$/i, '')
    let file = entry.file
    // Un fichier homonyme peut être réapparu pendant que la note était dans la corbeille.
    if (existsSync(join(this.dir, file))) file = `${base}-${newId().slice(0, 4)}.md`
    const target = join(this.dir, file)
    const previousEntries = this.entries
    const previousTrashed = this.trashed
    renameSync(source, target)
    const restored: NoteIndexEntry = {
      id,
      title: entry.title,
      file,
      spaceId: entry.spaceId,
      url: entry.url,
      tags: entry.tags,
      pinned: entry.pinned,
      updatedAt: Date.now()
    }
    this.entries = [restored, ...this.entries]
    this.trashed = this.trashed.filter((item) => item.id !== id)
    try {
      this.writeIndex()
      this.writeTrash()
    } catch (error) {
      this.entries = previousEntries
      this.trashed = previousTrashed
      try {
        this.writeIndex()
      } catch {
        /* déjà signalé par l’erreur d’origine */
      }
      try {
        this.writeTrash()
      } catch {
        /* déjà signalé par l’erreur d’origine */
      }
      try {
        renameSync(target, source)
      } catch {
        /* le fichier reste dans les notes, l’index d’origine est rétabli */
      }
      throw error
    }
    return this.get(id)
  }

  /** Déplace la note vers la corbeille au lieu de l’effacer définitivement. */
  remove(id: string): void {
    this.requireReadableIndex()
    this.requireTrash()
    const entry = this.entries.find((item) => item.id === id)
    if (!entry) return
    const source = join(this.dir, entry.file)
    const destination = join(this.trashDir, entry.file)
    if (existsSync(destination)) {
      throw new Error('Un fichier du même nom est déjà dans la corbeille.')
    }
    const moved = existsSync(source)
    const previousEntries = this.entries
    const previousTrashed = this.trashed
    if (moved) renameSync(source, destination)
    this.entries = this.entries.filter((item) => item.id !== id)
    this.trashed = [{ ...entry, deletedAt: Date.now() }, ...this.trashed]
    try {
      // La corbeille est écrite avant l’index : une note encore listée mais
      // déjà déplacée serait plus gênante qu’une entrée de corbeille en trop.
      this.writeTrash()
      this.writeIndex()
    } catch (error) {
      this.entries = previousEntries
      this.trashed = previousTrashed
      try {
        this.writeTrash()
      } catch {
        /* déjà signalé par l’erreur d’origine */
      }
      if (moved) {
        try {
          renameSync(destination, source)
        } catch {
          /* le fichier reste dans la corbeille, l’index d’origine est rétabli */
        }
      }
      throw error
    }
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
