// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SidebarFoot from './SidebarFoot'

afterEach(cleanup)

describe('pied de la barre latérale', () => {
  it('filtre les onglets à la frappe', () => {
    const onQuery = vi.fn()
    render(<SidebarFoot query="" onQuery={onQuery} asleep={0} />)

    fireEvent.change(screen.getByLabelText('Filtrer les onglets de ce profil'), {
      target: { value: 'wikipedia' }
    })

    expect(onQuery).toHaveBeenCalledWith('wikipedia')
  })

  it('vide la recherche avec Échap et avec la croix', () => {
    const onQuery = vi.fn()
    render(<SidebarFoot query="wikipedia" onQuery={onQuery} asleep={0} />)

    fireEvent.keyDown(screen.getByLabelText('Filtrer les onglets de ce profil'), { key: 'Escape' })
    expect(onQuery).toHaveBeenCalledWith('')

    fireEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }))
    expect(onQuery).toHaveBeenCalledTimes(2)
    expect(onQuery).toHaveBeenLastCalledWith('')
  })

  it('compte les onglets en veille, au singulier comme au pluriel', () => {
    const { rerender } = render(<SidebarFoot query="" onQuery={() => undefined} asleep={1} />)
    expect(screen.getByText('1 onglet en veille')).toBeTruthy()

    rerender(<SidebarFoot query="" onQuery={() => undefined} asleep={3} />)
    expect(screen.getByText('3 onglets en veille')).toBeTruthy()
  })
})
