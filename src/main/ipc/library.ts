import { app, dialog } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { bookmarksToHtml, parseBookmarksHtml } from '@shared/bookmarksHtml'
import { historyRangeFloor, isHistoryRange } from '@shared/navigation'
import { isHomeUrl } from '@shared/url'
import { detectBookmarks } from '../bookmarks'
import type { IpcHost } from './host'
import type { Handle } from './types'

/** Historique et marque-pages : consultation, import et export. */
export function registerLibraryIpc(host: IpcHost, handle: Handle): void {
  handle('history:clear', () => {
    host.store.clearHistory()
    host.broadcast()
  })
  handle('history:list', () => host.store.get().history.slice(0, 500))
  handle('history:remove', (payload) => {
    const url = typeof payload === 'string' ? payload : ''
    if (!url) return
    host.store.removeHistory(url)
    host.broadcast()
  })
  // Effacement par période : la copie retirée reste disponible huit
  // secondes, le temps d'annuler. Un nouvel effacement rend le précédent
  // définitif.
  handle('history:clear-range', (payload) => {
    const range = isHistoryRange(payload) ? payload : 'all'
    host.commitPendingHistory()
    const removed = host.store.clearHistorySince(historyRangeFloor(range, Date.now()))
    if (removed.length > 0) {
      const timer = setTimeout(() => {
        host.setPendingHistory(null)
      }, 8000)
      if (typeof timer.unref === 'function') timer.unref()
      host.setPendingHistory({ entries: removed, timer })
    }
    host.broadcast()
    return removed.length
  })
  handle('history:undo-clear', () => {
    const pending = host.pendingHistory()
    if (!pending) return 0
    clearTimeout(pending.timer)
    host.setPendingHistory(null)
    const restored = host.store.restoreHistory(pending.entries)
    host.broadcast()
    return restored
  })

  handle('bookmark:toggle', (payload) => {
    const input = (payload ?? {}) as { url?: unknown; title?: unknown; favicon?: unknown }
    const url = typeof input.url === 'string' ? input.url : ''
    if (!url || isHomeUrl(url)) return false
    const added = host.store.toggleBookmark(
      url,
      typeof input.title === 'string' ? input.title : url,
      typeof input.favicon === 'string' ? input.favicon : undefined
    )
    host.broadcast()
    return added
  })
  handle('bookmark:remove', (payload) => {
    const id = typeof payload === 'string' ? payload : ''
    if (!id) return
    host.store.removeBookmark(id)
    host.broadcast()
  })
  handle('bookmark:move', (payload) => {
    const input = (payload ?? {}) as { id?: unknown; position?: unknown }
    if (typeof input.id !== 'string' || typeof input.position !== 'number') return false
    const moved = host.store.moveBookmark(input.id, input.position)
    if (moved) host.broadcast()
    return moved
  })
  handle('bookmark:reorder', (payload) => {
    const ids = Array.isArray(payload)
      ? payload.filter((id): id is string => typeof id === 'string')
      : []
    const applied = host.store.reorderBookmarks(ids)
    if (applied) host.broadcast()
    return applied
  })
  handle('bookmark:detect', () => detectBookmarks())
  handle('bookmark:add-many', (payload) => {
    const entries = Array.isArray(payload) ? payload : []
    const clean = entries
      .filter((entry): entry is { url: string; title?: unknown; favicon?: unknown } =>
        Boolean(entry && typeof (entry as { url?: unknown }).url === 'string')
      )
      .slice(0, 500)
      .map((entry) => ({
        url: String(entry.url),
        title: typeof entry.title === 'string' ? entry.title : '',
        favicon: typeof entry.favicon === 'string' ? entry.favicon : undefined
      }))
    const added = host.store.addBookmarks(clean)
    if (added > 0) host.broadcast()
    return added
  })
  handle('bookmark:export-html', async () => {
    const state = host.store.get()
    const stamp = new Date().toISOString().slice(0, 10)
    const result = await dialog.showSaveDialog({
      title: 'Exporter les marque-pages',
      defaultPath: join(app.getPath('documents'), `vela-marque-pages-${stamp}.html`),
      filters: [{ name: 'Favoris HTML', extensions: ['html', 'htm'] }]
    })
    if (result.canceled || !result.filePath) return null
    const ordered = [...state.bookmarks].sort((a, b) => a.order - b.order)
    await writeFile(result.filePath, bookmarksToHtml(ordered), 'utf8')
    return result.filePath
  })
  handle('bookmark:import-html', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Importer des marque-pages',
      properties: ['openFile'],
      filters: [{ name: 'Favoris HTML', extensions: ['html', 'htm'] }]
    })
    const file = result.filePaths?.[0]
    if (result.canceled || !file) return { added: 0, cancelled: true }
    const html = await readFile(file, 'utf8')
    const added = host.store.addBookmarks(parseBookmarksHtml(html))
    if (added > 0) host.broadcast()
    return { added, cancelled: false }
  })
}
