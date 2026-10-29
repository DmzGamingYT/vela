import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { app, powerMonitor, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import {
  macInstallerNames,
  manifestFile,
  parseMacManifest,
  releaseAssetUrl,
  type MacManifest
} from '@shared/update'
import { verifyDownload } from './integrity'

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'not-available'
  | 'error'

export interface UpdateInfo {
  state: UpdateState
  version: string | null
  currentVersion: string
  progress: number
  message: string | null
  releaseUrl: string
}

const RELEASE_URL = 'https://github.com/DmzGamingYT/vela/releases/latest'

/** Premier contrôle silencieux après le démarrage. */
const FIRST_CHECK_DELAY = 12_000
/** Contrôle périodique en arrière-plan. */
const CHECK_INTERVAL = 3 * 60 * 60 * 1000
/** Ne pas re-vérifier à chaque changement de fenêtre. */
const MIN_GAP = 30 * 60 * 1000
/** Un installateur de 150 Mo ne doit pas rester bloqué indéfiniment. */
const DOWNLOAD_TIMEOUT = 20 * 60 * 1000

let snapshot: UpdateInfo = {
  state: 'idle',
  version: null,
  currentVersion: app.getVersion(),
  progress: 0,
  message: null,
  releaseUrl: RELEASE_URL
}

let emit: ((info: UpdateInfo) => void) | null = null
let started = false
let inFlight = false
let lastCheck = 0
/** Chemin du .dmg téléchargé (macOS), prêt pour le bouton Installer. */
let installerPath: string | null = null
let installing = false
/** Manifeste d'une version déjà lu : une seule requête par version. */
const manifests = new Map<string, MacManifest | null>()

function set(patch: Partial<UpdateInfo>): void {
  snapshot = { ...snapshot, ...patch, currentVersion: app.getVersion() }
  try {
    emit?.(snapshot)
  } catch {
    /* l'UI ne doit jamais casser le main */
  }
}

function versionOf(info: unknown): string | null {
  if (typeof info === 'object' && info !== null && 'version' in info) {
    const version = (info as { version?: unknown }).version
    return typeof version === 'string' ? version : null
  }
  return null
}

export function updateStatus(): UpdateInfo {
  return { ...snapshot }
}

/** Dossier des installateurs téléchargés, dans les données de l'application. */
function installerDir(): string {
  return join(app.getPath('userData'), 'updates')
}

/**
 * Télécharge l'installateur macOS publié pour cette version.
 *
 * macOS refuse l'installation silencieuse d'un bundle non signé (Squirrel
 * vérifie la signature et échoue), donc on prépare le `.dmg` de la release :
 * le bouton Installer l'ouvre, il ne reste qu'à glisser Vela dans Applications.
 * Le fichier vient du dépôt des releases, comme la vérification elle-même.
 */
async function manifestFor(version: string): Promise<MacManifest | null> {
  if (manifests.has(version)) return manifests.get(version) ?? null
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 30_000)
  try {
    const response = await fetch(releaseAssetUrl(version, 'latest-mac.yml'), {
      redirect: 'follow',
      signal: abort.signal
    })
    const manifest = response.ok ? parseMacManifest(await response.text()) : null
    manifests.set(version, manifest)
    return manifest
  } catch {
    manifests.set(version, null)
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function prepareMacInstaller(version: string | null): Promise<void> {
  if (!version || installing) return
  if (installerPath && existsSync(installerPath)) {
    set({
      state: 'downloaded',
      version,
      progress: 100,
      message: `${installerPath.split('/').pop() ?? 'Installateur'} est prêt.`
    })
    return
  }
  const names = macInstallerNames(version, process.arch)
  if (names.length === 0) return
  // Sans manifeste, aucune empreinte : on refuse de proposer un installateur
  // qui n'a pas été vérifié, plutôt que d'ouvrir un fichier inconnu.
  const manifest = await manifestFor(version)
  if (!manifest) {
    set({
      state: 'error',
      message: 'Empreinte de l’installateur indisponible — téléchargez-la depuis la page Releases.'
    })
    return
  }
  const dir = installerDir()
  try {
    mkdirSync(dir, { recursive: true })
    // Un seul installateur gardé : celui d'une version précédente ne sert plus.
    for (const entry of readdirSync(dir)) rmSync(join(dir, entry), { force: true, recursive: true })
  } catch {
    /* dossier inaccessible : le téléchargement échouera proprement */
  }

  installing = true
  let rejected = ''
  try {
    for (const name of names) {
      const target = join(dir, name)
      const expected = manifestFile(manifest, name)
      // Fichier absent du manifeste : il n'a pas d'empreinte publiée.
      if (!expected) continue
      try {
        if (!(await downloadInstaller(releaseAssetUrl(version, name), target, version, expected))) {
          rejected = 'Installateur rejeté : son empreinte ne correspond pas à celle publiée.'
          continue
        }
        installerPath = target
        set({
          state: 'downloaded',
          version,
          progress: 100,
          message: `${name} est prêt, empreinte vérifiée.`
        })
        return
      } catch {
        rmSync(target, { force: true })
        rejected = 'Installateur rejeté : son empreinte ne correspond pas à celle publiée.'
      }
    }
    set({
      state: 'error',
      message: rejected || 'Installateur introuvable pour cette version — utilisez le bouton Releases.'
    })
  } finally {
    installing = false
  }
}

/** true si le fichier est bien téléchargé en entier. */
async function downloadInstaller(
  url: string,
  target: string,
  version: string,
  expected: { sha512: string; size: number }
): Promise<boolean> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), DOWNLOAD_TIMEOUT)
  try {
    const response = await fetch(url, { redirect: 'follow', signal: abort.signal })
    // Une version sans installateur pour cette architecture répond 404 : on
    // essaie le nom suivant.
    if (!response.ok || !response.body) return false
    const source = Readable.fromWeb(response.body as never)
    const hash = createHash('sha512')
    let received = 0
    let lastPercent = -1
    source.on('data', (chunk: Buffer) => {
      hash.update(chunk)
      received += chunk.length
      const percent = Math.min(99, Math.round((received / expected.size) * 100))
      if (percent === lastPercent) return
      lastPercent = percent
      set({
        state: 'downloading',
        version,
        progress: percent,
        message: 'Téléchargement de l’installateur en arrière-plan…'
      })
    })
    await pipeline(source, createWriteStream(target))
    const verified = verifyDownload({ base64: hash.digest('base64'), bytes: received, expected })
    if (!verified) rmSync(target, { force: true })
    return verified
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Vérifie les mises à jour.
 *
 * Windows et Linux : `electron-updater` télécharge et installe à la fermeture,
 * sans rien demander. macOS : il détecte la version, puis nous téléchargeons le
 * `.dmg` en arrière-plan — l'installation reste un glisser, faute de signature.
 */
export async function checkForUpdates(userInitiated = false): Promise<UpdateInfo> {
  if (!app.isPackaged) {
    set({
      state: 'idle',
      message: userInitiated ? 'Disponible uniquement dans la version installée (pas en dev).' : null
    })
    return updateStatus()
  }
  // Un contrôle déjà en cours suffit : on évite les requêtes concurrentes
  // (focus, réveil, minuterie) sur le même update.
  if (inFlight) return updateStatus()
  if (!userInitiated && Date.now() - lastCheck < MIN_GAP) return updateStatus()

  inFlight = true
  lastCheck = Date.now()
  set({ state: 'checking', progress: 0, message: null })
  try {
    const result = await autoUpdater.checkForUpdates()
    const version = result?.updateInfo ? versionOf(result.updateInfo) : null
    if (!result || !version || version === app.getVersion()) {
      set({ state: 'not-available', version: null, message: 'Vela est à jour.' })
    }
  } catch (error) {
    // checkForUpdates rejette quand il n'y a pas de release (réseau, 404, pas de publish).
    // On reste silencieux au démarrage auto, explicite sur demande manuelle.
    if (userInitiated) {
      set({
        state: 'error',
        message: error instanceof Error ? error.message.slice(0, 220) : 'Vérification impossible.'
      })
    } else {
      set({ state: 'idle', message: null })
    }
  } finally {
    inFlight = false
  }
  return updateStatus()
}

export async function downloadUpdate(): Promise<UpdateInfo> {
  if (process.platform === 'darwin') {
    await prepareMacInstaller(snapshot.version)
    return updateStatus()
  }
  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    set({
      state: 'error',
      message: error instanceof Error ? error.message.slice(0, 220) : 'Téléchargement impossible.'
    })
  }
  return updateStatus()
}

