/**
 * Cache d'icônes de sites, par domaine. Aucun service tiers : l'icône vient du
 * site lui-même, une fois, puis reste sur l'appareil.
 *
 * La logique est ici, sans Electron ni disque, pour être testable : le process
 * principal fournit le stockage et la requête, le test fournit des doublures.
 */

export interface IconRecord {
  /** Octets base64 ; vide quand la récupération a échoué. */
  data: string
  /** Type MIME renvoyé par le site. */
  type: string
  /** Horodatage de la dernière tentative. */
  at: number
  ok: boolean
}

export type IconStore = Record<string, IconRecord>

export interface FetchedIcon {
  data: string
  type: string
}

export interface IconCacheDeps {
  load: () => IconStore
  save: (store: IconStore) => void
  fetchIcon: (host: string) => Promise<FetchedIcon | null>
  now?: () => number
}

/** Une icône valide tient sept jours ; un échec, une heure. */
export const ICON_TTL = 7 * 24 * 60 * 60 * 1000
export const ICON_FAIL_TTL = 60 * 60 * 1000
export const ICON_MAX_ENTRIES = 512

export function iconDataUrl(entry: IconRecord): string | null {
  if (!entry.ok || !entry.data) return null
  return `data:${entry.type || 'image/png'};base64,${entry.data}`
}

/** Une icône trouvée dans la page, avec sa taille déclarée quand elle existe. */
export interface IconCandidate {
  url: string
  size: number
  apple: boolean
}

/** Attribut d'une balise `<link>`, sans dépendre d'un parseur DOM. */
function attribute(tag: string, name: string): string {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : ''
}

/** Plus grande taille déclarée (`180x180`, `16x16 32x32`, `any`). */
function declaredSize(sizes: string, fallback: number): number {
  let largest = 0
  for (const token of sizes.split(/\s+/)) {
    const match = /^(\d+)x(\d+)$/i.exec(token)
    if (match) largest = Math.max(largest, Number(match[1]), Number(match[2]))
  }
  return largest || fallback
}

/** Résout une adresse d'icône, mais seulement sur le même hôte en HTTPS. */
function sameHost(raw: string, base: string): string | null {
  try {
    const url = new URL(raw.replace(/&amp;/g, '&'), base)
    if (url.protocol !== 'https:' || url.hostname !== new URL(base).hostname) return null
    return url.toString()
  } catch {
    return null
  }
}

/**
 * Icônes déclarées par une page : Apple Touch (180 px par défaut), icônes
 * classiques, et l'adresse du manifeste s'il y en a un. Les adresses
 * extérieures sont ignorées : le cache ne contacte que le site lui-même.
 */
export function iconCandidatesFromHtml(
  html: string,
  pageUrl: string
): { icons: IconCandidate[]; manifest: string | null } {
  const icons: IconCandidate[] = []
  let manifest: string | null = null
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0]
    const rel = attribute(tag, 'rel').toLowerCase().split(/\s+/).filter(Boolean)
    const href = attribute(tag, 'href')
    if (!href) continue
    if (rel.includes('manifest')) {
      manifest ??= sameHost(href, pageUrl)
      continue
    }
    const apple = rel.some((name) => name.startsWith('apple-touch-icon'))
    if (!apple && !rel.includes('icon')) continue
    const url = sameHost(href, pageUrl)
    if (!url) continue
    const type = attribute(tag, 'type').toLowerCase()
    icons.push({
      url,
      size: declaredSize(attribute(tag, 'sizes'), apple ? 180 : type.includes('svg') ? 512 : 32),
      apple
    })
  }
  return { icons, manifest }
}

