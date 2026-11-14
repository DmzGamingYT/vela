/**
 * Bloqueur de requêtes : exemption par site.
 *
 * Le nom du site est normalisé avant d'atteindre le store : minuscules, sans
 * espaces autour, pour que « Exemple.com » et « exemple.com » soient une entrée.
 */
import { bindContracts, field, request } from './contract'
import type { IpcHost } from './host'
import type { Handle, On } from './types'

const Site = field<string>('site', (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : ''
)

export function registerPrivacyIpc(host: IpcHost, handle: Handle, on: On): void {
  bindContracts(
    [
      request('privacy:toggle-site', Site, (site) => {
        if (!site) return false
        const exempted = host.store.togglePrivacyExemption(site)
        host.broadcast()
        return exempted
      })
    ],
    handle,
    on
  )
}
