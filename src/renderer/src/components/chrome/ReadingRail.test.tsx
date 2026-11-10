// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOME_URL, type AppView, type TabView } from '@shared/types'
import { useBrowser } from '../../store/browser'
import ReadingRail from './ReadingRail'

type State = ReturnType<typeof useBrowser.getState>

const page = {
  id: 'tab-1',
  spaceId: 'space-1',
  url: 'https://developer.mozilla.org/fr/docs/Web/Media',
  title: 'Formats d’image du Web',
  pinned: false,
  createdAt: 1,
  lastActiveAt: 1,
  loading: false,
  canGoBack: true,
  canGoForward: false,
  blocked: 5,
  agentSent: false,
  error: null,
  asleep: false,
  audible: false,
  muted: false,
  blockedHosts: [
    { host: 'doubleclick.net', count: 3 },
    { host: 'google-analytics.com', count: 2 }
  ]
} satisfies TabView

const home = { ...page, url: HOME_URL, title: 'Accueil', blocked: 0, blockedHosts: [] } satisfies TabView

function viewWith(tab: TabView, over: Partial<AppView> = {}): AppView {
  return {
    spaces: [],
    tabs: [tab],
    groups: [],
    activeSpaceId: 'space-1',
    activeTabId: tab.id,
    secondTabId: null,
    split: false,
    splitRatio: 0.5,
    settings: {},
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
    blockedTotal: 12,
    ...over
  } as unknown as AppView
}

function setRail(over: Partial<State> = {}, tab: TabView = page): void {
  useBrowser.setState({
    view: viewWith(tab),
    notesOpen: false,
    agentOpen: false,
    overlay: null,
    ...over
  })
}

const labels = (): (string | null)[] =>
  screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))

beforeEach(() => {
  Object.defineProperty(window, 'vela', { configurable: true, value: { platform: 'darwin' } })
  setRail()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  useBrowser.setState({ view: null, notesOpen: false, agentOpen: false, overlay: null })
})

describe('rail de lecture', () => {
  it('ne garde que les outils de la page', () => {
    render(<ReadingRail />)

    expect(labels()).toEqual(['Vue scindée', 'Protection de la page'])
  })

  it('pose un filet entre les volets et la protection', () => {
    const { container } = render(<ReadingRail />)
    const rail = container.querySelector('.reading-rail')
    const order = [...(rail?.children ?? [])].map((node) =>
      node.classList.contains('rr-sep') ? 'sep' : node.getAttribute('aria-label')
    )

    expect(order[1]).toBe('sep')
    expect(order.filter((item) => item === 'sep')).toHaveLength(1)
  })

  it('ne prend aucune place sur l’accueil : rien à protéger, rien à scinder', () => {
    setRail({}, home)
    const { container } = render(<ReadingRail />)

    expect(container.querySelector('.reading-rail')).toBeNull()
  })

  it('écrit le compteur de traceurs en chiffres', () => {
    const { container } = render(<ReadingRail />)

    expect([...container.querySelectorAll('.rr-count')].map((node) => node.textContent)).toEqual([
      '5'
    ])
  })

  it('laisse le bouclier en retrait quand le site est exempté', () => {
    setRail({ view: viewWith(page, { privacyExemptions: ['developer.mozilla.org'] }) })
    render(<ReadingRail />)

    const shield = screen.getByRole('button', { name: 'Protection de la page' })
    expect(shield.getAttribute('data-shield')).toBe('off')
    expect(shield.getAttribute('data-on')).toBeNull()
  })

  it('ouvre le panneau du bouclier, puis le referme', () => {
    render(<ReadingRail />)
    const shield = screen.getByRole('button', { name: 'Protection de la page' })

    fireEvent.click(shield)
    expect(useBrowser.getState().overlay).toBe('shield')
    expect(shield.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(shield)
    expect(useBrowser.getState().overlay).toBeNull()
    expect(shield.getAttribute('aria-expanded')).toBe('false')
  })

  it('nomme le geste et son raccourci dans l’infobulle', () => {
    render(<ReadingRail />)
    vi.useFakeTimers()
    const split = screen.getByRole('button', { name: 'Vue scindée' })
    fireEvent.focus(split)
    act(() => {
      vi.advanceTimersByTime(500)
    })

    const tip = screen.getByRole('tooltip')
    expect(tip.textContent).toContain('Vue scindée')
    expect(tip.textContent).toContain('⌘⇧D')
    expect(split.getAttribute('aria-describedby')).toBe(tip.id)

    fireEvent.keyDown(split, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