/**
 * Applique la mise à jour. macOS : ouvrir le `.dmg` téléchargé (Finder monte
 * l'image, un glisser installe). Ailleurs : redémarrage immédiat, sinon
 * installation à la fermeture.
 */
export function installUpdate(): void {
  if (process.platform === 'darwin') {
    if (installerPath && existsSync(installerPath)) {
      void shell.openPath(installerPath).then((error) => {
        // Image refusée ou déplacée : on retombe sur la page des releases.
        if (error) void shell.openExternal(snapshot.releaseUrl)
      })
      return
    }
    void shell.openExternal(snapshot.releaseUrl)
    return
  }
  try {
    // Silencieux : aucun assistant NSIS ne s’ouvre, Vela relance la nouvelle
    // version. C’est le même geste que l’installation à la fermeture, mais
    // tout de suite.
    autoUpdater.quitAndInstall(true, true)
  } catch {
    void shell.openExternal(snapshot.releaseUrl)
  }
}

export function openReleases(): void {
  void shell.openExternal(snapshot.releaseUrl)
}

/** À appeler une fois que la fenêtre existe : branche les events vers le renderer. */
export function initUpdater(send: (channel: string, payload: unknown) => void): void {
  if (started) return
  started = true
  emit = (info) => send('update:event', info)

  // Windows et Linux : tout est automatique, l'installation se fait à la
  // fermeture. macOS : `electron-updater` ne saurait installer qu'un bundle
  // signé, donc on garde la détection et on prépare nous-mêmes le .dmg.
  autoUpdater.autoDownload = process.platform !== 'darwin'
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.autoRunAppAfterInstall = true
  autoUpdater.allowDowngrade = false
  autoUpdater.allowPrerelease = false

  autoUpdater.on('update-available', (info) => {
    const version = versionOf(info)
    set({
      state: 'available',
      version,
      progress: 0,
      message:
        process.platform === 'darwin' ? 'Préparation de l’installateur…' : 'Téléchargement en arrière-plan…',
      releaseUrl: `https://github.com/DmzGamingYT/vela/releases/tag/v${version ?? app.getVersion()}`
    })
    if (process.platform === 'darwin') void prepareMacInstaller(version)
  })
  autoUpdater.on('update-downloaded', (info) => {
    set({
      state: 'downloaded',
      version: versionOf(info),
      progress: 100,
      message:
        process.platform === 'darwin'
          ? 'Installateur prêt — le .dmg s’ouvre, un glisser suffit.'
          : 'S’installe automatiquement à la fermeture.'
    })
  })
  autoUpdater.on('download-progress', (progress) => {
    set({
      state: 'downloading',
      progress: Math.round(progress?.percent ?? 0),
      message: 'Téléchargement en arrière-plan…'
    })
  })
  autoUpdater.on('update-not-available', () => {
    // Ne pas écraser un état manuel « à jour » déjà affiché ; rester cohérent sinon.
    if (snapshot.state === 'checking') set({ state: 'not-available', message: 'Vela est à jour.' })
  })
  autoUpdater.on('error', (error) => {
    // Les erreurs réseau/404 du contrôle automatique restent silencieuses.
    if (snapshot.state === 'downloading') {
      set({
        state: 'error',
        message: error instanceof Error ? error.message.slice(0, 220) : 'Mise à jour impossible.'
      })
    } else {
      set({ state: 'idle', message: null })
    }
  })

  if (!app.isPackaged) return

  // Contrôle silencieux au démarrage, puis toutes les 3 h…
  setTimeout(() => {
    void checkForUpdates(false)
  }, FIRST_CHECK_DELAY).unref?.()

  const timer = setInterval(() => {
    void checkForUpdates(false)
  }, CHECK_INTERVAL)
  timer.unref?.()

  // …et quand la machine ou l'app reprennent la main (retour de veille, focus).
  try {
    powerMonitor.on('resume', () => {
      void checkForUpdates(false)
    })
  } catch {
    /* powerMonitor indisponible */
  }
  app.on('browser-window-focus', () => {
    void checkForUpdates(false)
  })
}
