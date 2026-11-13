// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { differe } from './differe'

function Reglages() {
  return <p>Réglages</p>
}

type Module = { default: typeof Reglages }

/** Chargeur retenu : le test décide quand le module arrive. */
function chargerRetenu() {
  let resoudre: (module: Module) => void = () => {}
  const charger = vi.fn(
    () =>
      new Promise<Module>((resolve) => {
        resoudre = resolve
      })
  )
  return { charger, resoudre: (module: Module): void => resoudre(module) }
}

afterEach(cleanup)

describe('differe', () => {
  it('ne rend rien avant le module, puis le panneau', async () => {
    const source = chargerRetenu()
    const { Panneau, precharger } = differe(source.charger)

    render(<Panneau />)
    expect(screen.queryByText('Réglages')).toBeNull()

    await act(async () => {
      // Laisse le chargeur démarrer : il n'est appelé qu'à la microtâche.
      await Promise.resolve()
      source.resoudre({ default: Reglages })
      await precharger()
    })
    expect(screen.getByText('Réglages')).toBeTruthy()
    expect(source.charger).toHaveBeenCalledTimes(1)
  })

  it('ne charge le module qu’une fois, même si le préchargement devance le montage', async () => {
    const source = chargerRetenu()
    const { Panneau, precharger } = differe(source.charger)

    const premier = precharger()
    const second = precharger()
    await Promise.resolve()
    expect(source.charger).toHaveBeenCalledTimes(1)

    render(<Panneau />)
    await act(async () => {
      source.resoudre({ default: Reglages })
      await premier
      await second
    })

    expect(screen.getByText('Réglages')).toBeTruthy()
    await precharger()
    expect(source.charger).toHaveBeenCalledTimes(1)
  })

  it('avale un échec sans promesse rejetée, puis retente au montage suivant', async () => {
    const charger = vi
      .fn<() => Promise<Module>>()
      .mockRejectedValueOnce(new Error('chunk illisible'))
      .mockResolvedValueOnce({ default: Reglages })
    const { Panneau, precharger } = differe(charger)

    await expect(precharger()).resolves.toBeUndefined()
    expect(charger).toHaveBeenCalledTimes(1)

    render(<Panneau />)
    expect(await screen.findByText('Réglages')).toBeTruthy()
    expect(charger).toHaveBeenCalledTimes(2)
  })

  it('démonter avant l’arrivée du module ne casse pas le rendu suivant', async () => {
    const source = chargerRetenu()
    const { Panneau, precharger } = differe(source.charger)

    const vue = render(<Panneau />)
    vue.unmount()
    await act(async () => {
      await Promise.resolve()
      source.resoudre({ default: Reglages })
      await precharger()
    })

    render(<Panneau />)
    expect(screen.getByText('Réglages')).toBeTruthy()
  })
})
