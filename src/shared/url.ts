import { HOME_URL, type SearchEngineId } from './types'

interface Engine {
  label: string
  build: (query: string) => string
}

export const SEARCH_ENGINES: Record<SearchEngineId, Engine> = {
  duckduckgo: {
    label: 'DuckDuckGo',
    build: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`
  },
  google: {
    label: 'Google',
    build: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`
  },
  brave: {
    label: 'Brave',
    build: (q) => `https://search.brave.com/search?q=${encodeURIComponent(q)}`
  }
}

const HOST_LIKE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?::\d+)?(?:[/?#]|$)/i
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:[/?#]|$)/i
const SCHEME = /^[a-z][a-z0-9+.-]*:/i

export function isHomeUrl(url: string | null | undefined): boolean {
  return !url || url === HOME_URL
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Adresse lisible : sans protocole, sans www, sans slash final. */
export function prettyUrl(url: string): string {
  if (isHomeUrl(url)) return 'Nouvel onglet'
  try {
    const parsed = new URL(url)
    const path = parsed.pathname === '/' ? '' : parsed.pathname
    return `${parsed.host.replace(/^www\./, '')}${path}${parsed.search}`.replace(/\/$/, '')
  } catch {
    return url
  }
}

export function searchUrl(query: string, engine: SearchEngineId): string {
  return (SEARCH_ENGINES[engine] ?? SEARCH_ENGINES.duckduckgo).build(query)
}

/** Hôte du moteur, pour pré-connecter (DNS + TLS) avant la première recherche. */
export function engineHost(engine: SearchEngineId): string {
  try {
    return new URL(searchUrl('test', engine)).hostname || 'duckduckgo.com'
  } catch {
    return 'duckduckgo.com'
  }
}

export interface Target {
  url: string
  kind: 'url' | 'search'
}

/**
 * Transforme ce que l'utilisateur tape en adresse ou en recherche.
 * Tout schéma exotique (javascript:, data:, file:) part en recherche : jamais exécuté.
 */
export function normalizeInput(raw: string, engine: SearchEngineId = 'duckduckgo'): Target {
  const input = raw.replace(/\s+/g, ' ').trim()
  if (!input) return { url: HOME_URL, kind: 'url' }
  if (input === HOME_URL) return { url: HOME_URL, kind: 'url' }

  if (/^https?:\/\//i.test(input)) {
    return { url: input, kind: 'url' }
  }

  if (LOCAL_HOST.test(input)) {
    return { url: `http://${input}`, kind: 'url' }
  }

  if (!SCHEME.test(input) && !/\s/.test(input) && HOST_LIKE.test(input)) {
    return { url: `https://${input}`, kind: 'url' }
  }

  return { url: searchUrl(input, engine), kind: 'search' }
}

/** Titre court et propre quand la page n'en fournit pas encore. */
export function titleFromUrl(url: string): string {
  if (isHomeUrl(url)) return 'Nouvel onglet'
  return hostOf(url) || 'Page'
}

export function sameSite(a: string, b: string): boolean {
  const hostA = hostOf(a)
  return Boolean(hostA) && hostA === hostOf(b)
}
