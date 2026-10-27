import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AVATAR_FILE, MAX_AVATAR_BYTES, MAX_AVATAR_LENGTH } from '@shared/space'

/**
 * Photos d'avatar : un fichier dans `avatars/` du dossier de données, jamais
 * une data URL dans vela.json. Le nom est l'empreinte du contenu, donc deux
 * espaces qui choisissent la même photo partagent le même fichier.
 */

const DATA_URL = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/i

export function avatarDir(dir: string): string {
  return join(dir, 'avatars')
}

function avatarPath(dir: string, name: string): string {
  return join(avatarDir(dir), name)
}

function extensionOf(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}

function mimeOf(name: string): string {
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

/**
 * Écrit une data URL validée et renvoie `image:file:<nom>`. `null` si l'image
 * est refusée (format inconnu, plus de 512 Ko une fois décodée, disque en
 * erreur) : l'appelant garde alors l'avatar précédent.
 */
export function saveAvatarDataUrl(dir: string, value: string): string | null {
  if (typeof value !== 'string' || !value.startsWith('image:data:')) return null
  const dataUrl = value.slice(6)
  if (dataUrl.length > MAX_AVATAR_LENGTH * 4) return null
  const match = DATA_URL.exec(dataUrl)
  if (!match) return null

  const mime = `image/${match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase()}`
  let bytes: Buffer
  try {
    bytes = Buffer.from(match[2], 'base64')
  } catch {
    return null
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_AVATAR_BYTES) return null

  const name = `${createHash('sha1').update(bytes).digest('hex').slice(0, 24)}.${extensionOf(mime)}`
  if (!AVATAR_FILE.test(name)) return null
  if (existsSync(avatarPath(dir, name))) return `image:file:${name}`

  try {
    mkdirSync(avatarDir(dir), { recursive: true })
    writeFileSync(avatarPath(dir, name), bytes)
  } catch {
    return null
  }
  return `image:file:${name}`
}

/** Data URL d'un avatar stocké, ou null si le fichier a disparu. */
export function readAvatarDataUrl(dir: string, name: string): string | null {
  if (!AVATAR_FILE.test(name)) return null
  try {
    const bytes = readFileSync(avatarPath(dir, name))
    return `data:${mimeOf(name)};base64,${bytes.toString('base64')}`
  } catch {
    return null
  }
}

/** Supprime les fichiers que plus aucun espace ne référence. Renvoie le nombre. */
export function pruneAvatars(dir: string, referenced: Set<string>): number {
  let removed = 0
  let names: string[]
  try {
    names = readdirSync(avatarDir(dir))
  } catch {
    return 0
  }
  for (const name of names) {
    if (!AVATAR_FILE.test(name) || referenced.has(name)) continue
    try {
      unlinkSync(avatarPath(dir, name))
      removed += 1
    } catch {
      /* fichier déjà parti : rien à faire */
    }
  }
  return removed
}
