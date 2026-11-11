// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/defaults'
import type { AppView } from '@shared/types'
import { useBrowser } from '../../store/browser'
import SettingsPanel from './SettingsPanel'

const view = {
  settings: { ...structuredClone(DEFAULT_SETTINGS), onboarded: true },
  spaces: [{ id: 'space-1', name: 'Personnel', color: '#5B5BD6' }],
  activeSpaceId: 'space-1',
  bookmarks: [],
  history: [],
  downloads: [],
  notes: [],
  tabs: []
} as unknown as AppView

function open(): void {
  useBrowser.setState({ view, overlay: 'settings' })
}

beforeEach(() => {
  localStorage.clear()
  // Les globals sont posés par vi.stubGlobal pour être rendus à l'hôte après
  // chaque test : un fichier voisin ne doit pas hériter de ce panneau.
  vi.stubGlobal('vela', { platform: 'darwin' })
  Element.prototype.scrollIntoView = vi.fn()
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
  open()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
  useBrowser.setState({ view: null, overlay: null })
})

describe('fenêtre de réglages', () => {
  it('garde le titre et ferme avec le bouton 44 px', () => {
    render(<SettingsPanel />)

    expect(screen.getByRole('heading', { name: 'Vue d’ensemble' })).toBeTruthy()
    expect(
      screen.getByText(
        'Ce qui définit votre interface, votre navigation et votre vie privée. Tout s’applique aussitôt et reste sur cet appareil.'
      )
    ).toBeTruthy()
    expect(screen.getByText('Repères')).toBeTruthy()
    expect(screen.getByText('Général')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(useBrowser.getState().overlay).toBeNull()
  })

  it('ferme avec Échap et laisse un champ de filtre traiter Échap', () => {
    render(<SettingsPanel />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(useBrowser.getState().overlay).toBeNull()

    open()
    const search = screen.getByRole('combobox', { name: 'Rechercher un réglage' })
    fireEvent.change(search, { target: { value: 'notes' } })
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(useBrowser.getState().overlay).toBe('settings')
    expect((search as HTMLInputElement).value).toBe('')
  })

  it('ouvre une section depuis la vue d’ensemble', () => {
    render(<SettingsPanel />)

    fireEvent.click(screen.getByRole('button', { name: /Ouvrir Apparence/ }))
    expect(screen.getByRole('heading', { name: 'Apparence' })).toBeTruthy()
  })

  it('ouvre une page et son sous-onglet depuis la recherche globale', () => {
    render(<SettingsPanel />)

    const search = screen.getByRole('combobox', { name: 'Rechercher un réglage' })
    fireEvent.change(search, { target: { value: 'notes' } })
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    fireEvent.keyDown(search, { key: 'Enter' })

    expect(screen.getByRole('heading', { name: 'Agent' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Notes' }).getAttribute('aria-selected')).toBe('true')

    fireEvent.change(search, { target: { value: 'mises à jour' } })
    fireEvent.click(screen.getByRole('option', { name: /^Mises à jour/ }))

    expect(screen.getByRole('heading', { name: 'Système' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Mises à jour' }).getAttribute('aria-selected')).toBe(
      'true'
    )
  })

  it('ouvre un réglage individuel et fait défiler jusqu’à sa ligne', () => {
    render(<SettingsPanel />)

    const search = screen.getByRole('combobox', { name: 'Rechercher un réglage' })
    fireEvent.change(search, { target: { value: 'densité' } })
    fireEvent.click(screen.getByRole('option', { name: /^Densité/ }))

    expect(screen.getByRole('heading', { name: 'Apparence' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Interface' }).getAttribute('aria-selected')).toBe(
      'true'
    )
    const target = document.getElementById('density-label')
    expect(target?.classList.contains('settings-search-target')).toBe(true)
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('désactive le défilement doux quand les animations sont réduites', () => {
    vi.mocked(window.matchMedia).mockImplementation(
      (query: string) =>
        ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn()
        }) as MediaQueryList
    )
    render(<SettingsPanel />)

    const search = screen.getByRole('combobox', { name: 'Rechercher un réglage' })
    fireEvent.change(search, { target: { value: 'densité' } })
    fireEvent.click(screen.getByRole('option', { name: /^Densité/ }))

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      block: 'center',
      behavior: 'auto'
    })
  })

  it('marque la page courante et navigue au clavier par les boutons', () => {
    render(<SettingsPanel />)

    const navigation = screen.getByRole('button', { name: 'Navigation' })
    expect(navigation.getAttribute('aria-current')).toBeNull()

    fireEvent.click(navigation)
    expect(screen.getByRole('heading', { name: 'Navigation' })).toBeTruthy()
    expect(navigation.getAttribute('aria-current')).toBe('page')

    const system = screen.getByRole('button', { name: 'Système' })
    expect(system.tabIndex).toBe(0)
    fireEvent.click(system)
    expect(screen.getByRole('heading', { name: 'Système' })).toBeTruthy()
  })
})
