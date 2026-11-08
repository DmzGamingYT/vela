// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/defaults'
import type { AppView, TabView } from '@shared/types'
import { useBrowser } from '../../store/browser'
import CommandBar from './CommandBar'

const setOverlay = vi.fn()
const requestNote = vi.fn()
const splitToggle = vi.fn()
const newTab = vi.fn()
const selectTab = vi.fn()

const page = (id: string, url: string, title: string): TabView => ({
  id,
  spaceId: 'space-1',
  url,
  title,
  pinned: false,
  createdAt: 1,
  lastActiveAt: 1,
  loading: false,
  canGoBack: false,
  canGoForward: false,
  blocked: 0,
  agentSent: false,
  error: null,
  asleep: false,
  audible: false,
  muted: false,
  blockedHosts: []
})

function setView(): void {
  const settings = structuredClone(DEFAULT_SETTINGS)
  useBrowser.setState({
    view: {
      spaces: [
        {
          id: 'space-1',
          name: 'Personnel',
          color: '#5B56D6',
          partition: 'persist:test',
          createdAt: 1
        }
      ],
      tabs: [page('tab-1', 'https://example.com/', 'Example Domain')],
      groups: [],
      activeSpaceId: 'space-1',
      activeTabId: 'tab-1',
      secondTabId: null,
      split: false,
      splitRatio: 0.5,
      settings,
      history: [],
      bookmarks: [],
      privacyExemptions: [],
      memoryFreed: 0,
      canReopen: false,
      tunnelMaps: [],
      notes: [
        {
          id: 'note-1',
          title: 'Idée de voyage',
          preview: 'Préparer un itinéraire pour Lyon',
          spaceId: 'space-1',
          tags: [],
          pinned: false,
          updatedAt: 1
        }
      ],
      tasks: [],
      works: [],
      downloads: [],
      blockedTotal: 0
    } as AppView,
    overlay: 'command',
    setOverlay: setOverlay as unknown as ReturnType<typeof useBrowser.getState>['setOverlay'],
    requestNote: requestNote as unknown as ReturnType<typeof useBrowser.getState>['requestNote'],
    splitToggle: splitToggle as unknown as ReturnType<typeof useBrowser.getState>['splitToggle'],
    newTab: newTab as unknown as ReturnType<typeof useBrowser.getState>['newTab'],
    selectTab: selectTab as unknown as ReturnType<typeof useBrowser.getState>['selectTab']
  })
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  setOverlay.mockReset()
  requestNote.mockReset()
  splitToggle.mockReset()
  newTab.mockReset()
  selectTab.mockReset()
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  vi.stubGlobal('vela', {
    platform: 'darwin',
    avatars: { read: vi.fn(async () => null) },
    peek: { open: vi.fn(async () => undefined) }
  })
  setView()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(callback, 0))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  useBrowser.setState({ view: null, overlay: null })
})

describe('barre de commande', () => {
  it('ferme la palette et exécute la commande sélectionnée avec les flèches et Entrée', async () => {
    render(<CommandBar />)
    const input = screen.getByRole('textbox', { name: 'Rechercher' })

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(setOverlay).toHaveBeenCalledWith(null)
    await waitFor(() => expect(newTab).toHaveBeenCalledOnce())
  })

  it('filtre les notes et ouvre la note choisie', async () => {
    render(<CommandBar />)
    fireEvent.click(screen.getByRole('tab', { name: 'Notes' }))

    expect(screen.getByRole('button', { name: /Idée de voyage/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Nouvel onglet' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Idée de voyage/ }))
    expect(setOverlay).toHaveBeenCalledWith(null)
    await waitFor(() => expect(requestNote).toHaveBeenCalledWith('note-1'))
  })

  it('ferme la palette avec Échap sans lancer une action', () => {
    render(<CommandBar />)
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Rechercher' }), { key: 'Escape' })

    expect(setOverlay).toHaveBeenCalledWith(null)
    expect(newTab).not.toHaveBeenCalled()
  })

  it('expose Vue scindée comme action appelable', async () => {
    render(<CommandBar />)
    fireEvent.click(screen.getByRole('button', { name: /Vue scindée/ }))

    expect(setOverlay).toHaveBeenCalledWith(null)
    await waitFor(() => expect(splitToggle).toHaveBeenCalledOnce())
  })
})
