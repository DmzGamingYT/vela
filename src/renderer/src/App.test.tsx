// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/defaults'
import { HOME_URL, type AppView, type TabView } from '@shared/types'
import App from './App'
import { useBrowser } from './store/browser'

// Un onglet d'accueil : sans lui, Workspace n'affiche pas StartPage et le
// titre de la fenêtre n'existe pas encore.
const home = {
  id: 'primary',
  spaceId: 'space-1',
  url: HOME_URL,
  title: 'Accueil',
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

const view = {
  settings: { ...structuredClone(DEFAULT_SETTINGS), onboarded: true },
  spaces: [{ id: 'space-1', name: 'Personnel', color: '#5B5BD6' }],
  activeSpaceId: 'space-1',
  activeTabId: 'primary',
  secondTabId: null,
  split: false,
  splitRatio: 0.5,
  tabs: [home],
  groups: [],
  bookmarks: [],
  history: [],
  downloads: [],
  notes: [],
  tasks: [],
  tunnelMaps: [],
  privacyExemptions: [],
  memoryFreed: 0,
  canReopen: false
} as unknown as AppView

/**
 * Pont minimal : la coque appelle beaucoup de canaux (vues, aperçu, onglets)
 * dont ce test n'a rien à faire. Chaque canal répond `[]` ou rend une fonction
 * de désabonnement, selon qu'il est un `on…` ou non.
 */
function velaStub(): unknown {
  const group = new Proxy(
    {},
    {
      get: (_target, method) => {
        if (method === 'then') return undefined
        if (String(method).startsWith('on')) return vi.fn(() => () => {})
        return vi.fn(async () => [])
      }
    }
  )
  return new Proxy({}, { get: (_target, prop) => (prop === 'platform' ? 'darwin' : group) })
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('vela', velaStub())
  Element.prototype.scrollIntoView = vi.fn()
  // jsdom ne mesure pas les panneaux : les observateurs restent inertes.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  )
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  )
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  )
  // Le pont est hors sujet ici : l'état est posé directement, `init` ne doit
  // pas tenter de lire la vue par IPC.
  useBrowser.setState({ ready: true, view, overlay: null, init: vi.fn(async () => {}) })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
  useBrowser.setState({ ready: false, view: null, overlay: null })
})

const fond = (): HTMLElement | null => document.querySelector('.app-bg')
const h1s = (): string[] =>
  [...document.querySelectorAll('h1')].map((node) => node.textContent?.trim() ?? '')

