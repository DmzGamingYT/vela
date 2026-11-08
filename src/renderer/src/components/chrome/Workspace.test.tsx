// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOME_URL, type AppView, type TabView } from '@shared/types'
import { useBrowser } from '../../store/browser'
import Workspace from './Workspace'

vi.mock('./PaneHeader', () => ({
  default: ({ tab }: { tab: TabView }) => <header>{tab.title}</header>
}))
vi.mock('./StatusBar', () => ({ default: () => <footer>Statut</footer> }))
vi.mock('../start/StartPage', () => ({ default: () => <div>Accueil de test</div> }))

const primary = {
  id: 'primary',
  spaceId: 'space-1',
  url: HOME_URL,
  title: 'Accueil principal',
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
} satisfies TabView

const secondary = { ...primary, id: 'secondary', title: 'Accueil secondaire' }

const commitSplitRatio = vi.fn()
const layout = vi.fn(async () => {})
const snapshot = vi.fn(async () => [])
let observerCallback: ResizeObserverCallback | null = null

function setView(over: { split?: boolean; allowed?: boolean; width?: number } = {}): void {
  useBrowser.setState({
    view: {
      spaces: [],
      tabs: [primary, secondary],
      groups: [],
      activeSpaceId: 'space-1',
      activeTabId: 'primary',
      secondTabId: 'secondary',
      split: over.split ?? true,
      splitRatio: 0.5,
      settings: { sidebarCollapsed: false },
      history: [],
      bookmarks: [],
      privacyExemptions: [],
      memoryFreed: 0,
      canReopen: false,
      tunnelMaps: [],
      notes: [],
      tasks: [],
      works: [],
      downloads: [],
      blockedTotal: 0
    } as unknown as AppView,
    splitAllowed: over.allowed ?? true,
    panesWidth: over.width ?? 668,
    viewportWidth: 980,
    compactViewport: false,
    overlay: null,
    menuOpen: 0,
    peekOpen: false,
    workMode: 'browse',
    notesOpen: false,
    agentOpen: false,
    splitRatioLive: null,
    commitSplitRatio: commitSplitRatio as unknown as ReturnType<
      typeof useBrowser.getState
    >['commitSplitRatio']
  })
}

beforeEach(() => {
  observerCallback = null
  commitSplitRatio.mockReset()
  layout.mockReset()
  snapshot.mockReset()
  class TestResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      observerCallback = callback
    }
    observe(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', TestResizeObserver)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    return setTimeout(() => callback(performance.now()), 0) as unknown as number
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
  vi.stubGlobal('vela', {
    platform: 'darwin',
    views: { layout, snapshot }
  })
  setView()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  useBrowser.setState({ view: null })
})

describe('vue scindée', () => {
  it('affiche les deux pages et un séparateur accessible quand la place suffit', () => {
    render(<Workspace />)

    expect(screen.getByRole('region', { name: 'Panneau principal' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Panneau secondaire' })).toBeTruthy()
    expect(screen.getByRole('separator', { name: 'Largeur de la vue scindée' })).toBeTruthy()
    expect(document.querySelector('.workspace')?.getAttribute('data-split')).toBe('true')
  })

  it('masque le second panneau lorsque le conteneur ne permet pas le split', () => {
    setView({ allowed: false, width: 500 })
    render(<Workspace />)

    expect(screen.getByRole('region', { name: 'Panneau principal' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Panneau secondaire' })).toBeNull()
    expect(screen.queryByRole('separator')).toBeNull()
    expect(document.querySelector('.workspace')?.getAttribute('data-split')).toBe('false')
  })

  it('borne le glissement à la largeur minimale des deux panneaux', async () => {
    const getRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('panes')) {
        return { x: 0, y: 0, left: 0, top: 0, right: 668, bottom: 720, width: 668, height: 720, toJSON: () => ({}) } as DOMRect
      }
      return { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) } as DOMRect
    })
    render(<Workspace />)
    const separator = screen.getByRole('separator', { name: 'Largeur de la vue scindée' })

    fireEvent.pointerDown(separator, { pointerId: 1, clientX: 334, clientY: 100, button: 0 })
    act(() => {
      observerCallback?.([] as unknown as ResizeObserverEntry[], {} as ResizeObserver)
    })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 167, clientY: 100 })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 167, clientY: 100, button: 0 })

    expect(commitSplitRatio).toHaveBeenCalledOnce()
    expect(commitSplitRatio.mock.calls[0][0]).toBeCloseTo(320 / 668)
    getRect.mockRestore()
  })
})
