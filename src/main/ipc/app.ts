import { app, dialog, shell } from 'electron'
import { isProviderId } from '@shared/providers'
import {
  cancelUpdate as cancelUpdateDownload,
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  openReleases,
  setUpdaterPolicy,
  updateStatus
} from '../updater'
import { readAvatarDataUrl } from '../avatars'
import {
  faviconCachedDataUrl,
  faviconDataUrl,
  purgeFavicons
} from '../favicons'
import type { IpcHost } from './host'
import type { Handle, On } from './types'
import { asId, readImageDataUrl } from './util'

/** Application, fenêtre jetable, vignettes, réglages, apparence et mises à jour. */
export function registerAppIpc(host: IpcHost, handle: Handle, on: On): void {
  handle('app:view', () => host.view())
  handle('favicons:get', (input) => {
    const payload = (input ?? {}) as { host?: unknown; spaceId?: unknown }
    if (typeof payload.host !== 'string') return null
    return faviconDataUrl(payload.host, typeof payload.spaceId === 'string' ? payload.spaceId : '')
  })
  handle('favicons:purge', () => purgeFavicons())
  handle('favicons:peek', (input) => {
    const payload = (input ?? {}) as { host?: unknown; spaceId?: unknown }
    if (typeof payload.host !== 'string') return null
    return faviconCachedDataUrl(
      payload.host,
      typeof payload.spaceId === 'string' ? payload.spaceId : ''
    )
  })
  handle('app:platform', () => process.platform)
  handle('app:metrics', () => host.metrics())

  // Coup d'œil : la carte vit dans la coque, la page est une vue native.
  // Seuls ces quelques échanges traversent l'IPC.
  handle('peek:open', (payload) => {
    const input = (payload ?? {}) as { url?: unknown; spaceId?: unknown }
    return host.openPeek({
      ...(typeof input.url === 'string' ? { url: input.url } : {}),
      ...(typeof input.spaceId === 'string' ? { spaceId: input.spaceId } : {})
    })
  })
  handle('peek:close', () => host.peek.close())
  handle('peek:navigate', (payload) => host.peek.navigate(typeof payload === 'string' ? payload : ''))
  handle('peek:back', () => host.peek.back())
  handle('peek:forward', () => host.peek.forward())
  handle('peek:reload', () => host.peek.reload())
  handle('peek:stop', () => host.peek.stop())
  handle('peek:open-in-tab', () => host.peek.openInTab())
  handle('peek:open-in-split', () => host.peek.openInSplit())
  handle('peek:state', () => host.peek.current())
  // La carte se présente par `send` : `handle` ne reçoit pas ces messages.
  on('peek:ready', () => host.peek.ready())
  on('peek:layout', (_event, payload) => host.peek.layout(payload))

  handle('avatar:read', (payload) => {
    const name = typeof payload === 'string' ? payload : ''
    return readAvatarDataUrl(host.store.dir, name)
  })
  handle('thumbs:get', (payload) =>
    host.thumbs.dataUrl(typeof payload === 'string' ? payload : '')
  )
  handle('thumbs:count', () => host.thumbs.count())
  handle('thumbs:purge', () => {
    const removed = host.thumbs.purge()
    // L'accueil redemande ses vignettes : aucune capture périmée à l'écran.
    host.broadcast()
    return removed
  })

  handle('downloads:list', () => host.downloads().slice(0, 30))
  handle('downloads:preview', async (payload) => {
    const item = host.downloads().find((download) => download.id === asId(payload))
    if (!item?.path || item.state !== 'done') return false
    const extension = item.name.split('.').pop()?.toLowerCase() ?? ''
    if (!['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'txt', 'md', 'json'].includes(extension))
      return false
    try {
      const opened = await shell.openPath(item.path)
      return !opened
    } catch {
      return false
    }
  })
  handle('downloads:open', async (payload) => {
    const item = host.downloads().find((download) => download.id === asId(payload))
    if (item?.path) await shell.showItemInFolder(item.path)
    else await shell.openPath(app.getPath('downloads'))
  })
  handle('downloads:clear', () => {
    host.setDownloads(host.downloads().filter((download) => download.state === 'progress'))
    host.broadcast()
  })
  handle('downloads:pick-dir', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Dossier des téléchargements',
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  handle('settings:update', async (payload) => {
    if (!(await host.confirmRemoteEndpoint(payload))) return
    host.updateSettings(payload)
    // Le rythme du contrôle des mises à jour s'applique sans redémarrer.
    const checks = (payload as { updateChecks?: unknown } | null)?.updateChecks
    if (checks === 'auto' || checks === 'weekly' || checks === 'off') setUpdaterPolicy(checks)
  })
  handle('settings:set-key', (payload) => {
    const input = (payload ?? {}) as { provider?: unknown; key?: unknown }
    if (!isProviderId(input.provider)) return false
    const ok = host.store.setSecret(
      input.provider,
      typeof input.key === 'string' ? input.key : null
    )
    if (ok) host.broadcast()
    return ok
  })
  handle('settings:test-key', (payload) => host.testKey(payload))
  // Oublier le zoom d'un seul domaine : la carte reste bornée côté store.
  handle('settings:forget-zoom', (payload) => {
    const input = (payload ?? {}) as { host?: unknown }
    const name = typeof input.host === 'string' ? input.host.trim().toLowerCase() : ''
    if (!name) return false
    const removed = host.store.forgetHostZoom(name)
    if (removed) host.broadcast()
    return removed
  })

  // L'image d'accueil reste un chemin local : on ne renvoie son contenu au
  // châssis que sur demande, pour ne pas alourdir chaque état diffusé.
  handle('appearance:pick-image', async () => {
    const win = host.win()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Choisir une image de fond',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    const file = result.filePaths[0]
    const dataUrl = await readImageDataUrl(file)
    if (!dataUrl) return null
    host.store.update((state) => {
      state.settings.homeImage = file
    })
    host.broadcast()
    return { path: file, dataUrl }
  })
  handle('appearance:image', async () => {
    const file = host.store.get().settings.homeImage
    if (!file) return null
    return readImageDataUrl(file)
  })
  handle('appearance:clear-image', () => {
    host.store.update((state) => {
      state.settings.homeImage = null
    })
    host.broadcast()
  })

  handle('update:status', () => updateStatus())
  handle('update:check', () => checkForUpdates(true))
  handle('update:download', () => downloadUpdate())
  handle('update:cancel', () => cancelUpdateDownload())
  handle('update:install', () => {
    installUpdate()
  })
  handle('update:releases', () => {
    openReleases()
  })
}