/** Icônes d'un manifeste web, résolues sur le même hôte que le manifeste. */
export function iconCandidatesFromManifest(raw: unknown, manifestUrl: string): IconCandidate[] {
  const icons = (raw as { icons?: unknown } | null)?.icons
  if (!Array.isArray(icons)) return []
  const found: IconCandidate[] = []
  for (const entry of icons) {
    if (!entry || typeof entry !== 'object') continue
    const { src, sizes, type } = entry as { src?: unknown; sizes?: unknown; type?: unknown }
    if (typeof src !== 'string') continue
    const url = sameHost(src, manifestUrl)
    if (!url) continue
    const svg = typeof type === 'string' && type.toLowerCase().includes('svg')
    found.push({
      url,
      size: declaredSize(typeof sizes === 'string' ? sizes : '', svg ? 512 : 0),
      apple: false
    })
  }
  return found
}

/**
 * Classe les icônes de la plus grande à la plus petite, puis préfère l'Apple
 * Touch à taille égale. Une même adresse ne compte qu'une fois.
 */
export function rankIconCandidates(candidates: IconCandidate[]): IconCandidate[] {
  const best = new Map<string, IconCandidate>()
  for (const candidate of candidates) {
    const known = best.get(candidate.url)
    if (
      !known ||
      candidate.size > known.size ||
      (candidate.size === known.size && candidate.apple && !known.apple)
    ) {
      best.set(candidate.url, candidate)
    }
  }
  return [...best.values()].sort(
    (a, b) => b.size - a.size || Number(b.apple) - Number(a.apple)
  )
}

/** La meilleure adresse d'icône, ou null si la page n'en déclare aucune. */
export function bestIconCandidate(candidates: IconCandidate[]): string | null {
  return rankIconCandidates(candidates)[0]?.url ?? null
}

export function createIconCache(deps: IconCacheDeps) {
  let store: IconStore = deps.load() ?? {}
  const now = deps.now ?? Date.now
  const inflight = new Map<string, Promise<string | null>>()

  function fresh(host: string): IconRecord | null {
    const entry = store[host]
    if (!entry) return null
    const ttl = entry.ok ? ICON_TTL : ICON_FAIL_TTL
    return now() - entry.at < ttl ? entry : null
  }

  function trim(): void {
    const keys = Object.keys(store)
    if (keys.length <= ICON_MAX_ENTRIES) return
    keys.sort((a, b) => store[a].at - store[b].at)
    for (const key of keys.slice(0, keys.length - ICON_MAX_ENTRIES)) delete store[key]
  }

  function record(host: string, icon: FetchedIcon | null): void {
    store[host] = icon
      ? { data: icon.data, type: icon.type, at: now(), ok: true }
      : { data: '', type: '', at: now(), ok: false }
    trim()
    deps.save(store)
  }

  /** Data URL de l'icône, ou null. Dix montages ne font qu'une requête. */
  async function get(host: string): Promise<string | null> {
    const key = host.trim().toLowerCase()
    if (!key) return null
    const cached = fresh(key)
    if (cached) return iconDataUrl(cached)
    const pending = inflight.get(key)
    if (pending) return pending

    const task = (async (): Promise<string | null> => {
      try {
        record(key, await deps.fetchIcon(key))
        return iconDataUrl(store[key])
      } catch {
        record(key, null)
        return null
      } finally {
        inflight.delete(key)
      }
    })()
    inflight.set(key, task)
    return task
  }

  /**
   * Lecture seule : renvoie l'icône déjà sur l'appareil, même périmée, sans
   * jamais contacter le réseau. Sert aux aperçus qui ne doivent déclencher
   * aucune requête (fenêtre d'espace).
   */
  function peek(host: string): string | null {
    const key = host.trim().toLowerCase()
    if (!key) return null
    const entry = store[key]
    return entry ? iconDataUrl(entry) : null
  }

  /** Vide le cache ; renvoie le nombre d'entrées supprimées. */
  function purge(): number {
    const count = Object.keys(store).length
    store = {}
    inflight.clear()
    deps.save(store)
    return count
  }

  function size(): number {
    return Object.keys(store).length
  }

  return { get, peek, purge, size }
}
