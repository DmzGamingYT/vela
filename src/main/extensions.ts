import { app, dialog, type Extension, type Session } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { InstalledExtension } from '@shared/extensions'

/**
 * Extensions du Chrome Web Store, chargées depuis un dossier décompressé.
 *
 * Azimut ne télécharge rien : l'utilisateur décompresse l'extension, choisit
 * son dossier, et le gestionnaire la charge dans chaque session d'espace. Une
 * extension désactivée est retirée de la session, pas seulement grisée — c'est
 * Chromium qui décide, et le résultat se voit dans la page.
 *
 * Chaque espace a sa session : une extension active est chargée dans toutes,
 * y compris celles créées plus tard (`attachExtensions` à la création).
 */

interface StoredExtension {
  /** Dossier source : identité stable, même si Chromium change l'identifiant. */
  path: string
  enabled: boolean
  id: string
  name: string
  version: string
  description: string
  icon: string | null
}

const FILE = 'extensions.json'
const sessions = new Set<Session>()
let store: StoredExtension[] | null = null

function file(): string {
  return join(app.getPath('userData'), FILE)
}

function read(): StoredExtension[] {
  if (store) return store
  try {
    const raw = JSON.parse(readFileSync(file(), 'utf8')) as unknown
    store = Array.isArray(raw)
      ? raw.flatMap((entry): StoredExtension[] => {
          if (!entry || typeof entry !== 'object') return []
          const item = entry as Record<string, unknown>
          if (typeof item.path !== 'string' || !item.path) return []
          return [
            {
              path: item.path,
              enabled: item.enabled !== false,
              id: typeof item.id === 'string' ? item.id : '',
              name: typeof item.name === 'string' ? item.name : '',
              version: typeof item.version === 'string' ? item.version : '',
              description: typeof item.description === 'string' ? item.description : '',
              icon: typeof item.icon === 'string' ? item.icon : null
            }
          ]
        })
      : []
  } catch {
    store = []
  }
  return store
}

function save(): void {
  try {
    writeFileSync(file(), JSON.stringify(read()), 'utf8')
  } catch {
    /* disque en lecture seule : la liste reste en mémoire */
  }
}

function list(): InstalledExtension[] {
  return read().map((entry) => ({
    id: entry.path,
    name: entry.name || folderName(entry.path),
    version: entry.version,
    description: entry.description,
    icon: entry.icon,
    path: entry.path,
    enabled: entry.enabled
  }))
}

function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? 'Extension'
}

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon'
}

/** Plus grande icône du manifeste, en data URL (une extension peut n'en avoir aucune). */
async function manifestIcon(dir: string, icons: unknown): Promise<string | null> {
  if (!icons || typeof icons !== 'object') return null
  const entries = Object.entries(icons as Record<string, unknown>)
    .flatMap(([size, value]) => (typeof value === 'string' ? [{ size: Number(size) || 0, value }] : []))
    .sort((a, b) => b.size - a.size)
  for (const { value } of entries) {
    const relative = value.replace(/^\/+/, '')
    const target = join(dir, relative)
    if (!existsSync(target)) continue
    try {
      const bytes = await readFile(target)
      if (!bytes.length || bytes.length > 256 * 1024) continue
      const mime = MIME[extname(target).toLowerCase()] ?? 'image/png'
      return `data:${mime};base64,${bytes.toString('base64')}`
    } catch {
      /* icône illisible : on garde la lettre de secours */
    }
  }
  return null
}

/** Lit le manifeste d'un dossier et prépare son enregistrement. */
async function describe(dir: string): Promise<StoredExtension | null> {
  try {
    const raw = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Record<string, unknown>
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : folderName(dir)
    const manifestVersion = Number(raw.manifest_version)
    if (manifestVersion !== 2 && manifestVersion !== 3) return null
    return {
      path: dir,
      enabled: true,
      id: '',
      name,
      version: typeof raw.version === 'string' ? raw.version : '',
      description: typeof raw.description === 'string' ? raw.description : '',
      icon: await manifestIcon(dir, raw.icons)
    }
  } catch {
    return null
  }
}

function applyInfo(record: StoredExtension, info: Extension): void {
  record.id = info.id
  record.name = info.name || record.name
  record.version = info.version || record.version
}

/** Une fiche ancienne (ou écrite à la main) retrouve l'icône de son manifeste. */
async function fillIcon(record: StoredExtension): Promise<void> {
  if (record.icon) return
  const described = await describe(record.path)
  if (described?.icon) {
    record.icon = described.icon
    save()
  }
}

/** Charge les extensions actives dans une session (espace). */
export function attachExtensions(ses: Session): void {
  sessions.add(ses)
  for (const record of read()) {
    if (!record.enabled) continue
    void ses.extensions
      .loadExtension(record.path, { allowFileAccess: true })
      .then(async (info) => {
        applyInfo(record, info)
        await fillIcon(record)
        save()
      })
      .catch(() => undefined)
  }
}

async function loadEverywhere(record: StoredExtension): Promise<string | null> {
  let error: string | null = null
  for (const ses of sessions) {
    try {
      applyInfo(record, await ses.extensions.loadExtension(record.path, { allowFileAccess: true }))
      await fillIcon(record)
      save()
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'chargement refusé'
    }
  }
  return error
}

function removeEverywhere(record: StoredExtension): void {
  if (!record.id) return
  for (const ses of sessions) {
    try {
      ses.extensions.removeExtension(record.id)
    } catch {
      /* déjà retirée de cette session */
    }
  }
}

export async function installExtension(): Promise<{
  ok: boolean
  error?: string
  extensions: InstalledExtension[]
}> {
  const picked = await dialog.showOpenDialog({
    title: 'Choisir le dossier d’une extension décompressée',
    message: 'Le dossier doit contenir manifest.json.',
    properties: ['openDirectory']
  })
  const dir = picked.filePaths[0]
  if (picked.canceled || !dir) return { ok: false, extensions: list() }
  if (read().some((entry) => entry.path === dir)) {
    return { ok: false, error: 'Cette extension est déjà dans la liste.', extensions: list() }
  }
  const record = await describe(dir)
  if (!record) {
    return {
      ok: false,
      error: 'Dossier sans manifest.json valide (manifest_version 2 ou 3).',
      extensions: list()
    }
  }
  read().push(record)
  save()
  const error = await loadEverywhere(record)
  if (error) {
    // Décrit mais non chargée : la fiche reste, désactivée, avec la raison.
    record.enabled = false
    save()
  }
  return { ok: !error, ...(error ? { error } : {}), extensions: list() }
}

export async function setExtensionEnabled(
  path: string,
  enabled: boolean
): Promise<{ ok: boolean; error?: string; extensions: InstalledExtension[] }> {
  const record = read().find((entry) => entry.path === path)
  if (!record) return { ok: false, error: 'Extension inconnue.', extensions: list() }
  record.enabled = enabled
  if (enabled) {
    const error = await loadEverywhere(record)
    if (error) record.enabled = false
    save()
    return { ok: !error, ...(error ? { error } : {}), extensions: list() }
  }
  removeEverywhere(record)
  save()
  return { ok: true, extensions: list() }
}

export function removeExtension(path: string): InstalledExtension[] {
  const record = read().find((entry) => entry.path === path)
  if (record) {
    removeEverywhere(record)
    store = read().filter((entry) => entry.path !== path)
    save()
  }
  return list()
}

export function managedExtensions(): InstalledExtension[] {
  return list()
}
