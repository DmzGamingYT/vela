// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useBrowser } from '../../store/browser'
import SidebarFoot from './SidebarFoot'

// Le sélecteur des téléchargements retombe sur `[]` quand `view` est nul : un
// tableau neuf à chaque rendu ferait boucler `useSyncExternalStore`. Le pied
// ne lit que ces listes, donc un `view` minimal suffit.
const footView = { downloads: [], notes: [] } as never

beforeEach(() => {
  useBrowser.setState({
    overlay: null,
    view: footView,
    notesOpen: false,
    agentOpen: false
  })
})

afterEach(() => {
  cleanup()
  useBrowser.setState({ overlay: null, view: null, notesOpen: false, agentOpen: false })
})

describe('pied de la barre latérale', () => {
  it('garde les listes et les panneaux sur une seule rangée', () => {
    render(<SidebarFoot query="" onQuery={() => undefined} asleep={0} />)

    expect(screen.getByRole('button', { name: 'Historique' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Marque-pages' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Notes' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Demander à l’agent' })).toBeTruthy()
  })

  it('ouvre la liste des marque-pages, puis la referme', () => {
    render(<SidebarFoot query="" onQuery={() => undefined} asleep={0} />)
    const list = screen.getByRole('button', { name: 'Marque-pages' })

    fireEvent.click(list)
    expect(useBrowser.getState().overlay).toBe('bookmarks')
    expect(list.getAttribute('data-active')).toBe('true')

    fireEvent.click(list)
    expect(useBrowser.getState().overlay).toBeNull()
    expect(list.getAttribute('data-active')).toBeNull()
  })

  it('ouvre les notes depuis le pied', () => {
    render(<SidebarFoot query="" onQuery={() => undefined} asleep={0} />)
    const notes = screen.getByRole('button', { name: 'Notes' })

    fireEvent.click(notes)
    expect(useBrowser.getState().notesOpen).toBe(true)
    expect(notes.getAttribute('data-active')).toBe('true')
  })

  it('ouvre l’agent sans laisser les notes derrière', () => {
    useBrowser.setState({ notesOpen: true })
    render(<SidebarFoot query="" onQuery={() => undefined} asleep={0} />)

    fireEvent.click(screen.getByRole('button', { name: 'Demander à l’agent' }))

    expect(useBrowser.getState().agentOpen).toBe(true)
    expect(useBrowser.getState().notesOpen).toBe(false)
  })
})
