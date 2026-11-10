import { createHash } from 'node:crypto'
import {
  accessSync,
  chmodSync,
  constants,
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync
} from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { app, powerMonitor, shell } from 'electron'
import { autoUpdater, CancellationToken } from 'electron-updater'
import type { UpdateChannel } from '@shared/api'
import type { UpdateChecks } from '@shared/types'
import {
  isNewerVersion,
  latestAssetUrl,
  linuxAppImageNames,
  macInstallerNames,
  manifestFile,
  parseMacManifest,
  parseManifest,
  releaseAssetUrl,
  type MacManifest
} from '@shared/update'
import { manifestSignatureValid, verifyDownload } from './integrity'

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'cancelled'
  | 'not-available'
  | 'error'

export interface UpdateInfo {
  state: UpdateState
  version: string | null
  currentVersion: string
  progress: number
  message: string | null
  releaseUrl: string
  channel: UpdateChannel
  appImagePath: string | null
  appImageWritable: boolean
}

const RELEASE_URL = 'https://github.com/DmzGamingYT/vela/releases/latest'

/**
 * Sur Linux, l'AppImage est le seul format que Vela peut remplacer lui-même.
 * `APPIMAGE` n'existe pas quand l'app tourne depuis un .deb, un paquet natif
 * ou un binaire extrait : c'est la première chose à diagnostiquer.
 */
function currentAppImage(): string | null {
  if (process.platform !== 'linux') return null
  const value = process.env.APPIMAGE?.trim()
  return value ? value : null
}

function canWriteFile(path: string | null): boolean {
  if (!path) return false
  try {
    accessSync(path, constants.W_OK)
    return true
  } catch {
    return false
  }
}

function updateChannel(): UpdateChannel {
  if (process.platform === 'darwin') return 'mac'
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'linux') return currentAppImage() ? 'appimage' : 'linux-package'
  return 'other'
}

/** Premier contrôle silencieux après le démarrage. */
const FIRST_CHECK_DELAY = 12_000
/** Contrôle périodique en arrière-plan. */
const CHECK_INTERVAL = 3 * 60 * 60 * 1000
/** Ne pas re-vérifier à chaque changement de fenêtre. */
const MIN_GAP = 30 * 60 * 1000
/** Un installateur de 150 Mo ne doit pas rester bloqué indéfiniment. */
const DOWNLOAD_TIMEOUT = 20 * 60 * 1000
/** Rythme espacé choisi dans les réglages. */
const WEEKLY_INTERVAL = 7 * 24 * 60 * 60 * 1000

let snapshot: UpdateInfo = {
  state: 'idle',
  version: null,
  currentVersion: app.getVersion(),
  progress: 0,
  message: null,
  releaseUrl: RELEASE_URL,
  channel: updateChannel(),
  appImagePath: currentAppImage(),
  appImageWritable: canWriteFile(currentAppImage())
}

let emit: ((info: UpdateInfo) => void) | null = null
let started = false
let inFlight = false
let lastCheck = 0
/** Rythme du contrôle automatique, réglé depuis les préférences. */
let policy: UpdateChecks = 'auto'
let firstTimer: NodeJS.Timeout | null = null
let intervalTimer: NodeJS.Timeout | null = null
/** Chemin du .dmg téléchargé (macOS), prêt pour le bouton Installer. */
let installerPath: string | null = null
let installing = false
/** Téléchargement macOS/Linux en cours, annulable par l’utilisateur. */
let activeDownload: AbortController | null = null
/** Téléchargement electron-updater sous Windows, annulable par jeton. */
let windowsCancellation: CancellationToken | null = null
/** AppImage Linux proposée par la dernière release lue. */
let linuxRelease: { version: string; file: { url: string; sha512: string; size: number } } | null =
  null
let linuxDownloading = false
/** Manifeste d'une version déjà lu : une seule requête par version. */
const manifests = new Map<string, MacManifest | null>()
/** Version dont le manifeste n'était pas signé : sert au message d'erreur. */
let unsignedVersion = ''

