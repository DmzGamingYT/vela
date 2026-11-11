// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, createDefaultState } from '@shared/defaults'
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

  it('suit l’accent de l’espace sur le papier de son thème, sur plusieurs combinaisons', () => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.theme = 'light'
    const combos = [
      { themeId: 'vert', paper: '#f7faf5', wash: '#30a46c', accent: '#e93d82' },
      { themeId: 'rose', paper: '#fcf6f8', wash: '#e93d82', accent: '#0091ff' },
      { themeId: 'bleu', paper: '#f6f9fc', wash: '#0091ff', accent: '#e5a100' },
      { themeId: 'ambre', paper: '#fbf8ee', wash: '#e5a100', accent: '#8e4ec6' }
    ] as const
    const page = (combo: (typeof combos)[number]): React.ReactElement => (
      <AppearancePage
        settings={settings}
        mode="light"
        previewThemeId={combo.themeId}
        previewAccent={{ customAccent: combo.accent, accentOverride: true }}
        updateSettings={vi.fn(async () => {})}
        chooseBackground={vi.fn(async () => {})}
        resetAppearance={vi.fn()}
      />
    )

    const { rerender } = render(page(combos[0]))
    const accents = new Set<string>()
    for (const [index, combo] of combos.entries()) {
      if (index > 0) rerender(page(combo))
      const style = (document.querySelector('.pv') as HTMLElement).style
      // Le papier et le lavis restent ceux du thème…
      expect(style.getPropertyValue('--paper')).toBe(combo.paper)
      expect(style.getPropertyValue('--wash-1')).toBe(combo.wash)
      // …et l'accent vient bien de l'espace, pas du thème.
      accents.add(style.getPropertyValue('--accent'))
    }
    expect(accents.size).toBe(combos.length)
  })

  it('marque l’accent réellement appliqué par l’espace actif', () => {
    const previous = useBrowser.getState().view
    const state = createDefaultState()
    state.settings.perSpaceThemes = true
    const [space] = state.spaces
    expect(space).toBeDefined()
    if (!space) return
    space.accent = '#e93d82'
    useBrowser.setState({ view: state })

    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.theme = 'light'
    settings.perSpaceThemes = true
    const page = (accent: string) => (
      <AppearancePage
        settings={settings}
        mode="light"
        previewThemeId="indigo"
        previewAccent={{ customAccent: accent, accentOverride: true }}
        updateSettings={vi.fn(async () => {})}
        chooseBackground={vi.fn(async () => {})}
        resetAppearance={vi.fn()}
      />
    )

    render(page('#e93d82'))
    // Cette teinte est aussi celle de Rose : c'est la pastille Rose qui se marque.
    const presetMark = document.querySelector('.theme-dot[data-applied="true"]')
    expect(presetMark?.getAttribute('aria-label')).toBe('Rose — accent du profil actif')

    cleanup()
    // Une teinte hors de la grille se marque sur « Personnalisé ».
    useBrowser.setState({
      view: {
        ...state,
        spaces: state.spaces.map((item) =>
          item.id === space.id ? { ...item, accent: '#ff00aa' } : item
        )
      }
    })
    render(page('#ff00aa'))
    const customMark = document.querySelector('.theme-dot[data-applied="true"]')
    expect(customMark?.getAttribute('aria-label')).toContain('Teinte personnalisée')

    if (previous) useBrowser.setState({ view: previous })
  })

  it('change le thème et l’accent de l’espace actif depuis la grille, sans ouvrir la fenêtre', () => {
    const previousView = useBrowser.getState().view
    const previousUpdate = useBrowser.getState().updateSpace
    const state = createDefaultState()
    state.settings.perSpaceThemes = true
    const [space] = state.spaces
    expect(space).toBeDefined()
    if (!space) return
    space.accent = null
    const updateSpace = vi.fn(async () => {})
    useBrowser.setState({ view: state, updateSpace })

    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.theme = 'light'
    settings.perSpaceThemes = true
    const updateSettings = vi.fn(async () => {})
    render(
      <AppearancePage
        settings={settings}
        mode="light"
        previewThemeId="indigo"
        updateSettings={updateSettings}
        chooseBackground={vi.fn(async () => {})}
        resetAppearance={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ce profil' }))
    fireEvent.click(screen.getByRole('button', { name: 'Vert' }))
    // La pastille est un thème complet pour l'espace : papier, lavis et accent.
    expect(updateSpace).toHaveBeenCalledWith(space.id, { theme: 'vert', accent: null })

    // En portée globale, la même grille reprend son rôle habituel.
    fireEvent.click(screen.getByRole('button', { name: 'Global' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bleu' }))
    expect(updateSpace).toHaveBeenCalledTimes(1)
    expect(updateSettings).toHaveBeenCalledWith({ themeId: 'bleu', accentOverride: false })

    useBrowser.setState({ updateSpace: previousUpdate })
    if (previousView) useBrowser.setState({ view: previousView })
  })

  it('choisit l’ambiance de fond de l’espace actif depuis les réglages', () => {
    const previousView = useBrowser.getState().view
    const previousUpdate = useBrowser.getState().updateSpace
    const state = createDefaultState()
    state.settings.perSpaceThemes = true
    const [space] = state.spaces
    expect(space).toBeDefined()
    if (!space) return
    const updateSpace = vi.fn(async () => {})
    useBrowser.setState({ view: state, updateSpace })

    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.theme = 'light'
    settings.perSpaceThemes = true
    render(
      <AppearancePage
        settings={settings}
        mode="light"
        previewThemeId="indigo"
        updateSettings={vi.fn(async () => {})}
        chooseBackground={vi.fn(async () => {})}
        resetAppearance={vi.fn()}
      />
    )

    // La section n'apparaît qu'avec l'option par espace.
    expect(screen.getByRole('heading', { name: 'Ambiance du profil' })).toBeTruthy()
    // Le nom accessible d'une carte de choix inclut sa ligne d'explication.
    fireEvent.click(screen.getByRole('radio', { name: /Aurore/ }))
    expect(updateSpace).toHaveBeenCalledWith(space.id, { background: 'aurora' })

    useBrowser.setState({ updateSpace: previousUpdate })
    if (previousView) useBrowser.setState({ view: previousView })
  })

  it('applique la couleur et le niveau de fond au bon réglage', () => {
    const { updateSettings } = setup()

    fireEvent.click(screen.getByRole('button', { name: 'Rouge' }))
    // Choisir un thème nommé reprend sa propre teinte : l'accent libre tombe.
    expect(updateSettings).toHaveBeenCalledWith({ themeId: 'rouge', accentOverride: false })

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
