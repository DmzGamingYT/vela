import { app, net } from 'electron'
import { readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createIconCache,
  iconCandidatesFromHtml,
  iconCandidatesFromManifest,
  rankIconCandidates,
  type IconStore
} from '@shared/favicons'

/**
 * Icônes de sites : une requête vers le site lui-même, puis le cache local
 * (sept jours) dans les données de l'app. Aucun service tiers, aucun nouveau
 * domaine dans la liste des sorties réseau.
 *
 * Un cache par espace : ouvrir un site dans « Travail » ne laisse pas son
 * domaine dans les fichiers de « Personnel ».
 */

const MAX_BYTES = 256 * 1024
const MAX_PAGE_BYTES = 256 * 1024
const MAX_MANIFEST_BYTES = 128 * 1024
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

/** Nom d'hôte simple : pas de port, de chemin ni d'IP. */
function validHost(host: string): boolean {
  return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host) && !host.includes('..')
}

/** Texte du site (page ou manifeste), sur le même hôte et en HTTPS seulement. */
async function fetchText(url: string, host: string, max: number): Promise<string | null> {
  try {
    const target = new URL(url)
    if (target.protocol !== 'https:' || target.hostname !== host) return null
    const response = await net.fetch(target.toString(), {
      headers: { accept: 'text/html,application/manifest+json,application/json;q=0.9,*/*;q=0.5' },
      signal: AbortSignal.timeout(4000)
    })
    if (!response.ok || new URL(response.url).hostname !== host) return null
    const text = await response.text()
    if (!text || text.length > max) return null
    return text
  } catch {
    return null
  }
}

async function fetchImage(url: string, host: string): Promise<{ data: string; type: string } | null> {
  try {
    const target = new URL(url)
    if (target.protocol !== 'https:' || target.hostname !== host) return null
    const response = await net.fetch(target.toString(), {
      headers: { accept: 'image/*' },
      signal: AbortSignal.timeout(4000)
    })
    // Un site ne doit pas nous envoyer vers un autre domaine pour son icône.
    if (!response.ok || new URL(response.url).hostname !== host) return null
    const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!type.startsWith('image/')) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) return null
    return { data: buffer.toString('base64'), type }
  } catch {
    return null
  }
}

/**
 * Meilleure icône du site : Apple Touch ou icône du manifeste, puis favicon.ico.
 * La page est lue une fois, et seules les adresses de son propre hôte sont
 * retenues : le cache ne devient pas un client HTTP généraliste.
 */
async function fetchIcon(host: string): Promise<{ data: string; type: string } | null> {
  if (!validHost(host)) return null
  const base = `https://${host}/`
  const page = await fetchText(base, host, MAX_PAGE_BYTES)
  const declared = page ? iconCandidatesFromHtml(page, base) : { icons: [], manifest: null }
  let candidates = declared.icons

  if (declared.manifest) {
    const raw = await fetchText(declared.manifest, host, MAX_MANIFEST_BYTES)
    if (raw) {
      try {
        candidates = candidates.concat(iconCandidatesFromManifest(JSON.parse(raw), declared.manifest))
      } catch {
        /* manifeste illisible : les icônes de la page suffisent */
      }
    }
  }

  const fallback = { url: `${base}favicon.ico`, size: 0, apple: false }
  for (const candidate of [...rankIconCandidates(candidates).slice(0, 2), fallback]) {
    const icon = await fetchImage(candidate.url, host)
    if (icon) return icon
  }
  return null
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

/** Lecture seule du cache : aucune requête, même si l'icône a expiré. */
export function faviconCachedDataUrl(host: string, spaceId = ''): string | null {
  return cacheFor(spaceId).peek(host)
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
