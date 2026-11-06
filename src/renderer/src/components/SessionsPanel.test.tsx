// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppView, TabView } from '@shared/types'
import { useBrowser } from '../store/browser'
import SessionsPanel from './SessionsPanel'

function page(id: string, url: string): TabView {
  return { id, spaceId: 'space-1', url, title: id } as unknown as TabView
}

function setTabs(tabs: TabView[]): void {
  useBrowser.setState({
    view: {
      activeSpaceId: 'space-1',
      spaces: [{ id: 'space-1', name: 'Personnel', color: '#5B56D6' }],
      tabs,
      bookmarks: []
    } as unknown as AppView,
    overlay: 'sessions'
  })
}

beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(window, 'vela', {
    configurable: true,
    value: { platform: 'darwin' }
  })
})

afterEach(() => {
  cleanup()
  useBrowser.setState({ view: null, overlay: null })
})

describe('panneau Sessions', () => {
  it('accorde les compteurs au singulier', () => {
    setTabs([page('Article', 'https://example.com/article')])
    render(<SessionsPanel />)
    expect(screen.getByText('onglet ouvert')).toBeTruthy()
    expect(screen.getByText('session gardée')).toBeTruthy()
    expect(screen.getByText('page sauvegardée')).toBeTruthy()
  })

  it('passe au pluriel dès la deuxième page', () => {
    setTabs([page('Article', 'https://example.com/article'), page('Suite', 'https://example.com/suite')])
    render(<SessionsPanel />)
    expect(screen.getByText('onglets ouverts')).toBeTruthy()
  })
})