describe('coque de l’application', () => {
  it('garde un seul h1 et rend le fond inerte quand les réglages s’ouvrent', async () => {
    render(<App />)

    // L'accueil porte le titre de la fenêtre, et lui seul. Le texte dépend de
    // l'heure (« Bonjour », « Bel après-midi »…) : seul le compte est figé.
    await waitFor(() => expect(h1s()).toHaveLength(1))
    expect(h1s()[0]?.length).toBeGreaterThan(0)
    expect(fond()?.hasAttribute('inert')).toBe(false)

    const declencheur = document.querySelector('.rail-settings') as HTMLElement
    declencheur.focus()
    fireEvent.click(declencheur)

    // Le panneau est chargé à la demande : il arrive après une microtâche.
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Réglages' })).toBeTruthy())

    // Le titre de la feuille est un h2 : pas de second h1 dans le document.
    expect(screen.getByRole('heading', { level: 2, name: 'Vue d’ensemble' })).toBeTruthy()
    expect(h1s()).toHaveLength(1)

    // Rail, barre latérale, page et tiroirs sortent du clavier et de l'arbre
    // d'accessibilité pendant que la feuille est ouverte.
    expect(fond()?.hasAttribute('inert')).toBe(true)

    fireEvent.keyDown(document.body, { key: 'Escape' })

    await waitFor(() => expect(fond()?.hasAttribute('inert')).toBe(false))
    // La feuille rend le focus au bouton qui l'a ouverte, pas au `body`.
    await waitFor(() => expect(document.activeElement).toBe(declencheur))
  })

  it('rend le fond inerte pendant l’accueil de bienvenue, puis le libère', async () => {
    const accueil = {
      ...view,
      settings: { ...view.settings, onboarded: false }
    }
    useBrowser.setState({ view: accueil })
    render(<App />)

    await waitFor(() =>
      expect(document.querySelector('[role="dialog"][aria-label="Bienvenue dans Vela"]')).toBeTruthy()
    )
    expect(fond()?.hasAttribute('inert')).toBe(true)
    // L'accueil reste le seul titre, même derrière la bienvenue.
    expect(h1s()).toHaveLength(1)

    // Fin de la bienvenue : le fond redevient atteignable.
    act(() => {
      useBrowser.setState({
        view: { ...accueil, settings: { ...accueil.settings, onboarded: true } }
      })
    })
    await waitFor(() => expect(fond()?.hasAttribute('inert')).toBe(false))
  })

  it('ignore les Réglages du menu tant que l’assistant n’est pas terminé', () => {
    const accueil = {
      ...view,
      settings: { ...view.settings, onboarded: false }
    }
    useBrowser.setState({ view: accueil })

    // Le menu natif envoie la même action que la palette : elle ne doit pas
    // poser la feuille par-dessus l'assistant, seule surface de ce moment-là.
    useBrowser.getState().handleShortcut({ action: 'settings' })
    expect(useBrowser.getState().overlay).toBeNull()

    // Une fois l'assistant terminé, l'action reprend son effet.
    useBrowser.setState({ view })
    useBrowser.getState().handleShortcut({ action: 'settings' })
    expect(useBrowser.getState().overlay).toBe('settings')
  })

  it('ne rend jamais deux h1 à la fois, surface par surface', async () => {
    render(<App />)
    await waitFor(() => expect(h1s()).toHaveLength(1))
    const accueil = h1s()

    const surfaces = [
      {
        nom: 'agent',
        bouton: '.foot-btn[aria-label="Demander à l’agent"]',
        present: () => document.querySelector('.agent')
      },
      {
        nom: 'marque-pages',
        bouton: '.foot-btn[aria-label="Marque-pages"]',
        present: () => document.querySelector('[role="dialog"][aria-label="Marque-pages"]')
      },
      {
        nom: 'historique',
        bouton: '.foot-btn[aria-label="Historique"]',
        present: () => document.querySelector('[role="dialog"][aria-label="Historique"]')
      },
      {
        nom: 'téléchargements',
        bouton: '.foot-btn[aria-label^="Téléchargements"]',
        present: () => document.querySelector('[role="dialog"][aria-label="Téléchargements"]')
      },
      {
        nom: 'profil',
        bouton: '.space-add',
        present: () => document.querySelector('[role="dialog"][aria-label="Nouveau profil"]')
      },
      {
        nom: 'réglages',
        bouton: '.rail-settings',
        present: () => document.querySelector('[role="dialog"][aria-label="Réglages"]')
      }
    ]

    for (const surface of surfaces) {
      const declencheur = document.querySelector(surface.bouton) as HTMLElement | null
      expect(declencheur, `déclencheur ${surface.nom}`).toBeTruthy()
      declencheur?.focus()
      fireEvent.click(declencheur as HTMLElement)

      await waitFor(() => expect(Boolean(surface.present()), surface.nom).toBe(true))
      // L'accueil reste monté derrière : la surface ajoute un titre, jamais un second h1.
      expect({ surface: surface.nom, h1: h1s() }).toEqual({
        surface: surface.nom,
        h1: accueil
      })

      fireEvent.keyDown(document.body, { key: 'Escape' })
      await waitFor(() => expect(Boolean(surface.present()), surface.nom).toBe(false))
    }
  })

  it('aucun composant de surface ne pose de h1 hors des pages autorisées', () => {
    // Les seules pages qui portent le titre de la fenêtre : l'accueil et les
    // deux étapes du tunnel. Une feuille ou un panneau qui réintroduit un h1
    // créerait deux titres concurrents ; ce test le refuse à la source.
    const autorisees = new Set([
      'start/StartPage.tsx',
      'tunnel/TunnelAsk.tsx',
      'tunnel/TunnelSynthesis.tsx'
    ])
    const dossier = resolve(process.cwd(), 'src/renderer/src/components')
    const fautifs = readdirSync(dossier, { recursive: true })
      .map(String)
      .filter((nom) => nom.endsWith('.tsx'))
      .filter((nom) => readFileSync(`${dossier}/${nom}`, 'utf8').includes('<h1'))
      .map((nom) => relative(dossier, `${dossier}/${nom}`).split('\\').join('/'))
      .filter((nom) => !autorisees.has(nom))

    expect(fautifs).toEqual([])
  })
})
