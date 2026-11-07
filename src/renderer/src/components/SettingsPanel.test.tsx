// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/defaults'
import type { AppView } from '@shared/types'
import { useBrowser } from '../store/browser'
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

    expect(screen.getByRole('heading', { name: 'Apparence' })).toBeTruthy()
    expect(screen.getByText('Mode, couleur, fond de l’accueil et accessibilité.')).toBeTruthy()
    expect(screen.getByText('Général')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(useBrowser.getState().overlay).toBeNull()
  })

  it('ferme avec Échap et laisse un champ de filtre traiter Échap', () => {
    render(<SettingsPanel />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(useBrowser.getState().overlay).toBeNull()

    open()
    const search = screen.getByRole('textbox', { name: 'Chercher une section des réglages' })
    fireEvent.change(search, { target: { value: 'notes' } })
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(useBrowser.getState().overlay).toBe('settings')
    expect((search as HTMLInputElement).value).toBe('')
  })

  it('marque la page courante et navigue au clavier par les boutons', () => {
    render(<SettingsPanel />)

    const navigation = screen.getByRole('button', { name: 'Navigation' })
    expect(navigation.getAttribute('aria-current')).toBeNull()

    fireEvent.click(navigation)
    expect(screen.getByRole('heading', { name: 'Navigation' })).toBeTruthy()
    expect(navigation.getAttribute('aria-current')).toBe('page')

    const about = screen.getByRole('button', { name: 'À propos' })
    expect(about.tabIndex).toBe(0)
    fireEvent.click(about)
    expect(screen.getByRole('heading', { name: 'À propos' })).toBeTruthy()
  })
})
