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
  brave: {
    label: 'Brave',
    build: (q) => `https://search.brave.com/search?q=${encodeURIComponent(q)}`
  },
  startpage: {
    label: 'Startpage',
    build: (q) => `https://www.startpage.com/sp/search?query=${encodeURIComponent(q)}`
  },
  google: {
    label: 'Google',
    build: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`
  },
  bing: {
    label: 'Bing',
    build: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`
  },
  ecosia: {
    label: 'Ecosia',
    build: (q) => `https://www.ecosia.org/search?q=${encodeURIComponent(q)}`
  },
  qwant: {
    label: 'Qwant',
    build: (q) => `https://www.qwant.com/?q=${encodeURIComponent(q)}`
  },
  searxng: {
    label: 'SearXNG',
    build: (q) => `https://searx.be/search?q=${encodeURIComponent(q)}`
  }
}

/**
 * Instance SearXNG saisie par l'utilisateur : garde l'hôte, ignore le chemin.
 * Une valeur vide ou invalide retombe sur searx.be.
 */
export function searxBase(instance?: string | null): string {
  const raw = (instance ?? '').trim()
  if (!raw) return 'https://searx.be'
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname) return 'https://searx.be'
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return 'https://searx.be'
  }
}

/* ------------------------------------------------------------------ */
/* Titres de l'accueil                                                */
/* ------------------------------------------------------------------ */

const TITLE_URL = /^(?:[a-z][a-z0-9+.-]*:\/\/|www\.)/i
const TITLE_BARE_HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?::\d+)?$/i

/**
 * Clé de dédoublonnage : même page = même hôte et même chemin, quels que
 * soient la requête (`?ref=…`) et l'ancre. Deux articles distincts gardent
 * donc deux tuiles.
 */
export function canonicalUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}`
  } catch {
    return url.split('#')[0]
  }
}

/**
 * Titre montré sur une tuile « Récemment » : débarrassé du compteur de
 * notifications, et remplacé par le domaine et un chemin court quand le titre
 * n'est qu'une adresse ou un nom d'hôte.
 */
export function readableTitle(raw: string | null | undefined, url: string): string {
  // Même règle que la pastille des cases : un compteur part, une année reste.
  const text = stripCounters(raw ?? '').replace(/\s+/g, ' ').trim()
  const host = hostOf(url)
  if (!text) return host || url
  if (TITLE_URL.test(text) || (TITLE_BARE_HOST.test(text) && !/\s/.test(text))) {
    try {
      const parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`)
      const path = parsed.pathname.replace(/\/+$/, '')
      const short = path.length > 26 ? `${path.slice(0, 25)}…` : path
      return `${parsed.host.replace(/^www\./, '')}${short}`
    } catch {
      return host || text
    }
  }
  if (host && text.toLowerCase() === host.toLowerCase()) return host
  return text
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

export function searchUrl(query: string, engine: SearchEngineId, searxInstance?: string | null): string {
  if (engine === 'searxng') return `${searxBase(searxInstance)}/search?q=${encodeURIComponent(query)}`
  return (SEARCH_ENGINES[engine] ?? SEARCH_ENGINES.duckduckgo).build(query)
}

/** Hôte du moteur, pour pré-connecter (DNS + TLS) avant la première recherche. */
export function engineHost(engine: SearchEngineId, searxInstance?: string | null): string {
  try {
    return new URL(searchUrl('test', engine, searxInstance)).hostname || 'duckduckgo.com'
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
export function normalizeInput(
  raw: string,
  engine: SearchEngineId = 'duckduckgo',
  searxInstance?: string | null
): Target {
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

  return { url: searchUrl(input, engine, searxInstance), kind: 'search' }
}

/** Titre court et propre quand la page n'en fournit pas encore. */
export function titleFromUrl(url: string): string {
  if (isHomeUrl(url)) return 'Nouvel onglet'
  return hostOf(url) || 'Page'
}

/** Compteur en tête de titre : « (12) Gmail », « [3] Slack ». */
const TITLE_COUNTER = /^[([]\s*(\d{1,4})\s*[)\]]\s*/

/** Retire les compteurs successifs d’un titre, sans toucher aux années. */
function stripCounters(value: string): string {
  let text = value.trim()
  for (;;) {
    if (titleBadge(text) === null) return text
    text = text.replace(TITLE_COUNTER, '').trim()
  }
}

/**
 * Nombre que le site met en tête de son titre, ou null. Une année entre
 * parenthèses reste un titre : « (2024) Le film » n'affiche pas de pastille.
 */
export function titleBadge(title: string): number | null {
  const match = title.trim().match(TITLE_COUNTER)
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isFinite(value) || value <= 0) return null
  if (value >= 1900 && value <= 2100) return null
  return value
}

/**
 * Titre tel qu'il doit se lire dans une case : le compteur part en pastille,
 * donc « (1109) YouTube » devient « YouTube ». Sans compteur, rien ne bouge.
 */
export function displayTitle(title: string): string {
  const trimmed = title.trim()
  if (titleBadge(trimmed) === null) return trimmed
  const stripped = trimmed.replace(TITLE_COUNTER, '').trim()
  return stripped || trimmed
}

export function sameSite(a: string, b: string): boolean {
  const hostA = hostOf(a)
  return Boolean(hostA) && hostA === hostOf(b)
}
