import { app, net } from 'electron'
import { readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createIconCache, type IconStore } from '@shared/favicons'

/**
 * Icônes de sites : une requête vers le site lui-même, puis le cache local
 * (sept jours) dans les données de l'app. Aucun service tiers, aucun nouveau
 * domaine dans la liste des sorties réseau.
 *
 * Un cache par espace : ouvrir un site dans « Travail » ne laisse pas son
 * domaine dans les fichiers de « Personnel ».
 */

const MAX_BYTES = 64 * 1024
const FILE = 'favicons.json'

/** Nom de fichier sûr : l'identifiant vient du renderer, jamais du réseau. */
function cacheFile(spaceId: string): string {
  const safe = (spaceId ?? '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40)
  return join(app.getPath('userData'), safe ? `favicons-${safe}.json` : FILE)
}

function load(spaceId: string): IconStore {
  try {
    const raw = JSON.parse(readFileSync(cacheFile(spaceId), 'utf8')) as unknown
    return raw && typeof raw === 'object' ? (raw as IconStore) : {}
  } catch {
    return {}
  }
}

function save(spaceId: string, store: IconStore): void {
  try {
    writeFileSync(cacheFile(spaceId), JSON.stringify(store))
  } catch {
    /* disque plein ou en lecture seule : le cache reste en mémoire */
  }
}

async function fetchIcon(host: string): Promise<{ data: string; type: string } | null> {
  // Seul un nom d'hôte simple est accepté : pas de port, de chemin ni d'IP.
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host) || host.includes('..')) return null
  let url: URL
  try {
    url = new URL(`https://${host}/favicon.ico`)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.hostname !== host) return null

  const response = await net.fetch(url.toString(), {
    headers: { accept: 'image/*' },
    signal: AbortSignal.timeout(4000)
  })
  if (!response.ok) return null
  const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!type.startsWith('image/')) return null
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) return null
  return { data: buffer.toString('base64'), type }
}

const caches = new Map<string, ReturnType<typeof createIconCache>>()

function cacheFor(spaceId: string): ReturnType<typeof createIconCache> {
  const id = typeof spaceId === 'string' ? spaceId : ''
  const existing = caches.get(id)
  if (existing) return existing
  const created = createIconCache({
    load: () => load(id),
    save: (store) => save(id, store),
    fetchIcon
  })
  caches.set(id, created)
  return created
}

export function faviconDataUrl(host: string, spaceId = ''): Promise<string | null> {
  return cacheFor(spaceId).get(host)
}

/** Vide le cache de tous les espaces, et les fichiers correspondants. */
export function purgeFavicons(): number {
  let total = 0
  for (const cache of caches.values()) total += cache.purge()
  try {
    const dir = app.getPath('userData')
    for (const name of readdirSync(dir)) {
      // Y compris l'ancien cache unique, partagé entre espaces.
      if (name === FILE || name.startsWith('favicons-')) unlinkSync(join(dir, name))
    }
  } catch {
    /* dossier illisible : les caches mémoire sont déjà vides */
  }
  return total
}
