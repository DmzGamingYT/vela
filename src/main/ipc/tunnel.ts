/**
 * Tunnel de recherche : exécution, cartes et exports.
 *
 * Les charges sont décrites une fois, ici. Une requête vide lève toujours son
 * erreur métier ; une carte illisible rend `{ ok: false }` comme avant.
 */
import { app, BrowserWindow, dialog } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  TunnelExportPdfInput,
  TunnelRenameInput,
  TunnelRunInput,
  TunnelSavePngInput
} from '@shared/api'
import { newId } from '@shared/defaults'
import { sanitizeMap, type TunnelMap } from '@shared/tunnel'
import {
  Id,
  None,
  Text,
  bindContracts,
  field,
  listen,
  record,
  request,
  shape
} from './contract'
import type { IpcHost } from './host'
import type { Handle, On } from './types'

/** Charge du tunnel, normalisée avant d'atteindre le moteur. */
const TunnelRun = field<TunnelRunInput>('tunnel', (value) => {
  const source = record(value)
  const input: TunnelRunInput = {
    query: typeof source.query === 'string' ? source.query.slice(0, 300) : ''
  }
  if (typeof source.spaceId === 'string') input.spaceId = source.spaceId
  if (typeof source.parentId === 'string') input.parentId = source.parentId
  if (typeof source.mapId === 'string') input.mapId = source.mapId
  if (source.depth === 'quick' || source.depth === 'standard' || source.depth === 'deep') {
    input.depth = source.depth
  }
  if (Array.isArray(source.variants)) {
    input.variants = source.variants.filter((entry): entry is string => typeof entry === 'string')
  }
  if (source.more === true) input.more = true
  return input
})

/** Carte de tunnel : `sanitizeMap` la reconstruit, ou rend `null`. */
const MapInput = field<TunnelMap | null>('carte', (value) => sanitizeMap(value))

const Rename = shape<TunnelRenameInput>({ id: Text, title: Text })

const SavePng = shape<TunnelSavePngInput>({ dataUrl: Text, name: Text })

const ExportPdf = shape<TunnelExportPdfInput>({ html: Text, name: Text })

export function registerTunnelIpc(host: IpcHost, handle: Handle, on: On): void {
  bindContracts(
    [
      request('tunnel:run', TunnelRun, (input) => {
        const state = host.store.get()
        const spaceId =
          input.spaceId && state.spaces.some((space) => space.id === input.spaceId)
            ? input.spaceId
            : state.activeSpaceId
        const query = input.query
        if (!query.trim()) throw new Error('Décrivez un sujet pour lancer le tunnel.')
        const runId = newId()
        void host.tunnel
          .start(
            runId,
            {
              query,
              spaceId,
              parentId: input.parentId,
              mapId: input.mapId,
              depth: input.depth ?? 'standard',
              variants: input.variants,
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
      }),

      listen('tunnel:cancel', Text, (runId) => {
        if (runId) host.tunnel.cancel(runId)
      }),

      request('tunnel:maps', None, () => host.store.listTunnelMaps()),

      request('tunnel:save', MapInput, (map) => {
        if (!map) return { ok: false }
        const ok = host.store.saveTunnelMap(map)
        if (ok) host.broadcast()
        return { ok }
      }),

      request('tunnel:load', Id, (id) => host.store.getTunnelMap(id)),

      request('tunnel:rename', Rename, ({ id, title }) => {
        if (!id || !title.trim()) return
        host.store.renameTunnelMap(id, title)
        host.broadcast()
      }),

      request('tunnel:remove', Id, (id) => {
        if (!id) return
        host.store.removeTunnelMap(id)
        host.broadcast()
      }),

      request('tunnel:duplicate', Id, (id) => {
        const copy = host.store.duplicateTunnelMap(id)
        if (copy) host.broadcast()
        return copy
      }),

      request('tunnel:save-png', SavePng, async ({ dataUrl, name }) => {
        const base64 = dataUrl.split(',')[1]
        if (!base64) return null
        const result = await dialog.showSaveDialog({
          defaultPath: join(app.getPath('pictures'), name || 'tunnel-vela.png'),
          filters: [{ name: 'Image PNG', extensions: ['png'] }]
        })
        if (result.canceled || !result.filePath) return null
        await writeFile(result.filePath, Buffer.from(base64, 'base64'))
        return result.filePath
      }),

      request('tunnel:export-pdf', ExportPdf, async ({ html, name }) => {
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
            defaultPath: join(app.getPath('documents'), name || 'tunnel-vela.pdf'),
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
    ],
    handle,
    on
  )
}
