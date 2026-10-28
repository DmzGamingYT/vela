import { letterboxdFeedUrl, parseLetterboxdLog, type LetterboxdLogEntry } from '@shared/letterboxd'

/**
 * Import du journal Letterboxd depuis le flux RSS public du profil.
 *
 * La requête part du processus principal avec `fetch` (piles Node), donc sans
 * aucun cookie : le flux public ne demande pas de session, et l'import ne
 * réutilise jamais celle de l'espace. Sortie unique : letterboxd.com, décrite
 * dans l'audit réseau.
 */
export type LogImportReason =
  | 'no-profile'
  | 'not-found'
  | 'private'
  | 'offline'
  | 'timeout'
  | 'empty'
  | 'failed'

export type LogImport =
  | { ok: true; entries: LetterboxdLogEntry[] }
  | { ok: false; reason: LogImportReason }

const TIMEOUT_MS = 8000
const MAX_BYTES = 2_000_000

export async function fetchLetterboxdLog(user: string | null | undefined): Promise<LogImport> {
  const url = letterboxdFeedUrl(user)
  if (!url) return { ok: false, reason: 'no-profile' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8',
        // Un agent honnête : Letterboxd peut refuser une requête anonyme.
        'user-agent': 'Vela/1.0 (import du journal Letterboxd)'
      }
    })
    if (response.status === 404) return { ok: false, reason: 'not-found' }
    if (response.status === 401 || response.status === 403) return { ok: false, reason: 'private' }
    if (!response.ok) return { ok: false, reason: 'failed' }
    const text = (await response.text()).slice(0, MAX_BYTES)
    const entries = parseLetterboxdLog(text)
    if (entries.length === 0) return { ok: false, reason: 'empty' }
    return { ok: true, entries }
  } catch (error) {
    const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : ''
    return { ok: false, reason: name === 'AbortError' ? 'timeout' : 'offline' }
  } finally {
    clearTimeout(timer)
  }
}
