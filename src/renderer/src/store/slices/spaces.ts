import type { StateCreator } from 'zustand'
import type { CreateSpaceInput, UpdateSpaceInput } from '@shared/api'
import type { SpaceShortcut } from '@shared/space'
import type { BrowserState } from '../browser'
import { captureTrigger } from '../trigger'

export interface SpacesSlice {
  spaceEditId: string | null
  openSpaceDialog(id?: string): void
  activateSpace(id: string): void
  createSpace(input: CreateSpaceInput): Promise<void>
  updateSpace(id: string, patch: Omit<UpdateSpaceInput, 'id'>): Promise<void>
  saveSpaceShortcuts(id: string, shortcuts: SpaceShortcut[]): Promise<void>
  removeSpace(id: string): Promise<void>
  duplicateSpace(id: string): Promise<void>
  clearSpaceData(id: string): Promise<void>
}

/** Espaces : fenêtre de création, activation et rangement des sites épinglés. */
export const createSpacesSlice: StateCreator<BrowserState, [], [], SpacesSlice> = (set, get) => ({
  spaceEditId: null,

  openSpaceDialog(id) {
    // Même capture que `setOverlay` : ce chemin n'y passe pas, et sans elle le
    // dialogue rendait le focus au `body` à la fermeture.
    set({
      overlay: 'space',
      overlayTrigger: captureTrigger(get().overlayTrigger),
      spaceEditId: id ?? null
    })
  },

  activateSpace(id) {
    void get().call(() => window.vela.spaces.activate(id), 'Profil introuvable.')
  },

  async createSpace(input) {
    await get().call(() => window.vela.spaces.create(input), 'Impossible de créer le profil.')
    set({ overlay: null })
    get().toast('Nouveau profil prêt.')
  },

  async updateSpace(id, patch) {
    await get().call(
      () => window.vela.spaces.update({ id, ...patch }),
      'Impossible de modifier le profil.'
    )
    set({ overlay: null })
  },

  // Barre de sites épinglés : l'affichage bouge tout de suite, le disque suit.
  // Le prochain `view` reçu du processus principal fait foi.
  async saveSpaceShortcuts(id, shortcuts) {
    set((state) =>
      state.view
        ? {
            view: {
              ...state.view,
              spaces: state.view.spaces.map((space) =>
                space.id === id ? { ...space, shortcuts } : space
              )
            }
          }
        : {}
    )
    await get().call(
      () => window.vela.spaces.update({ id, shortcuts }),
      'Impossible d’enregistrer les sites de ce profil.'
    )
  },

  async removeSpace(id) {
    const result = await get().call(
      () => window.vela.spaces.remove(id),
      'Impossible de supprimer le profil.'
    )
    if (result !== null) {
      set({ overlay: null })
      get().toast('Profil supprimé.')
    }
  },

  async duplicateSpace(id) {
    const result = await get().call(
      () => window.vela.spaces.duplicate(id),
      'Impossible de dupliquer le profil.'
    )
    if (result !== null) {
      set({ overlay: null })
      get().toast('Profil dupliqué.')
    }
  },

  async clearSpaceData(id) {
    const result = await get().call(
      () => window.vela.spaces.clearData(id),
      'Impossible de vider les données du profil.'
    )
    if (result !== null) {
      set({ overlay: null })
      get().toast('Données du profil effacées.')
    }
  }
})
