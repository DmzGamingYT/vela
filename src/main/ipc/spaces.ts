import { sanitizeLetterboxdLog } from '@shared/letterboxd'
import { fetchLetterboxdLog } from '../letterboxd'
import type { IpcHost } from './host'
import type { Handle } from './types'
import { asId } from './util'

/** Espaces de navigation et leur journal Letterboxd. */
export function registerSpacesIpc(host: IpcHost, handle: Handle): void {
  handle('space:create', (payload) => {
    host.addSpace(payload)
    return host.view()
  })
  handle('space:update', (payload) => {
    host.updateSpace(payload)
    return host.view()
  })
  handle('space:remove', (payload) => {
    host.removeSpace(asId(payload))
    return host.view()
  })
  handle('space:duplicate', (payload) => {
    host.duplicateSpace(asId(payload))
    return host.view()
  })
  handle('space:clear-data', async (payload) => {
    await host.clearSpaceData(asId(payload))
    return host.view()
  })
  handle('space:activate', (payload) => {
    host.activateSpace(asId(payload))
    return host.view()
  })
  // Import du journal Letterboxd : une seule sortie réseau, documentée dans
  // l'audit. Aucun cookie, aucune session d'espace réutilisée.
  handle('letterboxd:import', async (payload) => {
    const space = host.store.get().spaces.find((item) => item.id === asId(payload))
    if (!space) return { ok: false, count: 0, at: null, reason: 'no-space' }
    const kept = space.letterboxdLog?.length ?? 0
    const result = await fetchLetterboxdLog(space.letterboxd)
    if (!result.ok) {
      return { ok: false, count: kept, at: space.letterboxdLogAt ?? null, reason: result.reason }
    }
    space.letterboxdLog = sanitizeLetterboxdLog(result.entries)
    space.letterboxdLogAt = Date.now()
    host.store.schedule()
    host.broadcast()
    return { ok: true, count: space.letterboxdLog.length, at: space.letterboxdLogAt }
  })
}
