// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/defaults'
import { useBrowser } from '../../store/browser'
import AppearancePage from './AppearancePage'

beforeEach(() => {
  // jsdom n'implémente pas matchMedia : l'ambiance et les préférences système
  // le lisent au montage. Le test doit le fournir lui-même, sinon il dépend de
  // ce qu'un autre fichier a laissé sur le global.
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
  // La page lit window.vela pour choisir une image locale ; un voisin qui
  // l'aurait défini partiellement ne doit pas changer le résultat.
  vi.stubGlobal('vela', {
    platform: 'darwin',
    appearance: { pickImage: vi.fn(async () => null) }
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  useBrowser.setState({ overlay: null })
})

function setup() {
  const settings = structuredClone(DEFAULT_SETTINGS)
  settings.theme = 'light'
  const updateSettings = vi.fn(async () => {})
  const chooseBackground = vi.fn(async () => {})
  const resetAppearance = vi.fn()
  const view = render(
    <AppearancePage
      settings={settings}
      mode="light"
      previewThemeId="indigo"
      updateSettings={updateSettings}
      chooseBackground={chooseBackground}
      resetAppearance={resetAppearance}
    />
  )
  return { ...view, settings, updateSettings, chooseBackground, resetAppearance }
}

describe('page Apparence refondue', () => {
  it('affiche une légende Aperçu unique et un aperçu fidèle', () => {
    setup()

    expect(screen.getByText('Aperçu')).toBeTruthy()
    expect(screen.queryByText(/Dégradé du thème · normale/)).toBeNull()
    expect(screen.queryByText(/sans bouton Enregistrer/i)).toBeNull()
    expect(screen.getByText('Exemple')).toBeTruthy()
    expect(screen.getByText('Favoris')).toBeTruthy()
    expect(screen.getByText('Onglets')).toBeTruthy()
    expect(screen.getAllByText('Accueil').length).toBeGreaterThan(0)
    expect(screen.getByText('Récemment')).toBeTruthy()
    expect(screen.getByText('vela.app · Aujourd’hui')).toBeTruthy()
  })

  it('change le mode avec les flèches et le reflète dans l’aperçu', () => {
    const { settings, updateSettings, rerender } = setup()
    const light = screen.getByRole('radio', { name: 'Clair' }) as HTMLInputElement

    fireEvent.keyDown(light, { key: 'ArrowRight' })
    expect(updateSettings).toHaveBeenCalledWith({ theme: 'dark' })

    rerender(
      <AppearancePage
        settings={{ ...settings, theme: 'dark' }}
        mode="dark"
        previewThemeId="indigo"
        updateSettings={updateSettings}
        chooseBackground={vi.fn(async () => {})}
        resetAppearance={vi.fn()}
      />
    )
    expect(document.querySelector('.pv')?.getAttribute('data-preview-mode')).toBe('dark')
    expect((screen.getByRole('radio', { name: 'Sombre' }) as HTMLInputElement).checked).toBe(true)
  })

  it('applique la couleur et le niveau de fond au bon réglage', () => {
    const { updateSettings } = setup()

    fireEvent.click(screen.getByRole('button', { name: 'Rouge' }))
    expect(updateSettings).toHaveBeenCalledWith({ themeId: 'rouge' })

    fireEvent.click(screen.getByRole('tab', { name: 'Accueil' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Marqué' }))
    expect(updateSettings).toHaveBeenCalledWith({ homeIntensity: 'marked' })
  })

  it('répartit les réglages dans les quatre onglets', () => {
    setup()

    fireEvent.click(screen.getByRole('tab', { name: 'Interface' }))
    expect(screen.getByText('Densité')).toBeTruthy()
    expect(screen.getByText('Ambiance')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Accessibilité' }))
    expect(screen.getByText('Contraste élevé')).toBeTruthy()
  })

  it('réinitialise l’apparence depuis les réglages avancés', () => {
    const { resetAppearance } = setup()

    fireEvent.click(screen.getByRole('button', { name: /Réinitialiser l’apparence/ }))
    expect(resetAppearance).toHaveBeenCalled()
  })
})
