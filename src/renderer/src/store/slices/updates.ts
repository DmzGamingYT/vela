import type { StateCreator } from 'zustand'
import type { UpdateInfo } from '@shared/api'
import { RELEASES_URL } from '@shared/site'
import type { BrowserState } from '../browser'

export interface UpdatesSlice {
  update: UpdateInfo | null
  refreshUpdate(): Promise<void>
  checkUpdate(): Promise<void>
  downloadUpdate(): Promise<void>
  cancelUpdate(): Promise<void>
  installUpdate(): Promise<void>
  openReleases(): Promise<void>
}

/** Mises à jour de l'application : état de la barre et actions. */
export const createUpdatesSlice: StateCreator<BrowserState, [], [], UpdatesSlice> = (set, get) => ({
  update: null,

  async refreshUpdate() {
    const info = await get().call(
      () => window.vela.updates.status(),
      'État de mise à jour indisponible.'
    )
    if (info) set({ update: info })
  },

  async checkUpdate() {
    set((state) => ({
      update: state.update
        ? { ...state.update, state: 'checking', message: null }
        : {
            state: 'checking',
            version: null,
            currentVersion: '',
            progress: 0,
            message: null,
            releaseUrl: RELEASES_URL
          }
    }))
    const info = await get().call(() => window.vela.updates.check(), 'Vérification impossible.')
    if (info) {
      set({ update: info })
      if (info.state === 'not-available') get().toast('Vela est à jour.')
      else if (info.state === 'error' && info.message) get().toast(info.message, 'error')
    }
  },

  async downloadUpdate() {
    const info = await get().call(
      () => window.vela.updates.download(),
      'Téléchargement impossible.'
    )
    if (info) set({ update: info })
  },

  async cancelUpdate() {
    const info = await get().call(() => window.vela.updates.cancel(), 'Annulation impossible.')
    if (info) set({ update: info })
  },

  async installUpdate() {
    await get().call(() => window.vela.updates.install(), 'Redémarrage impossible.')
  },

  async openReleases() {
    await get().call(() => window.vela.updates.releases(), 'Ouverture impossible.')
  }
})
