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

  return { get, purge, size }
}
