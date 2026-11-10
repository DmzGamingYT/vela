// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOME_URL, type AppView, type TabView } from '@shared/types'
import { useBrowser } from '../../store/browser'
import ShieldPanel from './ShieldPanel'

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
  // Volontairement dans le désordre : le panneau trie par volume.
  blockedHosts: [
    { host: 'google-analytics.com', count: 2 },
    { host: 'doubleclick.net', count: 3 }
  ]
} satisfies TabView

const nested = {
  ...page,
  blocked: 4,
  blockedHosts: [
    { host: 'stats.doubleclick.net', count: 1 },
    { host: 'ads.doubleclick.net', count: 2 },
    { host: 'cdn.example.com', count: 1 }
  ]
} satisfies TabView

const empty = { ...page, blocked: 0, blockedHosts: [] } satisfies TabView

const home = {
  ...page,
  url: HOME_URL,
  title: 'Accueil',
  blocked: 0,
  blockedHosts: []
} satisfies TabView

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
    blockedToday: 37,
    blockedWeek: 412,
    ...over
  } as unknown as AppView
}

function setPanel(over: Partial<State> = {}, tab: TabView = page): void {
  useBrowser.setState({ view: viewWith(tab), overlay: 'shield', ...over })
}

const toggleSite = vi.fn(async () => true)
const reload = vi.fn(async () => {})

beforeEach(() => {
  toggleSite.mockClear()
  reload.mockClear()
  Object.defineProperty(window, 'vela', {
    configurable: true,
    value: {
      platform: 'darwin',
      privacy: { toggleSite },
      tabs: { reload }
    }
  })
  setPanel()
})

afterEach(() => {
  cleanup()
  useBrowser.setState({ view: null, overlay: null, agentOpen: false, notesOpen: false })
})

const chart = (): (string | null)[] =>
  [...document.querySelectorAll('.shield-mix span')].map((node) => node.getAttribute('data-cat'))

describe('panneau bouclier', () => {
  it('classe les domaines arrêtés par volume décroissant', () => {
    render(<ShieldPanel />)

    const hosts = [...document.querySelectorAll('.shield-host')].map((node) => node.textContent)
    const counts = [...document.querySelectorAll('.shield-count')].map((node) => node.textContent)

    expect(hosts).toEqual(['doubleclick.net', 'google-analytics.com'])
    expect(counts).toEqual(['3', '2'])
  })

  it('donne les trois portées : page, jour, semaine', () => {
    render(<ShieldPanel />)

    const tally = [...document.querySelectorAll('.shield-tally b')].map((node) => node.textContent)
    expect(tally).toEqual(['5', '37', '412'])
  })

  it('étiquette chaque domaine par usage', () => {
    render(<ShieldPanel />)

    const chips = [...document.querySelectorAll('.shield-cat')].map((node) => node.textContent)
    expect(chips).toEqual(['Publicité', 'Analyse'])
  })

  it('trace la répartition par usage', () => {
    render(<ShieldPanel />)

    expect(chart()).toEqual(['ad', 'analytics'])
  })

  it('regroupe les sous-domaines sous leur domaine parent', () => {
    setPanel({}, nested)
    render(<ShieldPanel />)

    const parent = screen.getByRole('button', { name: 'doubleclick.net, 2 sous-domaines' })
    expect(parent.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelectorAll('.shield-row[data-child="true"]')).toHaveLength(0)

    fireEvent.click(parent)

    expect(parent.getAttribute('aria-expanded')).toBe('true')
    const children = [...document.querySelectorAll('.shield-row[data-child="true"] .shield-host')].map(
      (node) => node.textContent
    )
    expect(children).toEqual(['ads.doubleclick.net', 'stats.doubleclick.net'])
  })

  it('autorise un domaine précis, après une confirmation', () => {
    render(<ShieldPanel />)
    const allow = screen.getByRole('button', {
      name: 'Autoriser doubleclick.net sur cette page'
    })

    fireEvent.click(allow)
    expect(toggleSite).not.toHaveBeenCalled()
    expect(allow.textContent).toBe('Confirmer')

    fireEvent.click(allow)
    expect(toggleSite).toHaveBeenCalledWith('doubleclick.net')
  })

  it('protège le site depuis l’interrupteur du haut', () => {
    render(<ShieldPanel />)

    const toggle = screen.getByRole('switch', {
      name: 'Protection sur developer.mozilla.org'
    })
    expect(toggle.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(toggle)

    expect(toggleSite).toHaveBeenCalledWith('developer.mozilla.org')
  })

  it('affiche le bandeau et réactive le site exempté', () => {
    setPanel({ view: viewWith(page, { privacyExemptions: ['developer.mozilla.org'] }) })
    render(<ShieldPanel />)

    const banner = document.querySelector<HTMLElement>('.shield-banner')
    expect(banner?.textContent).toContain('Protection désactivée pour developer.mozilla.org')
    expect(
      screen
        .getByRole('switch', { name: 'Protection sur developer.mozilla.org' })
        .getAttribute('aria-checked')
    ).toBe('false')

    fireEvent.click(within(banner as HTMLElement).getByRole('button', { name: 'Réactiver' }))

    expect(toggleSite).toHaveBeenCalledWith('developer.mozilla.org')
  })

  it('recharge la page depuis le bandeau', () => {
    setPanel({ view: viewWith(page, { privacyExemptions: ['developer.mozilla.org'] }) })
    render(<ShieldPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Recharger' }))

    expect(reload).toHaveBeenCalledWith('tab-1')
  })

  it('liste les sites exemptés, chacun réactivable', () => {
    setPanel({
      view: viewWith(page, { privacyExemptions: ['ads.example', 'tracker.example'] })
    })
    render(<ShieldPanel />)

    const section = screen.getByRole('region', { name: 'Sites exemptés' })
    expect(section.textContent).toContain('ads.example')
    expect(section.textContent).toContain('tracker.example')

    const buttons = section.querySelectorAll('button')
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[1])

    expect(toggleSite).toHaveBeenCalledWith('tracker.example')
  })

  it('reste calme quand rien n’a été arrêté', () => {
    setPanel({}, empty)
    render(<ShieldPanel />)

    expect(document.body.textContent).toContain('Aucune requête arrêtée sur cette page')
    expect(document.querySelector('.shield-tally')).toBeNull()
    expect(document.querySelector('.shield-mix')).toBeNull()
  })

  it('invite à ouvrir une page sur l’accueil', () => {
    setPanel({}, home)
    render(<ShieldPanel />)

    expect(document.body.textContent).toContain('Ouvrez une page pour voir les requêtes')
    expect(document.querySelector('.shield-rows')).toBeNull()
  })

  it('ferme la feuille', () => {
    render(<ShieldPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))

    expect(useBrowser.getState().overlay).toBeNull()
  })

  it('conduit aux réglages de confidentialité par un lien', () => {
    render(<ShieldPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Réglages de confidentialité' }))

    expect(useBrowser.getState().overlay).toBe('settings')
  })
})
