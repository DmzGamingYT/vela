import type { IpcHost } from './host'
import type { Handle } from './types'

/** Bloqueur de requêtes : exemption par site. */
export function registerPrivacyIpc(host: IpcHost, handle: Handle): void {
  handle('privacy:toggle-site', (payload) => {
    const site = typeof payload === 'string' ? payload.trim().toLowerCase() : ''
    if (!site) return false
    const exempted = host.store.togglePrivacyExemption(site)
    host.broadcast()
    return exempted
  })
}
