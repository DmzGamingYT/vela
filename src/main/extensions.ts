import { app, dialog, type Extension, type Session } from 'electron'
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
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
 * y compris celles créées plus tard (`attachExtensions` à la création). Le
 * chargement a lieu au démarrage, avant la première fenêtre : attendre qu'une
 * page s'ouvre laissait la liste annoncer « chargée » sans qu'aucune session
 * n'ait rien chargé.
 *
 * Un échec est mémorisé sur la fiche (`error`) : sans cela, un dossier déplacé
 * ou un manifeste cassé ne laissait qu'une icône-lettre, et l'interrupteur
 * semblait n'avoir aucun effet.
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
  /** Raison du dernier échec de chargement, effacée dès qu'il réussit. */
  error: string | null
}

const FILE = 'extensions.json'
const sessions = new Set<Session>()
/** Dossiers déjà tentés par session : ouvrir un onglet ne recharge pas tout. */
const attempted = new WeakMap<Session, Set<string>>()
let store: StoredExtension[] | null = null

function file(): string {
  return join(app.getPath('userData'), FILE)
}

/** Chemin réel : deux choix du même dossier (lien, barre oblique) sont une fiche. */
function canonical(dir: string): string {
  try {
    return realpathSync(dir)
  } catch {
    return dir
  }
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
              icon: typeof item.icon === 'string' ? item.icon : null,
              error: typeof item.error === 'string' && item.error ? item.error : null
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
    enabled: entry.enabled,
    error: entry.error
  }))
}

function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? 'Extension'
}

/** Message court en français ; le texte de Chromium reste le dernier recours. */
function loadError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : ''
  if (/Extension directory not found/i.test(message)) {
    return 'Dossier introuvable : il a été déplacé ou supprimé.'
  }
  if (/Manifest file is missing or unreadable/i.test(message)) {
    return 'Pas de manifest.json lisible dans ce dossier.'
  }
  if (/is not supported|unsupported/i.test(message)) {
    return 'Version de manifeste non prise en charge par Chromium.'
  }
  return message || 'Chargement refusé par Chromium.'
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
  const path = canonical(dir)
  try {
    const raw = JSON.parse(readFileSync(join(path, 'manifest.json'), 'utf8')) as Record<string, unknown>
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : folderName(path)
    const manifestVersion = Number(raw.manifest_version)
    if (manifestVersion !== 2 && manifestVersion !== 3) return null
    return {
      path,
      enabled: true,
      id: '',
      name,
      version: typeof raw.version === 'string' ? raw.version : '',
      description: typeof raw.description === 'string' ? raw.description : '',
      icon: await manifestIcon(path, raw.icons),
      error: null
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

function attemptsFor(ses: Session): Set<string> {
  let set = attempted.get(ses)
  if (!set) {
    set = new Set()
    attempted.set(ses, set)
  }
  return set
}

/**
 * Charge les extensions actives dans une session (espace).
 *
 * Renvoie quand toutes les tentatives sont terminées : le démarrage attend ce
 * résultat avant d'ouvrir la fenêtre, pour que la première page ait déjà les
 * extensions. Un même dossier n'est pas retenté à chaque onglet.
 */
export async function attachExtensions(ses: Session): Promise<void> {
  sessions.add(ses)
  const tried = attemptsFor(ses)
  await Promise.all(
    read().map(async (record) => {
      if (!record.enabled) return
      const path = canonical(record.path)
      if (tried.has(path)) return
      tried.add(path)
      try {
        applyInfo(record, await ses.extensions.loadExtension(path, { allowFileAccess: true }))
        record.error = null
        await fillIcon(record)
        save()
      } catch (cause) {
        record.error = loadError(cause)
        save()
      }
    })
  )
}

async function loadEverywhere(record: StoredExtension): Promise<string | null> {
  const path = canonical(record.path)
  let error: string | null = null
  for (const ses of sessions) {
    attemptsFor(ses).delete(path)
    try {
      applyInfo(record, await ses.extensions.loadExtension(path, { allowFileAccess: true }))
      attemptsFor(ses).add(path)
      await fillIcon(record)
      record.error = null
    } catch (cause) {
      error = loadError(cause)
      record.error = error
    }
  }
  save()
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
    attemptsFor(ses).delete(canonical(record.path))
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
  const chosen = picked.filePaths[0]
  if (picked.canceled || !chosen) return { ok: false, extensions: list() }
  const dir = canonical(chosen)
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
    // Décrite mais non chargée : la fiche reste, désactivée, avec la raison.
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
  record.error = null
  save()
  return { ok: true, extensions: list() }
}

/** Nouvelle tentative après un dossier réparé : la raison disparaît si ça passe. */
export async function reloadExtension(
  path: string
): Promise<{ ok: boolean; error?: string; extensions: InstalledExtension[] }> {
  const record = read().find((entry) => entry.path === path)
  if (!record) return { ok: false, error: 'Extension inconnue.', extensions: list() }
  record.enabled = true
  const error = await loadEverywhere(record)
  if (error) record.enabled = false
  save()
  return { ok: !error, ...(error ? { error } : {}), extensions: list() }
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
