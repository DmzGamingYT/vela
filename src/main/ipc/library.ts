/**
 * Historique et marque-pages : consultation, import et export.
 *
 * Les listes gardent les gardes d'origine : un élément sans `url` valide est
 * écarté, pas la requête entière — un import de favoris doit survivre à une
 * ligne cassée.
 */
import { app, dialog } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { bookmarksToHtml, parseBookmarksHtml } from '@shared/bookmarksHtml'
import { historyRangeFloor, isHistoryRange, type HistoryRange } from '@shared/navigation'
import { isHomeUrl } from '@shared/url'
import { detectBookmarks } from '../bookmarks'
import {
  None,
  Num,
  Text,
  bindContracts,
  field,
  optional,
  record,
  request,
  shape
} from './contract'
import type { IpcHost } from './host'
import type { Handle, On } from './types'

/** Période d'effacement : tout ce qui n'est pas reconnu vaut « tout ». */
const Range = field<HistoryRange>('période', (value) =>
  isHistoryRange(value) ? value : 'all'
)

const Toggle = shape<{ url: string; title?: string; favicon?: string }>({
  url: Text,
  title: optional(Text),
  favicon: optional(Text)
})

const Move = shape<{ id: string; position: number }>({ id: Text, position: Num })

/** Permutation complète : les entrées non textuelles sont écartées. */
const Ids = field<string[]>('identifiants', (value) =>
  Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
)

/** Import en masse : seules les entrées pourvues d'une adresse textuelle passent. */
const Batch = field<Array<{ url: string; title: string; favicon?: string }>>('favoris', (value) => {
  const kept: Array<{ url: string; title: string; favicon?: string }> = []
  for (const raw of Array.isArray(value) ? value : []) {
    const entry = record(raw)
    if (typeof entry.url !== 'string') continue
    const item: { url: string; title: string; favicon?: string } = {
      url: entry.url,
      title: typeof entry.title === 'string' ? entry.title : ''
    }
    if (typeof entry.favicon === 'string') item.favicon = entry.favicon
    kept.push(item)
    if (kept.length >= 500) break
  }
  return kept
})

export function registerLibraryIpc(host: IpcHost, handle: Handle, on: On): void {
  bindContracts(
    [
      request('history:clear', None, () => {
        host.store.clearHistory()
        host.broadcast()
      }),

      request('history:list', None, () => host.store.get().history.slice(0, 500)),

      request('history:remove', Text, (url) => {
        if (!url) return
        host.store.removeHistory(url)
        host.broadcast()
      }),

      // Effacement par période : la copie retirée reste disponible huit
      // secondes, le temps d'annuler. Un nouvel effacement rend le précédent
      // définitif.
      request('history:clear-range', Range, (range) => {
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
      }),

      request('history:undo-clear', None, () => {
        const pending = host.pendingHistory()
        if (!pending) return 0
        clearTimeout(pending.timer)
        host.setPendingHistory(null)
        const restored = host.store.restoreHistory(pending.entries)
        host.broadcast()
        return restored
      }),

      request('bookmark:toggle', Toggle, ({ url, title, favicon }) => {
        if (!url || isHomeUrl(url)) return false
        const added = host.store.toggleBookmark(url, title ?? url, favicon)
        host.broadcast()
        return added
      }),

      request('bookmark:remove', Text, (id) => {
        if (!id) return
        host.store.removeBookmark(id)
        host.broadcast()
      }),

      request('bookmark:move', Move, ({ id, position }) => {
        if (!id) return false
        const moved = host.store.moveBookmark(id, position)
        if (moved) host.broadcast()
        return moved
      }),

      request('bookmark:reorder', Ids, (ids) => {
        const applied = host.store.reorderBookmarks(ids)
        if (applied) host.broadcast()
        return applied
      }),

      request('bookmark:detect', None, () => detectBookmarks()),

      request('bookmark:add-many', Batch, (entries) => {
        const added = host.store.addBookmarks(entries)
        if (added > 0) host.broadcast()
        return added
      }),

      request('bookmark:export-html', None, async () => {
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
      }),

      request('bookmark:import-html', None, async () => {
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
    ],
    handle,
    on
  )
}
