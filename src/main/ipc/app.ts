/**
 * Application, fenêtre jetable, vignettes, réglages, apparence et mises à jour.
 *
 * Les charges libres (`settings:update`, `space:create`) restent déclarées
 * `Any` : `host.updateSettings` et `host.addSpace` sont les seuls à connaître la
 * forme complète du patch, et c'est déjà là qu'elle est normalisée.
 */
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
  faviconsCachedDataUrls,
  purgeFavicons
} from '../favicons'
import {
  Any,
  None,
  Text,
  bindContracts,
  field,
  listen,
  optional,
  record,
  request,
  shape
} from './contract'
import type { IpcHost } from './host'
import type { Handle, On } from './types'
import { readImageDataUrl } from './util'

/** Icône d'un domaine : une adresse absente rend `null`, elle n'est pas refusée. */
const FaviconOne = field<{ host: string; spaceId: string }>('icône', (value) => {
  const source = record(value)
  return {
    host: typeof source.host === 'string' ? source.host : '',
    spaceId: typeof source.spaceId === 'string' ? source.spaceId : ''
  }
})

/** Icônes en série ; `hosts` reste `null` quand la charge n'en porte pas. */
const FaviconMany = field<{ hosts: string[] | null; spaceId: string }>('icônes', (value) => {
  const source = record(value)
  return {
    hosts: Array.isArray(source.hosts)
      ? source.hosts.filter((host): host is string => typeof host === 'string').slice(0, 200)
      : null,
    spaceId: typeof source.spaceId === 'string' ? source.spaceId : ''
  }
})

/** Nom de fichier : tout ce qui n'est pas un texte vaut « aucun ». */
const Name = field<string>('nom', (value) => (typeof value === 'string' ? value : ''))

const ForgotZoom = field<string>('domaine', (value) => {
  const source = record(value).host
  return typeof source === 'string' ? source.trim().toLowerCase() : ''
})

export function registerAppIpc(host: IpcHost, handle: Handle, on: On): void {
  bindContracts(
    [
      request('app:view', None, () => host.view()),

      request('favicons:get', FaviconOne, ({ host: name, spaceId }) => {
        if (!name) return null
        return faviconDataUrl(name, spaceId)
      }),

      request('favicons:peek-many', FaviconMany, ({ hosts, spaceId }) => {
        if (!hosts) return {}
        return faviconsCachedDataUrls(hosts, spaceId)
      }),

      request('favicons:purge', None, () => purgeFavicons()),

      request('favicons:peek', FaviconOne, ({ host: name, spaceId }) => {
        if (!name) return null
        return faviconCachedDataUrl(name, spaceId)
      }),

      request('app:metrics', None, () => host.metrics()),

      // Double-clic sur une zone libre de la barre de titre : le geste macOS
      // attendu, agrandir puis restaurer. La barre est en `-webkit-app-region:
      // drag`, donc le glissement de la fenêtre suit tout seul.
      request('app:zoom-window', None, () => {
        const win = host.win()
        if (!win) return
        if (win.isMaximized()) win.unmaximize()
        else win.maximize()
      }),

      // Coup d'œil : la carte vit dans la coque, la page est une vue native.
      // Seuls ces quelques échanges traversent l'IPC.
      request('peek:open', shape<{ url?: string; spaceId?: string }>({
        url: optional(Text),
        spaceId: optional(Text)
      }), (input) => host.openPeek(input)),
      request('peek:close', None, () => host.peek.close()),
      request('peek:navigate', Text, (input) => host.peek.navigate(input)),
      request('peek:back', None, () => host.peek.back()),
      request('peek:forward', None, () => host.peek.forward()),
      request('peek:reload', None, () => host.peek.reload()),
      request('peek:stop', None, () => host.peek.stop()),
      request('peek:open-in-tab', None, () => host.peek.openInTab()),
      request('peek:open-in-split', None, () => host.peek.openInSplit()),
      request('peek:state', None, () => host.peek.current()),
      // La carte se présente par `send` : `handle` ne reçoit pas ces messages.
      listen('peek:ready', None, () => host.peek.ready()),
      listen('peek:layout', Any, (rect) => host.peek.layout(rect)),

      request('avatar:read', Name, (name) => readAvatarDataUrl(host.store.dir, name)),

      request('thumbs:get', Name, (url) => host.thumbs.dataUrl(url)),
      request('thumbs:count', None, () => host.thumbs.count()),
      request('thumbs:purge', None, () => {
        const removed = host.thumbs.purge()
        // L'accueil redemande ses vignettes : aucune capture périmée à l'écran.
        host.broadcast()
        return removed
      }),

      request('downloads:list', None, () => host.downloads().slice(0, 30)),

      request('downloads:preview', Text, async (id) => {
        const item = host.downloads().find((download) => download.id === id)
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
      }),

      request('downloads:open', Text, async (id) => {
        const item = host.downloads().find((download) => download.id === id)
        if (item?.path) await shell.showItemInFolder(item.path)
        else await shell.openPath(app.getPath('downloads'))
      }),

      request('downloads:clear', None, () => {
        host.setDownloads(host.downloads().filter((download) => download.state === 'progress'))
        host.broadcast()
      }),

      request('downloads:pick-dir', None, async () => {
        const result = await dialog.showOpenDialog({
          title: 'Dossier des téléchargements',
          properties: ['openDirectory', 'createDirectory']
        })
        return result.canceled ? null : (result.filePaths[0] ?? null)
      }),

      request('settings:update', Any, async (patch) => {
        if (!(await host.confirmRemoteEndpoint(patch))) return
        host.updateSettings(patch)
        // Le rythme du contrôle des mises à jour s'applique sans redémarrer.
        const checks = record(patch).updateChecks
        if (checks === 'auto' || checks === 'weekly' || checks === 'off') setUpdaterPolicy(checks)
      }),

      request('settings:set-key', shape<{ provider: unknown; key: unknown }>({
        provider: Any,
        key: Any
      }), ({ provider, key }) => {
        if (!isProviderId(provider)) return false
        const ok = host.store.setSecret(provider, typeof key === 'string' ? key : null)
        if (ok) host.broadcast()
        return ok
      }),

      request('settings:test-key', Any, (input) => host.testKey(input)),

      // Oublier le zoom d'un seul domaine : la carte reste bornée côté store.
      request('settings:forget-zoom', ForgotZoom, (name) => {
        if (!name) return false
        const removed = host.store.forgetHostZoom(name)
        if (removed) host.broadcast()
        return removed
      }),

      // L'image d'accueil reste un chemin local : on ne renvoie son contenu au
      // châssis que sur demande, pour ne pas alourdir chaque état diffusé.
      request('appearance:pick-image', None, async () => {
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
      }),

      request('appearance:image', None, async () => {
        const file = host.store.get().settings.homeImage
        if (!file) return null
        return readImageDataUrl(file)
      }),

      request('appearance:clear-image', None, () => {
        host.store.update((state) => {
          state.settings.homeImage = null
        })
        host.broadcast()
      }),

      request('update:status', None, () => updateStatus()),
      request('update:check', None, () => checkForUpdates(true)),
      request('update:download', None, () => downloadUpdate()),
      request('update:cancel', None, () => cancelUpdateDownload()),
      request('update:install', None, () => {
        installUpdate()
      }),
      request('update:releases', None, () => {
        openReleases()
      })
    ],
    handle,
    on
  )
}
