import { HOME_URL, type BuiltinSearchEngineId, type SearchEngineId } from './types'

interface Engine {
  label: string
  build: (query: string) => string
}

export const SEARCH_ENGINES: Record<BuiltinSearchEngineId, Engine> = {
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

/** Moteurs intégrés, dans l'ordre de la grille des réglages. */
export const BUILTIN_ENGINES = Object.keys(SEARCH_ENGINES) as BuiltinSearchEngineId[]

export function isBuiltinEngine(value: unknown): value is BuiltinSearchEngineId {
  return typeof value === 'string' && value in SEARCH_ENGINES
}

/** Nom lisible : celui du moteur intégré, ou celui du moteur ajouté à la main. */
export function engineLabel(engine: SearchEngineId, customName?: string | null): string {
  if (engine === 'custom') return customName?.trim() || 'Moteur ajouté'
  return SEARCH_ENGINES[engine]?.label ?? 'Moteur'
}

export interface KeywordRule {
  keyword: string
  engine: SearchEngineId
  customTemplate?: string | null
}

/** Contexte de recherche : moteur retenu, instance, moteur ajouté, mots-clés. */
export interface EngineOptions {
  engine: SearchEngineId
  searxInstance?: string | null
  customTemplate?: string | null
  keywords?: KeywordRule[]
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

/** Modèle d'adresse fourni par l'utilisateur : https uniquement, un %s. */
function renderTemplate(template: string | null | undefined, query: string): string | null {
  if (!template || !/^https:\/\//i.test(template)) return null
  if ((template.match(/%s/g) ?? []).length !== 1) return null
  try {
    const url = template.replace('%s', encodeURIComponent(query))
    const parsed = new URL(url)
    return parsed.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

export function searchUrl(
  query: string,
  engine: SearchEngineId,
  searxInstance?: string | null,
  customTemplate?: string | null
): string {
  if (engine === 'custom') {
    return renderTemplate(customTemplate, query) ?? SEARCH_ENGINES.duckduckgo.build(query)
  }
  if (engine === 'searxng')
    return `${searxBase(searxInstance)}/search?q=${encodeURIComponent(query)}`
  return (SEARCH_ENGINES[engine as BuiltinSearchEngineId] ?? SEARCH_ENGINES.duckduckgo).build(query)
}

/** Hôte du moteur, pour pré-connecter (DNS + TLS) avant la première recherche. */
export function engineHost(
  engine: SearchEngineId,
  searxInstance?: string | null,
  customTemplate?: string | null
): string {
  try {
    return (
      new URL(searchUrl('test', engine, searxInstance, customTemplate)).hostname || 'duckduckgo.com'
    )
  } catch {
    return 'duckduckgo.com'
  }
}

/* ------------------------------------------------------------------ */
/* Titres de l'accueil                                                */
/* ------------------------------------------------------------------ */

const TITLE_URL = /^(?:[a-z][a-z0-9+.-]*:\/\/|www\.)/i
const TITLE_BARE_HOST =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?::\d+)?$/i

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
  const text = stripCounters(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
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

const HOST_LIKE =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?::\d+)?(?:[/?#]|$)/i
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:[/?#]|$)/i
const SCHEME = /^[a-z][a-z0-9+.-]*:/i

export function isHomeUrl(url: string | null | undefined): boolean {
  return !url || url === HOME_URL
}

/**
 * Schémas qu'une vue native peut charger : le web, la page blanche et
 * l'accueil interne.
 *
 * Tout le reste — `file:`, `data:`, `chrome:`, `devtools:` — est refusé. Une
 * adresse peut venir d'une page visitée ou d'un modèle, pas seulement de
 * l'utilisateur : la charger dans une vue donnerait au contenu un accès au
 * disque que la barre d'adresse, elle, ne permet jamais.
 */
export function isLoadableUrl(url: string | null | undefined): boolean {
  const value = (url ?? '').trim()
  if (!value) return false
  if (isHomeUrl(value)) return true
  const lower = value.toLowerCase()
  if (lower === 'about:blank') return true
  return lower.startsWith('http://') || lower.startsWith('https://')
}

/**
 * Hôte public : ni adresse IP, ni nom de machine locale.
 *
 * Une requête partie du processus principal (icône d'un site, planche d'une
 * bande dessinée) ne doit jamais atteindre la box, le NAS ou le service de
 * métadonnées du fournisseur — même si la page visitée le demande.
 */
export function isPublicHost(host: string | null | undefined): boolean {
  const name = (host ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
  if (!name) return false
  if (name === 'localhost' || name.endsWith('.localhost')) return false
  if (name.endsWith('.local') || name.endsWith('.internal') || name.endsWith('.home.arpa'))
    return false

  // IPv6 : boucle locale, adresses uniques locales, lien local.
  if (name.includes(':')) {
    if (name === '::1' || name === '::') return false
    if (/^f[cd][0-9a-f]{2}:/.test(name)) return false
    if (/^fe[89ab][0-9a-f]:/.test(name)) return false
    return true
  }

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(name)
  if (!ipv4) return true
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])]
  if ([a, b, Number(ipv4[3]), Number(ipv4[4])].some((part) => part > 255)) return false
  if (a === 0 || a === 10 || a === 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 192 && b === 0) return false
  if (a === 198 && (b === 18 || b === 19)) return false
  if (a >= 224) return false
  return true
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

export interface Target {
  url: string
  kind: 'url' | 'search'
}

/** Réglage de mot-clé : « g verre » part sur Google, sans toucher au reste. */
function keywordTarget(
  input: string,
  keywords?: KeywordRule[]
): { rule: KeywordRule; query: string } | null {
  if (!keywords || keywords.length === 0) return null
  const match = input.match(/^([a-z0-9]{1,12})\s+(.+)$/i)
  if (!match) return null
  const rule = keywords.find((entry) => entry.keyword.toLowerCase() === match[1].toLowerCase())
  if (!rule) return null
  return { rule, query: match[2].trim() }
}

/**
 * Transforme ce que l'utilisateur tape en adresse ou en recherche.
 * Tout schéma exotique (javascript:, data:, file:) part en recherche : jamais exécuté.
 */
export function normalizeInput(
  raw: string,
  engineOrOptions: SearchEngineId | EngineOptions = 'duckduckgo',
  searxInstance?: string | null,
  extra?: { customTemplate?: string | null; keywords?: KeywordRule[] }
): Target {
  const options: EngineOptions =
    typeof engineOrOptions === 'string'
      ? {
          engine: engineOrOptions,
          searxInstance: searxInstance ?? '',
          customTemplate: extra?.customTemplate ?? null,
          keywords: extra?.keywords ?? []
        }
      : engineOrOptions
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

  const shortcut = keywordTarget(input, options.keywords)
  if (shortcut) {
    return {
      url: searchUrl(
        shortcut.query,
        shortcut.rule.engine,
        options.searxInstance,
        shortcut.rule.customTemplate
      ),
      kind: 'search'
    }
  }

  return {
    url: searchUrl(input, options.engine, options.searxInstance, options.customTemplate),
    kind: 'search'
  }
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
