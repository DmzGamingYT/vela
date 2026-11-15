// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useBrowser } from '../../store/browser'
import SpaceRail from './SpaceRail'

// Le rail ne lit que les profils, la barre latérale et deux listes : un `view`
// minimal suffit, et un tableau neuf à chaque rendu ferait boucler le store.
const railView = {
  spaces: [
    { id: 'space-1', name: 'Personnel', color: '#5B56D6', partition: 'persist:test', createdAt: 1 }
  ],
  activeSpaceId: 'space-1',
  settings: { sidebarCollapsed: false },
  notes: [{ id: 'note-1' }],
  downloads: []
} as never

beforeEach(() => {
  useBrowser.setState({
    overlay: null,
    view: railView,
    notesOpen: false,
    agentOpen: false
  })
})

afterEach(() => {
  cleanup()
  useBrowser.setState({ overlay: null, view: null, notesOpen: false, agentOpen: false })
})

describe('outils du rail', () => {
  it('garde les trois raccourcis dans le rail, badge des notes compris', () => {
    render(<SpaceRail />)

    expect(screen.getByRole('button', { name: 'Notes' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Demander à l’agent' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Bibliothèque' })).toBeTruthy()
    expect(document.querySelector('.rail-tool-count')?.textContent).toBe('1')
  })

  it('ouvre la bibliothèque sur les marque-pages, puis la referme', () => {
    render(<SpaceRail />)
    const list = screen.getByRole('button', { name: 'Bibliothèque' })

    fireEvent.click(list)
    expect(useBrowser.getState().overlay).toBe('bookmarks')
    expect(list.getAttribute('data-active')).toBe('true')

    fireEvent.click(list)
    expect(useBrowser.getState().overlay).toBeNull()
    expect(list.getAttribute('data-active')).toBeNull()
  })

  it('ouvre les notes depuis le rail', () => {
    render(<SpaceRail />)
    const notes = screen.getByRole('button', { name: 'Notes' })

    fireEvent.click(notes)
    expect(useBrowser.getState().notesOpen).toBe(true)
    expect(notes.getAttribute('data-active')).toBe('true')
  })

  it('ouvre l’agent sans laisser les notes derrière', () => {
    useBrowser.setState({ notesOpen: true })
    render(<SpaceRail />)

    fireEvent.click(screen.getByRole('button', { name: 'Demander à l’agent' }))

    expect(useBrowser.getState().agentOpen).toBe(true)
    expect(useBrowser.getState().notesOpen).toBe(false)
  })
})
