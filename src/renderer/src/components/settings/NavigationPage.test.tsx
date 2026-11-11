// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/defaults'
import type { AppView } from '@shared/types'
import { useBrowser } from '../../store/browser'
import NavigationPage from './NavigationPage'

const settings = structuredClone(DEFAULT_SETTINGS)
// ZoomSitesList lit le store ; une vue minimale évite un sélecteur instable.
const view = { settings: { zoomByHost: {} } } as unknown as AppView

function setup(): void {
  render(
    <NavigationPage
      settings={settings}
      updateSettings={vi.fn(async () => {})}
      bookmarkCount={0}
      historyCount={0}
      downloadCount={0}
      onOpenPrivacy={vi.fn()}
    />
  )
}

beforeEach(() => {
  vi.stubGlobal('vela', { platform: 'darwin' })
  useBrowser.setState({ view, overlay: null })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  useBrowser.setState({ view: null, overlay: null })
})

describe('navigation en cinq sous-sections', () => {
  it('affiche la recherche par défaut et regroupe la bibliothèque', () => {
    setup()

    expect(
      within(screen.getByRole('tabpanel')).getByRole('heading', { name: 'Recherche' })
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Bibliothèque' }))
    const library = screen.getByRole('tabpanel')
    expect(within(library).getByRole('heading', { name: 'Marque-pages' })).toBeTruthy()
    expect(within(library).getByRole('heading', { name: 'Historique' })).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Pages web' }))
    expect(
      within(screen.getByRole('tabpanel')).getByRole('heading', { name: 'Pages web' })
    ).toBeTruthy()
  })
})
