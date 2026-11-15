import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTabsSlice } from './tabs'

/**
 * Fermer une épingle ne doit pas la perdre : la page se décharge, l’épingle
 * reste. C’est le geste de Dia, et il tient en une branche du store.
 */
function setup(pinned: boolean) {
  const discard = vi.fn().mockResolvedValue(true)
  const close = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('window', { vela: { tabs: { discard, close } } })

  const tab = { id: 't1', pinned, url: 'https://exemple.fr/', title: 'Exemple' }
  const view = { tabs: [tab] }
  const toast = vi.fn()
  const state = {
    view,
    toast,
    call: async (action: () => Promise<unknown>) => {
      await action()
      return true
    }
  }
  const get = (): typeof state => state
  const set = (): void => undefined
  const slice = createTabsSlice(set as never, get as never)
  // `closeTab` se rappelle lui-même pour le « Fermer » de l’info-bulle.
  ;(state as unknown as { closeTab: typeof slice.closeTab }).closeTab = slice.closeTab
  return { slice, discard, close, toast }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fermeture d’un onglet épinglé', () => {
  it('met la page en veille au lieu de retirer l’épingle', async () => {
    const { slice, discard, close, toast } = setup(true)
    slice.closeTab('t1')
    await Promise.resolve()
    await Promise.resolve()
    expect(discard).toHaveBeenCalledWith('t1')
    expect(close).not.toHaveBeenCalled()
    // Le message propose la vraie fermeture : rien n’est perdu sans recours.
    expect(toast.mock.calls[0][2]).toMatchObject({ label: 'Fermer' })
  })

  it('ferme vraiment quand on le demande', async () => {
    const { slice, discard, close } = setup(true)
    slice.closeTab('t1', true)
    await Promise.resolve()
    expect(close).toHaveBeenCalledWith('t1')
    expect(discard).not.toHaveBeenCalled()
  })

  it('ferme un onglet normal sans le mettre en veille', async () => {
    const { slice, discard, close } = setup(false)
    slice.closeTab('t1')
    await Promise.resolve()
    expect(close).toHaveBeenCalledWith('t1')
    expect(discard).not.toHaveBeenCalled()
  })
})
