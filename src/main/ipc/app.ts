import { app, dialog, shell } from 'electron'
import { isProviderId } from '@shared/providers'
import {
  cancelUpdate as cancelUpdateDownload,
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  openReleases,
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

  // Petite fenêtre (façon Little Arc) : sa barre compacte est un renderer à
  // nous, elle ne voit que ces quelques échanges.
  handle('mini:open', (payload) => {
    const input = (payload ?? {}) as { url?: unknown; spaceId?: unknown }
    return host.openMini({
      ...(typeof input.url === 'string' ? { url: input.url } : {}),
      ...(typeof input.spaceId === 'string' ? { spaceId: input.spaceId } : {})
    })
  })
  handle('mini:close', () => host.mini.close())
  handle('mini:navigate', (payload) => host.mini.navigate(typeof payload === 'string' ? payload : ''))
  handle('mini:back', () => host.mini.back())
  handle('mini:forward', () => host.mini.forward())
  handle('mini:reload', () => host.mini.reload())
  handle('mini:stop', () => host.mini.stop())
  handle('mini:open-in-tab', () => host.mini.openInTab())
  handle('mini:state', () => host.mini.current())
  // La barre se présente par `send` : `handle` ne reçoit pas ces messages, et
  // sans cette annonce l'état ne lui serait jamais poussé.
  on('mini:ready', () => host.mini.ready())

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
