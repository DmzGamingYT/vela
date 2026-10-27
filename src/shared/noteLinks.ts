/**
 * Liens entre notes : `[[Titre]]` ou `[[Titre|texte affiché]]`.
 *
 * Tout est pur et testé séparément : la lecture d'un corps, la recherche du
 * lien en cours de frappe, et la réécriture lors d'un renommage. Le renommage
 * ne fait qu'une passe sur chaque corps : A → B → A ne boucle jamais.
 */

export interface WikiLink {
  /** Titre visé, tel qu'écrit. */
  target: string
  /** Texte affiché, si différent du titre. */
  alias: string | null
  index: number
  length: number
}

export interface NoteRef {
  id: string
  title: string
}

export interface LinkRef {
  /** Identifiant de la note visée, `null` quand elle n'existe pas. */
  id: string | null
  title: string
}

export interface NoteGraph {
  /** Notes citées par celle-ci. */
  outgoing: LinkRef[]
  /** Notes qui citent celle-ci. */
  incoming: LinkRef[]
  /** Titres cités qui ne correspondent à aucune note. */
  missing: string[]
}

const LINK = /\[\[([^[\]|\n]{1,120})(?:\|([^[\]\n]{1,120}))?\]\]/g

/** Accents, casse et espaces ignorés pour comparer deux titres. */
export function foldTitle(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Tous les liens d'un corps, dans l'ordre d'apparition. */
export function wikiLinks(body: string): WikiLink[] {
  const links: WikiLink[] = []
  if (!body.includes('[[')) return links
  LINK.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = LINK.exec(body))) {
    links.push({
      target: match[1].trim(),
      alias: match[2]?.trim() || null,
      index: match.index,
      length: match[0].length
    })
  }
  return links
}

/** Notes citées, sans doublon (comparaison sans casse ni accents). */
export function wikiTargets(body: string): string[] {
  const seen = new Set<string>()
  const targets: string[] = []
  for (const link of wikiLinks(body)) {
    const key = foldTitle(link.target)
    if (!key || seen.has(key)) continue
    seen.add(key)
    targets.push(link.target)
  }
  return targets
}

/** Note qui porte ce titre, ou `null`. */
export function findNoteByTitle(notes: NoteRef[], title: string): NoteRef | null {
  const key = foldTitle(title)
  if (!key) return null
  return notes.find((note) => foldTitle(note.title) === key) ?? null
}

/**
 * Remplace le titre visé par `to` dans tous les liens qui pointaient sur
 * `from`, en gardant l'alias éventuel. Une seule passe : un cycle de notes ne
 * peut pas boucler. Retourne le corps et le nombre de liens changés.
 */
export function rewriteWikiTargets(body: string, from: string, to: string): { body: string; count: number } {
  const target = to.trim()
  const key = foldTitle(from)
  if (!body.includes('[[') || !key || !target || foldTitle(target) === key) {
    return { body, count: 0 }
  }
  let count = 0
  const next = body.replace(LINK, (whole, title: string, alias: string | undefined) => {
    if (foldTitle(title) !== key) return whole
    count += 1
    const shown = alias?.trim()
    return shown ? `[[${target}|${shown}]]` : `[[${target}]]`
  })
  return { body: count > 0 ? next : body, count }
}

/** Liens entrants et sortants de la note ouverte. */
export function noteGraph(notes: (NoteRef & { body: string })[], id: string): NoteGraph {
  const current = notes.find((note) => note.id === id)
  if (!current) return { outgoing: [], incoming: [], missing: [] }
  const refs: NoteRef[] = notes.map((note) => ({ id: note.id, title: note.title }))
  const outgoing: LinkRef[] = []
  const missing: string[] = []
  const seen = new Set<string>()
  for (const title of wikiTargets(current.body)) {
    if (foldTitle(title) === foldTitle(current.title)) continue
    const found = findNoteByTitle(refs.filter((note) => note.id !== id), title)
    if (found) {
      outgoing.push({ id: found.id, title: found.title })
    } else {
      missing.push(title)
    }
    seen.add(foldTitle(title))
  }
  const incoming: LinkRef[] = notes
    .filter((note) => note.id !== id)
    .filter((note) => wikiTargets(note.body).some((title) => foldTitle(title) === foldTitle(current.title)))
    .map((note) => ({ id: note.id, title: note.title }))
  return { outgoing, incoming, missing: missing.filter((title) => seen.has(foldTitle(title))) }
}

export interface LinkQuery {
  /** Index du `[[` dans le corps. */
  start: number
  /** Ce qui est déjà tapé après `[[`. */
  query: string
}

/**
 * Lien en cours de frappe : le dernier `[[` non fermé avant le curseur, sur la
 * même ligne. Sert à ouvrir l'autocomplétion au bon endroit.
 */
export function linkQueryAt(body: string, caret: number): LinkQuery | null {
  const before = body.slice(0, Math.max(0, Math.min(caret, body.length)))
  const start = before.lastIndexOf('[[')
  if (start === -1) return null
  const query = before.slice(start + 2)
  if (/[[\]\n]/.test(query)) return null
  if (query.length > 80) return null
  return { start, query }
}

/** Insère `[[Titre]]` à la place de la frappe en cours ; curseur après. */
export function completeLink(body: string, caret: number, title: string): { body: string; caret: number } {
  const clean = title.trim().replace(/[[\]|\n]/g, ' ').replace(/\s+/g, ' ').slice(0, 120) || 'Note'
  const query = linkQueryAt(body, caret)
  const insertion = `[[${clean}]]`
  if (!query) {
    const at = Math.max(0, Math.min(caret, body.length))
    return { body: `${body.slice(0, at)}${insertion}${body.slice(at)}`, caret: at + insertion.length }
  }
  const end = query.start + 2 + query.query.length
  return {
    body: `${body.slice(0, query.start)}${insertion}${body.slice(end)}`,
    caret: query.start + insertion.length
  }
}

/** Titres à proposer : commence par la frappe, puis contient la frappe. */
export function suggestNotes(notes: NoteRef[], query: string, excludeId?: string, limit = 6): NoteRef[] {
  const key = foldTitle(query)
  const pool = notes.filter((note) => note.id !== excludeId)
  if (!key) return pool.slice(0, limit)
  const starts = pool.filter((note) => foldTitle(note.title).startsWith(key))
  const contains = pool.filter(
    (note) => !foldTitle(note.title).startsWith(key) && foldTitle(note.title).includes(key)
  )
  return [...starts, ...contains].slice(0, limit)
}

const AUDIO = /!\[([^\]]{0,80})\]\(vela-audio:([a-z0-9-]{1,64}\/[a-z0-9]{4,40}\.(?:webm|ogg|mp4|mp3|wav))\)/g

/** Enregistrements cités par un corps de note. */
export function audioRefs(body: string): string[] {
  const names: string[] = []
  for (const match of body.matchAll(AUDIO)) {
    if (!names.includes(match[2])) names.push(match[2])
  }
  return names
}

/** Retire un enregistrement cité par un corps de note. */
export function removeAudioToken(body: string, name: string): string {
  const pattern = new RegExp(`\\n*!\\[[^\\]]*\\]\\(vela-audio:${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)\\n*`, 'g')
  return body
    .replace(pattern, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '')
}

/** Bloc Markdown d'une note vocale, avec sa durée lisible. */
export function audioToken(name: string, seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const label = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
  return `![Note vocale ${label}](vela-audio:${name})`
}