function set(patch: Partial<UpdateInfo>): void {
  snapshot = {
    ...snapshot,
    ...patch,
    currentVersion: app.getVersion(),
    channel: updateChannel(),
    appImagePath: currentAppImage(),
    appImageWritable: canWriteFile(currentAppImage())
  }
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

function clearSchedule(): void {
  if (firstTimer) clearTimeout(firstTimer)
  if (intervalTimer) clearInterval(intervalTimer)
  firstTimer = null
  intervalTimer = null
}

/**
 * (Re)programme le contrôle silencieux. « Jamais » ne supprime pas le bouton
 * manuel : seul le contrôle automatique s'arrête.
 */
function scheduleUpdates(): void {
  clearSchedule()
  if (!started || !app.isPackaged || policy === 'off') return
  firstTimer = setTimeout(() => {
    void checkForUpdates(false)
  }, FIRST_CHECK_DELAY)
  firstTimer.unref?.()
  intervalTimer = setInterval(
    () => {
      void checkForUpdates(false)
    },
    policy === 'weekly' ? WEEKLY_INTERVAL : CHECK_INTERVAL
  )
  intervalTimer.unref?.()
}

/** Changement de réglage à chaud : le nouveau rythme s'applique sans redémarrer. */
export function setUpdaterPolicy(next: UpdateChecks): void {
  if (next === policy) return
  policy = next
  scheduleUpdates()
}

/** Passe par une fonction : le narrowing de TypeScript ne voit pas les set() imbriqués. */
function downloadCancelled(): boolean {
  return snapshot.state === 'cancelled'
}

/** Dossier des installateurs téléchargés, dans les données de l'application. */
function installerDir(): string {
  return join(app.getPath('userData'), 'updates')
}

/**
 * Efface les installateurs téléchargés : un .dmg de 150 Mo ne sert qu'une fois,
 * et Finder garde l'image montée même quand le fichier disparaît du disque.
 */
function clearInstallers(): void {
  try {
    for (const entry of readdirSync(installerDir())) {
      rmSync(join(installerDir(), entry), { force: true, recursive: true })
    }
  } catch {
    /* dossier absent ou protégé : rien à faire */
  }
  installerPath = null
}

/**
 * Télécharge l'installateur macOS publié pour cette version.
 *
 * macOS refuse l'installation silencieuse d'un bundle non signé (Squirrel
 * vérifie la signature et échoue), donc on prépare le `.dmg` de la release :
 * le bouton Installer l'ouvre, il ne reste qu'à glisser Vela dans Applications.
 *
 * Le manifeste et sa signature Ed25519 arrivent du même canal que la charge
 * utile : lire l'un sans contrôler l'autre laisserait un compte GitHub
 * compromis choisir les empreintes SHA-512. Sans signature valable, la mise à
 * jour n'est tout simplement pas proposée.
 */
async function manifestFor(version: string): Promise<MacManifest | null> {
  if (manifests.has(version)) return manifests.get(version) ?? null
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 30_000)
  try {
    const ymlUrl = releaseAssetUrl(version, 'latest-mac.yml')
    const [yml, signature] = await Promise.all([
      fetch(ymlUrl, { redirect: 'follow', signal: abort.signal }),
      fetch(`${ymlUrl}.sig`, { redirect: 'follow', signal: abort.signal })
    ])
    if (!yml.ok) {
      manifests.set(version, null)
      return null
    }
    const bytes = Buffer.from(await yml.arrayBuffer())
    const signed = signature.ok && manifestSignatureValid(bytes, await signature.text())
    if (!signed) unsignedVersion = version
    const manifest = signed ? parseMacManifest(bytes.toString('utf8')) : null
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
  set({
    state: 'downloading',
    version,
    progress: 0,
    message: 'Préparation de l’installateur…'
  })
  // Sans manifeste, aucune empreinte : on refuse de proposer un installateur
  // qui n'a pas été vérifié, plutôt que d'ouvrir un fichier inconnu.
  const manifest = await manifestFor(version)
  if (downloadCancelled()) return
  if (!manifest) {
    set({
      state: 'error',
      message:
        unsignedVersion === version
          ? 'Le manifeste de cette version n’est pas signé : téléchargez l’installateur depuis la page Releases.'
          : 'Empreinte de l’installateur indisponible — téléchargez-la depuis la page Releases.'
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
          if (downloadCancelled()) return
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
        if (downloadCancelled()) return
        rejected = 'Installateur rejeté : son empreinte ne correspond pas à celle publiée.'
      }
    }
    if (downloadCancelled()) return
    set({
      state: 'error',
      message:
        rejected || 'Installateur introuvable pour cette version — utilisez le bouton Releases.'
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
  activeDownload = abort
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
      if (downloadCancelled()) return
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
    if (activeDownload === abort) activeDownload = null
  }
}

/**
 * Lit `latest-linux.yml` (même format que macOS) pour la dernière release.
 *
 * On n'utilise pas electron-updater ici : son AppImageUpdater exige la variable
 * `APPIMAGE`, échoue sans elle et, surtout, son erreur était avalée par le
 * contrôle silencieux. Ce chemin fonctionne quel que soit le mode de lancement
 * et le contrôle reste possible depuis les réglages.
 */
async function fetchLinuxRelease(): Promise<typeof linuxRelease> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 30_000)
  try {
    const response = await fetch(latestAssetUrl('latest-linux.yml'), {
      redirect: 'follow',
      signal: abort.signal,
      cache: 'no-store'
    })
    if (!response.ok) return null
    const manifest = parseManifest(await response.text())
    if (!manifest) return null
    const names = linuxAppImageNames(manifest.version, process.arch)
    const file =
      manifest.files.find((entry) => names.includes(entry.url)) ??
      manifest.files.find((entry) => /\.appimage$/i.test(entry.url))
    return file ? { version: manifest.version, file } : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function checkLinuxUpdate(): Promise<void> {
  const release = await fetchLinuxRelease()
  if (!release) {
    throw new Error(
      'Dernière release Linux illisible : GitHub est injoignable ou aucune AppImage n’est publiée.'
    )
  }
  if (!isNewerVersion(release.version, app.getVersion())) {
    set({ state: 'not-available', version: null, message: 'Vela est à jour.' })
    return
  }
  linuxRelease = release
  const image = currentAppImage()
  const writable = canWriteFile(image)
  set({
    state: 'available',
    version: release.version,
    progress: 0,
    message: image
      ? writable
        ? 'Nouvelle version trouvée — téléchargement de l’AppImage vérifiée…'
        : `Nouvelle version trouvée. L’AppImage${image ? ` (${image})` : ''} est en lecture seule : elle sera téléchargée pour un remplacement manuel.`
      : 'Nouvelle version trouvée. Vela n’est pas lancé depuis une AppImage : téléchargez-la puis remplacez votre installation.',
    releaseUrl: `https://github.com/DmzGamingYT/vela/releases/tag/v${release.version}`
  })
  // Comme avant sur Linux, on télécharge sans attendre — mais uniquement si
  // l'app est bien une AppImage. Un .deb doit laisser l'utilisateur choisir.
  if (image) void downloadLinuxUpdate()
}

async function downloadLinuxUpdate(): Promise<void> {
  const release = linuxRelease
  if (!release) {
    set({
      state: 'error',
      message: 'Aucune version Linux à télécharger : vérifiez d’abord les mises à jour.'
    })
    return
  }
  if (linuxDownloading) return
  const dir = installerDir()
  const target = join(dir, release.file.url)
  // Le nom porte la version : une AppImage d'une release précédente ne doit
  // jamais être proposée pour la nouvelle.
  if (installerPath === target && existsSync(target)) {
    set({ state: 'downloaded', version: release.version, progress: 100 })
    return
  }
  try {
    mkdirSync(dir, { recursive: true })
    for (const entry of readdirSync(dir)) rmSync(join(dir, entry), { force: true, recursive: true })
  } catch {
    /* dossier inaccessible : le téléchargement échouera avec un message clair */
  }
  linuxDownloading = true
  set({
    state: 'downloading',
    version: release.version,
    progress: 0,
    message: 'Téléchargement de l’AppImage…'
  })
  try {
    const ok = await downloadInstaller(
      releaseAssetUrl(release.version, release.file.url),
      target,
      release.version,
      release.file
    )
    if (!ok) {
      rmSync(target, { force: true })
      if (downloadCancelled()) return
      set({
        state: 'error',
        message: 'AppImage rejetée : son empreinte ne correspond pas à celle publiée.'
      })
      return
    }
    installerPath = target
    set({
      state: 'downloaded',
      version: release.version,
      progress: 100,
      message: `${release.file.url} est prête, empreinte vérifiée.`
    })
  } catch (error) {
    rmSync(target, { force: true })
    if (downloadCancelled()) return
    set({
      state: 'error',
      message: error instanceof Error ? error.message.slice(0, 220) : 'Téléchargement impossible.'
    })
  } finally {
    linuxDownloading = false
  }
}

/**
 * Vérifie les mises à jour.
 *
 * Windows : `electron-updater` télécharge et installe à la fermeture. macOS et
 * Linux : on télécharge nous-mêmes un installateur vérifié, car Squirrel exige
 * une signature sur macOS et electron-updater exige `APPIMAGE` sur Linux.
 */
export async function checkForUpdates(userInitiated = false): Promise<UpdateInfo> {
  if (!app.isPackaged) {
    set({
      state: 'idle',
      message: userInitiated
        ? 'Disponible uniquement dans la version installée (pas en dev).'
        : null
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
    if (process.platform === 'linux') {
      await checkLinuxUpdate()
    } else {
      const result = await autoUpdater.checkForUpdates()
      const version = result?.updateInfo ? versionOf(result.updateInfo) : null
      if (!result || !version || version === app.getVersion()) {
        set({ state: 'not-available', version: null, message: 'Vela est à jour.' })
      }
    }
  } catch (error) {
    // Une erreur réseau au démarrage reste discrète ailleurs. Sur Linux, elle
    // est conservée : c'est exactement ce qui empêchait de comprendre pourquoi
    // les mises à jour ne partaient jamais.
    if (userInitiated || process.platform === 'linux') {
      set({
        state: 'error',
        message: error instanceof Error ? error.message.slice(0, 240) : 'Vérification impossible.'
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
  if (process.platform === 'linux') {
    await downloadLinuxUpdate()
    return updateStatus()
  }
  windowsCancellation = new CancellationToken()
  set({
    state: 'downloading',
    progress: 0,
    message: 'Téléchargement en arrière-plan…'
  })
  try {
    await autoUpdater.downloadUpdate(windowsCancellation)
  } catch (error) {
    if (downloadCancelled()) return updateStatus()
    set({
      state: 'error',
      message: error instanceof Error ? error.message.slice(0, 220) : 'Téléchargement impossible.'
    })
  } finally {
    windowsCancellation = null
  }
  return updateStatus()
}

/** Annule le téléchargement en cours, sans supprimer la version proposée. */
export function cancelUpdate(): UpdateInfo {
  activeDownload?.abort()
  activeDownload = null
  windowsCancellation?.cancel()
  windowsCancellation = null
  if (snapshot.state === 'downloading' || snapshot.state === 'available') {
    set({ state: 'cancelled', progress: 0, message: 'Téléchargement annulé.' })
  }
  return updateStatus()
}

/**
 * Applique la mise à jour. macOS : ouvrir le `.dmg` téléchargé (Finder monte
 * l'image, un glisser installe). Ailleurs : redémarrage immédiat, sinon
 * installation à la fermeture.
 */
export function installUpdate(): void {
  if (process.platform === 'linux') {
    if (!installerPath || !existsSync(installerPath)) {
      void shell.openExternal(snapshot.releaseUrl)
      return
    }
    const image = currentAppImage()
    if (image && canWriteFile(image)) {
      try {
        // Écrire à côté puis renommer : l'ancienne AppImage reste intacte si
        // la copie échoue. Le processus en cours garde son inode, donc le
        // remplacement d'un fichier « en cours d'exécution » est sans danger.
        const staged = `${image}.new`
        copyFileSync(installerPath, staged)
        chmodSync(staged, 0o755)
        renameSync(staged, image)
        clearInstallers()
        app.relaunch()
        app.exit(0)
        return
      } catch (error) {
        set({
          state: 'error',
          message: `Remplacement impossible : ${
            error instanceof Error ? error.message.slice(0, 160) : 'écriture refusée'
          }. Le fichier reste dans ${installerPath}.`
        })
        shell.showItemInFolder(installerPath)
        return
      }
    }
    // .deb, AppImage en lecture seule ou dossier protégé : on ne peut pas
    // écrire à la place de l'utilisateur, on lui montre le fichier vérifié.
    shell.showItemInFolder(installerPath)
    set({
      state: 'downloaded',
      message: `AppImage téléchargée. Remplacez ${image ?? 'votre installation'} par ce fichier, puis relancez Vela.`
    })
    return
  }
  if (process.platform === 'darwin') {
    if (installerPath && existsSync(installerPath)) {
      void shell.openPath(installerPath).then((error) => {
        // Image refusée ou déplacée : on retombe sur la page des releases.
        if (error) {
          void shell.openExternal(snapshot.releaseUrl)
          return
        }
        // L'image est montée : le fichier peut quitter le disque.
        setTimeout(() => clearInstallers(), 5_000).unref?.()
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

  // Seul Windows reste piloté par electron-updater (NSIS silencieux). macOS
  // prépare un .dmg vérifié, Linux télécharge une AppImage vérifiée : les deux
  // ont leur propre flux, donc ces options ne les concernent pas.
  autoUpdater.autoDownload = process.platform === 'win32'
  autoUpdater.autoInstallOnAppQuit = process.platform === 'win32'
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
        process.platform === 'darwin'
          ? 'Préparation de l’installateur…'
          : 'Téléchargement en arrière-plan…',
      releaseUrl: `https://github.com/DmzGamingYT/vela/releases/tag/v${version ?? app.getVersion()}`
    })
    if (process.platform === 'darwin') void prepareMacInstaller(version)
  })
  autoUpdater.on('update-downloaded', (info) => {
    if (downloadCancelled()) return
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
    if (downloadCancelled()) return
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
    if (downloadCancelled()) return
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

  // Un installateur laissé par une session précédente encombre pour rien.
  if (process.platform === 'darwin') clearInstallers()

  if (!app.isPackaged) return

  // Contrôle silencieux au démarrage, puis selon le rythme réglé. Un rythme
  // espacé ou coupé ne relance rien au retour de veille ou de focus.
  scheduleUpdates()
  try {
    powerMonitor.on('resume', () => {
      if (policy === 'auto') void checkForUpdates(false)
    })
  } catch {
    /* powerMonitor indisponible */
  }
  app.on('browser-window-focus', () => {
    if (policy === 'auto') void checkForUpdates(false)
  })
}
