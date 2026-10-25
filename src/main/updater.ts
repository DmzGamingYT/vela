import { app, shell } from 'electron'
import { autoUpdater } from 'electron-updater'

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

const RELEASE_URL = 'https://github.com/DmzGamingYT/vela/releases/tag/v0.1.0'

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

export async function checkForUpdates(userInitiated = false): Promise<UpdateInfo> {
  if (!app.isPackaged) {
    set({
      state: 'idle',
      message: userInitiated ? 'Disponible uniquement dans la version installée (pas en dev).' : null
    })
    return updateStatus()
  }
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
  }
  return updateStatus()
}

export async function downloadUpdate(): Promise<UpdateInfo> {
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

export function installUpdate(): void {
  try {
    autoUpdater.quitAndInstall(false, true)
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

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false

  autoUpdater.on('update-available', (info) => {
    set({
      state: 'available',
      version: versionOf(info),
      progress: 0,
      message: null,
      releaseUrl: `https://github.com/DmzGamingYT/vela/releases/tag/v${versionOf(info) ?? app.getVersion()}`
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    set({ state: 'downloaded', version: versionOf(info), progress: 100, message: null })
  })
  autoUpdater.on('download-progress', (progress) => {
    set({
      state: 'downloading',
      progress: Math.round(progress?.percent ?? 0),
      message: null
    })
  })
  autoUpdater.on('update-not-available', () => {
    // Ne pas écraser un état manuel "à jour" déjà affiché ; rester cohérent sinon.
    if (snapshot.state === 'checking') set({ state: 'not-available', message: 'Vela est à jour.' })
  })
  autoUpdater.on('error', (error) => {
    // Les erreurs réseau/404 au démarrage auto restent silencieuses.
    if (snapshot.state === 'checking' || snapshot.state === 'downloading') {
      set({
        state: 'error',
        message: error instanceof Error ? error.message.slice(0, 220) : 'Mise à jour impossible.'
      })
    }
  })

  // Contrôle silencieux ~20 s après le démarrage, seulement en build packagé.
  if (app.isPackaged) {
    setTimeout(() => {
      void checkForUpdates(false)
    }, 20_000)
  }
}
