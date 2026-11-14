/**
 * Espaces de navigation et leur journal Letterboxd.
 *
 * `space:create` et `space:update` reçoivent une charge libre : c'est
 * `host.addSpace` / `host.updateSpace` qui la normalisent (nom, couleurs,
 * raccourcis, fond). Le contrat dit « forme libre » au lieu de le suggérer.
 */
import { sanitizeLetterboxdLog } from '@shared/letterboxd'
import { fetchLetterboxdLog } from '../letterboxd'
import { Any, Id, bindContracts, request } from './contract'
import type { IpcHost } from './host'
import type { Handle, On } from './types'

export function registerSpacesIpc(host: IpcHost, handle: Handle, on: On): void {
  bindContracts(
    [
      request('space:create', Any, (input) => {
        host.addSpace(input)
        return host.view()
      }),

      request('space:update', Any, (input) => {
        host.updateSpace(input)
        return host.view()
      }),

      request('space:remove', Id, (id) => {
        host.removeSpace(id)
        return host.view()
      }),

      request('space:duplicate', Id, (id) => {
        host.duplicateSpace(id)
        return host.view()
      }),

      request('space:clear-data', Id, async (id) => {
        await host.clearSpaceData(id)
        return host.view()
      }),

      request('space:activate', Id, (id) => {
        host.activateSpace(id)
        return host.view()
      }),

      // Import du journal Letterboxd : une seule sortie réseau, documentée dans
      // l'audit. Aucun cookie, aucune session d'espace réutilisée.
      request('letterboxd:import', Id, async (id) => {
        const space = host.store.get().spaces.find((item) => item.id === id)
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
    ],
    handle,
    on
  )
}
