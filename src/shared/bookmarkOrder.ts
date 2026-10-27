import type { Bookmark } from './types'

/**
 * Ordre des favoris : la liste (et son champ `order`, de 0 à n-1) fait foi.
 * Ce module est pur : il sert à la migration du fichier au démarrage et aux
 * déplacements demandés par l'interface, sans toucher au disque.
 */

interface RawBookmark {
  id?: unknown
  url?: unknown
  order?: unknown
}

function isEntry(value: unknown): value is RawBookmark {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as RawBookmark).id === 'string' &&
      typeof (value as RawBookmark).url === 'string'
  )
}

function isPosition(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

export interface BookmarkMigration {
  /** Vrai si le fichier doit être réécrit. */
  changed: boolean
  /** État prêt pour `normalizeState` (même objet si rien à faire). */
  state: unknown
  /** Lignes du journal, vides quand il n'y a rien à signaler. */
  journal: string[]
}

/**
 * Donne un `order` canonique à une liste brute de favoris. Les entrées sans
 * numéro gardent leur place actuelle (tri stable), les numéros existants sont
 * respectés ; les doublons et les trous sont refermés.
 */
function canonicalise(list: unknown[]): {
  entries: unknown[]
  changed: boolean
  kept: number
  broken: number
} {
  const kept = list.filter(isEntry)
  const broken = list.length - kept.length
  if (kept.length === 0) return { entries: [], changed: broken > 0, kept: 0, broken }

  // Un ordre n'est repris que s'il est complet et sans doublon (0 à n-1).
  // Sinon le fichier est partiel ou incohérent : c'est l'ordre du tableau qui
  // fait foi, c'est-à-dire celui que l'utilisateur voyait.
  const numbers = kept.map((entry) => entry.order)
  const complete =
    numbers.every(isPosition) &&
    new Set(numbers).size === numbers.length &&
    Math.max(...(numbers as number[])) === numbers.length - 1

  const ordered = complete
    ? kept.slice().sort((a, b) => (a.order as number) - (b.order as number))
    : kept

  const entries = ordered.map((entry, index) => ({ ...entry, order: index }))
  const exact =
    broken === 0 &&
    entries.length === list.length &&
    entries.every((entry, index) => {
      const original = list[index]
      return isEntry(original) && original.order === index && original.id === entry.id
    })
  return { entries, changed: !exact, kept: kept.length, broken }
}

/** Migration idempotente : un second passage sur le résultat ne change rien. */
export function migrateBookmarkOrder(raw: unknown): BookmarkMigration {
  if (!raw || typeof raw !== 'object') return { changed: false, state: raw, journal: [] }
  const input = raw as { bookmarks?: unknown }
  if (!Array.isArray(input.bookmarks)) return { changed: false, state: raw, journal: [] }

  const result = canonicalise(input.bookmarks)
  if (!result.changed) return { changed: false, state: raw, journal: [] }

  const journal: string[] = []
  if (result.broken > 0) {
    journal.push(
      `${result.broken} entrée${result.broken > 1 ? 's' : ''} de favori ignorée${result.broken > 1 ? 's' : ''} : identifiant ou adresse manquant.`
    )
  }
  journal.push(`Ordre des favoris normalisé : ${result.kept} entrée${result.kept > 1 ? 's' : ''}, de 0 à ${Math.max(0, result.kept - 1)}.`)
  return { changed: true, state: { ...input, bookmarks: result.entries }, journal }
}

/** Remet une liste de favoris en ordre canonique (0 à n-1). */
export function orderBookmarks(list: Bookmark[]): Bookmark[] {
  return list
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const left = isPosition(a.entry.order) ? a.entry.order : Number.POSITIVE_INFINITY
      const right = isPosition(b.entry.order) ? b.entry.order : Number.POSITIVE_INFINITY
      if (left !== right) return left - right
      return a.index - b.index
    })
    .map(({ entry }, index) => ({ ...entry, order: index }))
}

/**
 * Déplace un favori à une position absolue. Renvoie `null` si la demande est
 * invalide (favori inconnu, position hors limites ou non entière).
 */
export function moveBookmark(list: Bookmark[], id: string, position: number): Bookmark[] | null {
  if (!isPosition(position) || position >= list.length) return null
  const index = list.findIndex((entry) => entry.id === id)
  if (index < 0) return null
  if (index === position) return list
  const next = list.slice()
  const [moved] = next.splice(index, 1)
  next.splice(position, 0, moved)
  return next.map((entry, order) => ({ ...entry, order }))
}

/**
 * Applique une permutation complète. Refusée si un favori manque, si un
 * identifiant est inconnu ou s'il y a un doublon : jamais de perte silencieuse.
 */
export function reorderBookmarks(list: Bookmark[], ids: string[]): Bookmark[] | null {
  if (ids.length !== list.length) return null
  const known = new Set(list.map((entry) => entry.id))
  const seen = new Set<string>()
  for (const id of ids) {
    if (!known.has(id) || seen.has(id)) return null
    seen.add(id)
  }
  const byId = new Map(list.map((entry) => [entry.id, entry]))
  return ids.map((id, order) => ({ ...(byId.get(id) as Bookmark), order }))
}
