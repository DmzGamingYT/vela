/**
 * Journal Letterboxd : lecture du flux RSS public d'un profil.
 *
 * Le flux ne contient que des données publiques (titre, année, note, date de
 * visionnage). Le lecteur est volontairement tolérant : un champ absent est
 * simplement omis, jamais remplacé par une valeur inventée.
 */

export interface LetterboxdLogEntry {
  id: string
  title: string
  year: number | null
  /** Note sur 5, par demi-étoile ; null quand le film n'a pas été noté. */
  rating: number | null
  /** Date de visionnage « AAAA-MM-JJ », la plus fiable du flux. */
  watchedDate: string | null
  rewatch: boolean
  url: string | null
}

export const MAX_LOG_ENTRIES = 200
const MAX_IMPORT = 50

const ENTITY: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'"
}

function decode(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    const key = code.toLowerCase()
    if (key in ENTITY) return ENTITY[key]
    if (key.startsWith('#x')) {
      const point = Number.parseInt(key.slice(2), 16)
      return Number.isFinite(point) ? String.fromCodePoint(point) : whole
    }
    if (key.startsWith('#')) {
      const point = Number.parseInt(key.slice(1), 10)
      return Number.isFinite(point) ? String.fromCodePoint(point) : whole
    }
    return whole
  })
}

function tag(block: string, name: string): string | null {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  if (!match) return null
  return decode(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim())
}

function short(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

function numberOrNull(value: string | null, min: number, max: number): number | null {
  if (!value) return null
  const parsed = Number.parseFloat(value.replace(',', '.'))
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null
  return parsed
}

/** « 2023 » seulement, jamais une année aberrante. */
function yearOrNull(value: string | null): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1870 || parsed > 2100) return null
  return parsed
}

function dateOrNull(value: string | null): string | null {
  if (!value) return null
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${match[1]}-${match[2]}-${match[3]}`
}

/** Note déduite des étoiles du titre quand `memberRating` manque. */
function ratingFromStars(title: string): number | null {
  const stars = title.match(/[★½]+/)
  if (!stars) return null
  const full = (stars[0].match(/★/g) ?? []).length
  const half = stars[0].includes('½') ? 0.5 : 0
  const value = full + half
  return value > 0 && value <= 5 ? value : null
}

function letterboxdLink(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return null
    const host = url.hostname.toLowerCase()
    if (host !== 'letterboxd.com' && !host.endsWith('.letterboxd.com')) return null
    return url.toString().slice(0, 400)
  } catch {
    return null
  }
}

/**
 * Lit un flux RSS Letterboxd. Les entrées sans titre exploitable sont
 * ignorées ; les doublons (même guid) sont fondus en gardant le premier.
 */
export function parseLetterboxdLog(xml: string): LetterboxdLogEntry[] {
  const entries: LetterboxdLogEntry[] = []
  const seen = new Set<string>()
  for (const match of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    if (entries.length >= MAX_IMPORT) break
    const block = match[1]
    const guid = tag(block, 'guid')
    const link = letterboxdLink(tag(block, 'link'))
    const rawTitle = tag(block, 'letterboxd:filmTitle') ?? tag(block, 'title') ?? ''
    // Le titre RSS est « Film, 2023 - ★★★★ » : on ne garde que le film.
    const title = short(rawTitle.split(/,\s*\d{4}\s*[-–]/)[0].split(/\s+[-–]\s+[★½]/)[0], 140)
    if (!title) continue
    const key = short(guid ?? link ?? title.toLowerCase(), 200)
    if (seen.has(key)) continue
    seen.add(key)
    // Les étoiles vivent dans le titre RSS, pas dans `letterboxd:filmTitle`.
    const rating =
      numberOrNull(tag(block, 'letterboxd:memberRating'), 0.5, 5) ??
      ratingFromStars(tag(block, 'title') ?? rawTitle)
    entries.push({
      id: key.replace(/[^a-z0-9-]/gi, '-').slice(0, 60) || `log-${entries.length}`,
      title,
      year: yearOrNull(tag(block, 'letterboxd:filmYear')),
      rating: rating === null ? null : Math.round(rating * 2) / 2,
      watchedDate: dateOrNull(tag(block, 'letterboxd:watchedDate')),
      rewatch: /^yes$/i.test(tag(block, 'letterboxd:rewatch') ?? ''),
      url: link
    })
  }
  return entries
}

/**
 * Valide un journal déjà stocké : l'ordre est conservé (le plus récent
 * d'abord), les champs hors bornes sont retirés plutôt que corrigés au hasard.
 */
export function sanitizeLetterboxdLog(raw: unknown): LetterboxdLogEntry[] {
  if (!Array.isArray(raw)) return []
  const items: LetterboxdLogEntry[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Partial<LetterboxdLogEntry>
    const title = typeof candidate.title === 'string' ? short(candidate.title, 140) : ''
    if (!title) continue
    const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.slice(0, 60) : ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    items.push({
      id,
      title,
      year: yearOrNull(typeof candidate.year === 'number' ? String(candidate.year) : null),
      rating:
        typeof candidate.rating === 'number' && candidate.rating >= 0.5 && candidate.rating <= 5
          ? Math.round(candidate.rating * 2) / 2
          : null,
      watchedDate: dateOrNull(typeof candidate.watchedDate === 'string' ? candidate.watchedDate : null),
      rewatch: candidate.rewatch === true,
      url: letterboxdLink(typeof candidate.url === 'string' ? candidate.url : null)
    })
    if (items.length >= MAX_LOG_ENTRIES) break
  }
  return items
}

/** Adresse du flux public d'un profil, ou null sans nom valide. */
export function letterboxdFeedUrl(user: string | null | undefined): string | null {
  if (typeof user !== 'string') return null
  const name = user.trim().replace(/^@/, '').toLowerCase()
  if (!/^[a-z0-9][a-z0-9_-]{1,29}$/.test(name)) return null
  return `https://letterboxd.com/${name}/rss/`
}

/** « 2024-10-25 » → « 25 oct. 2024 », sans dépendre d'une locale système. */
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

export function logDateLabel(date: string | null): string {
  if (!date) return ''
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ''
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1] ?? ''} ${match[1]}`.trim()
}
