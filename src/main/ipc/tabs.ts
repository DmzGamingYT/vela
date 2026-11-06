import type { CreateTabInput } from '@shared/api'
import type { LayoutRequest, PaneSnapshot } from '@shared/types'
import type { IpcHost } from './host'
import type { Handle, On } from './types'
import { asId, isPane } from './util'

/** Onglets, dossiers d'onglets et disposition des volets. */
export function registerTabsIpc(host: IpcHost, handle: Handle, on: On): void {
  handle('tab:create', (payload) => host.createTab((payload ?? {}) as CreateTabInput))
  handle('tab:close', (payload) => host.closeTab(asId(payload)))
  handle('tab:activate', (payload) => {
    host.activateTab(asId(payload))
  })
  handle('tab:navigate', (payload) => {
    const input = (payload ?? {}) as { id?: unknown; input?: unknown }
    host.tabs.navigate(asId(input.id), asId(input.input))
  })
  handle('tab:find', (payload) => {
    const input = (payload ?? {}) as { id?: unknown; query?: unknown; forward?: unknown }
    return host.tabs.find(asId(input.id), asId(input.query), input.forward !== false)
  })
  handle('tab:find-stop', (payload) => {
    const input = (payload ?? {}) as { id?: unknown; action?: unknown }
    const action = input.action === 'keepSelection' ? 'keepSelection' : 'clearSelection'
    host.tabs.findStop(asId(input.id), action)
  })
  handle('tab:home', (payload) => {
    host.tabs.goHome(asId(payload))
  })
  handle('tab:back', (payload) => {
    host.tabs.back(asId(payload))
  })
  handle('tab:forward', (payload) => {
    host.tabs.forward(asId(payload))
  })
  handle('tab:reload', (payload) => {
    host.tabs.reload(asId(payload))
  })
  handle('tab:zoom', (payload) => {
    const input = (payload ?? {}) as { id?: unknown; direction?: unknown }
    const direction =
      input.direction === 'in' || input.direction === 'out' ? input.direction : 'reset'
    return host.tabs.zoom(asId(input.id), direction)
  })
  handle('tab:stop', (payload) => {
    host.tabs.stop(asId(payload))
  })
  handle('tab:pin', (payload) => {
    host.pinTab(payload)
  })
  handle('tab:mute', (payload) => {
    const input = (payload ?? {}) as { id?: unknown; muted?: unknown }
    const id = asId(input.id)
    if (id) host.tabs.setMuted(id, input.muted === true)
  })
  handle('tab:reopen', () => {
    host.reopenTab()
  })
  handle('tab:split-toggle', () => {
    host.toggleSplit()
  })
  handle('tab:split-set', (payload) => {
    host.setSplitTab(asId(payload))
  })
  handle('tab:split-ratio', (payload) => {
    const ratio = typeof payload === 'number' ? payload : Number.NaN
    if (!Number.isFinite(ratio)) return
    host.store.update((state) => {
      state.splitRatio = Math.min(0.75, Math.max(0.25, ratio))
    })
    host.broadcast()
  })
  handle('tab:focus', (payload) => {
    host.tabs.focus(asId(payload))
  })
  handle('tab:discard', (payload) => {
    host.tabs.suspend(asId(payload))
    host.broadcast()
  })
  handle('tab:reorder', (payload) => {
    host.reorderTab(payload)
  })
  handle('tab:print', (payload) => host.tabs.print(asId(payload)))

  handle('group:create', (payload) => host.createGroup(payload))
  handle('group:update', (payload) => {
    host.updateGroup(payload)
  })
  handle('group:remove', (payload) => {
    host.removeGroup(asId(payload))
  })

  on('views:layout', (_event, payload) => {
    const request = payload as LayoutRequest
    const panes = Array.isArray(request?.panes) ? request.panes.filter(isPane).slice(0, 4) : []
    host.setOverlay(Boolean(request?.overlay))
    host.tabs.layout({ panes, overlay: Boolean(request?.overlay) })
  })

  // Épreuves des volets pour le glissement du séparateur. Demandé avant que
  // les vues natives ne quittent la scène : une fois cachées, une capture
  // n’aurait plus de trame à rendre.
  handle('views:snapshot', async (payload) => {
    const ids = Array.isArray(payload)
      ? payload.filter((id): id is string => typeof id === 'string').slice(0, 2)
      : []
    // Les deux captures partent ensemble : en séquence, l’épreuve arrivait
    // après la fin d’un glissement court.
    const shots = await Promise.all(
      ids.map(async (tabId): Promise<PaneSnapshot | null> => {
        const contents = host.tabs.captureSource(tabId)
        if (!contents) return null
        try {
          const image = await Promise.race([
            contents.capturePage(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 240))
          ])
          if (!image || image.isEmpty()) return null
          const size = image.getSize()
          const trimmed = size.width > 720 ? image.resize({ width: 720, quality: 'good' }) : image
          return {
            tabId,
            image: `data:image/jpeg;base64,${trimmed.toJPEG(66).toString('base64')}`
          }
        } catch {
          /* une capture ratée laisse le volet sans épreuve */
          return null
        }
      })
    )
    return shots.filter((shot): shot is PaneSnapshot => shot !== null)
  })
}
