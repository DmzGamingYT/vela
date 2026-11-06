import type { StateCreator } from 'zustand'
import { isHomeUrl } from '@shared/url'
import type { BrowserState } from '../browser'

export interface PrivacySlice {
  toggleSiteProtection(host: string): Promise<void>
}

/** Bloqueur de requêtes : exemption par site, puis rechargement de la page. */
export const createPrivacySlice: StateCreator<BrowserState, [], [], PrivacySlice> = (
  _set,
  get
) => ({
  async toggleSiteProtection(host) {
    if (!host) return
    const exempted = await get().call(
      () => window.vela.privacy.toggleSite(host),
      'Réglage non enregistré.'
    )
    if (exempted === null) return
    get().toast(exempted ? `Bloqueur désactivé pour ${host}.` : `Bloqueur réactivé pour ${host}.`)
    const view = get().view
    const active = view?.tabs.find((tab) => tab.id === view.activeTabId)
    if (active && !isHomeUrl(active.url)) get().reload(active.id)
  }
})
