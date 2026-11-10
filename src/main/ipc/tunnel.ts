import { app, BrowserWindow, dialog } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { TunnelRunInput } from '@shared/api'
import { newId } from '@shared/defaults'
import type { IpcHost } from './host'
import type { Handle, On } from './types'
import { asId, asString } from './util'

/** Tunnel de recherche : exécution, cartes et exports. */
export function registerTunnelIpc(host: IpcHost, handle: Handle, on: On): void {
  handle('tunnel:run', (payload) => {
    const input = (payload ?? {}) as TunnelRunInput
    const state = host.store.get()
    const spaceId =
      typeof input.spaceId === 'string' && state.spaces.some((space) => space.id === input.spaceId)
        ? input.spaceId
        : state.activeSpaceId
    const query = asString(input.query).slice(0, 300)
    if (!query.trim()) throw new Error('Décrivez un sujet pour lancer le tunnel.')
    const runId = newId()
    void host.tunnel
      .start(
        runId,
        {
          query,
          spaceId,
          parentId: typeof input.parentId === 'string' ? input.parentId : undefined,
          mapId: typeof input.mapId === 'string' ? input.mapId : undefined,
          depth:
            input.depth === 'quick' || input.depth === 'deep' ? input.depth : 'standard',
          variants: Array.isArray(input.variants)
            ? input.variants.filter((entry): entry is string => typeof entry === 'string')
            : undefined,
          more: input.more === true
        },
        (event) => host.send('tunnel:event', event)
      )
      .catch((error: unknown) => {
        host.send('tunnel:event', {
          runId,
          type: 'error',
          message: error instanceof Error ? error.message : 'Recherche interrompue.'
        })
      })
    return { runId }
  })
  on('tunnel:cancel', (_event, runId) => {
    if (typeof runId === 'string') host.tunnel.cancel(runId)
  })
  handle('tunnel:maps', () => host.store.listTunnelMaps())
  handle('tunnel:save', (payload) => {
    const map = payload as import('@shared/tunnel').TunnelMap | undefined
    if (!map || typeof map !== 'object') return { ok: false }
    const ok = host.store.saveTunnelMap(map)
    if (ok) host.broadcast()
    return { ok }
  })
  handle('tunnel:load', (payload) => host.store.getTunnelMap(asId(payload)))
  handle('tunnel:rename', (payload) => {
    const input = (payload ?? {}) as { id?: unknown; title?: unknown }
    const id = typeof input.id === 'string' ? input.id : ''
    const title = typeof input.title === 'string' ? input.title : ''
    if (!id || !title.trim()) return
    host.store.renameTunnelMap(id, title)
    host.broadcast()
  })
  handle('tunnel:remove', (payload) => {
    const id = asId(payload)
    if (!id) return
    host.store.removeTunnelMap(id)
    host.broadcast()
  })
  handle('tunnel:duplicate', (payload) => {
    const copy = host.store.duplicateTunnelMap(asId(payload))
    if (copy) host.broadcast()
    return copy
  })
  handle('tunnel:save-png', async (payload) => {
    const input = (payload ?? {}) as { dataUrl?: unknown; name?: unknown }
    const dataUrl = typeof input.dataUrl === 'string' ? input.dataUrl : ''
    const name = typeof input.name === 'string' ? input.name : 'tunnel-vela.png'
    const base64 = dataUrl.split(',')[1]
    if (!base64) return null
    const result = await dialog.showSaveDialog({
      defaultPath: join(app.getPath('pictures'), name),
      filters: [{ name: 'Image PNG', extensions: ['png'] }]
    })
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, Buffer.from(base64, 'base64'))
    return result.filePath
  })
  handle('tunnel:export-pdf', async (payload) => {
    const input = (payload ?? {}) as { html?: unknown; name?: unknown }
    const html = typeof input.html === 'string' ? input.html : ''
    const name = typeof input.name === 'string' ? input.name : 'tunnel-vela.pdf'
    if (!html) return false
    const printer = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
    })
    // La fenêtre d'impression ne montre qu'un document écrit par Vela : elle
    // n'ouvre rien, ne navigue nulle part, et n'expose aucune permission.
    printer.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    printer.webContents.on('will-navigate', (event) => event.preventDefault())
    try {
      await printer.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      const pdf = await printer.webContents.printToPDF({ printBackground: true })
      const result = await dialog.showSaveDialog({
        defaultPath: join(app.getPath('documents'), name),
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
      if (result.canceled || !result.filePath) return false
      await writeFile(result.filePath, pdf)
      return true
    } catch {
      return false
    } finally {
      if (!printer.isDestroyed()) printer.destroy()
    }
  })
}
