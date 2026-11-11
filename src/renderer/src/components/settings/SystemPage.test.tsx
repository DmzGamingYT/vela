// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/defaults'
import type { AppView } from '@shared/types'
import { useBrowser } from '../../store/browser'
import SystemPage from './SystemPage'

const settings = structuredClone(DEFAULT_SETTINGS)
const view = { settings } as unknown as AppView

beforeEach(() => {
  vi.stubGlobal('vela', { platform: 'darwin' })
  useBrowser.setState({ view, update: null })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  useBrowser.setState({ view: null, update: null })
})

describe('système en trois sous-sections', () => {
  it('ouvre les raccourcis, puis les mises à jour et les informations', () => {
    render(<SystemPage />)

    expect(screen.getByRole('tab', { name: 'Raccourcis' }).getAttribute('aria-selected')).toBe(
      'true'
    )
    expect(
      within(screen.getByRole('tabpanel')).getByRole('textbox', {
        name: 'Filtrer les raccourcis'
      })
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Mises à jour' }))
    expect(
      within(screen.getByRole('tabpanel')).getByRole('heading', { name: 'Version installée' })
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'À propos' }))
    expect(within(screen.getByRole('tabpanel')).getByText('Le web, votre atelier.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Gérer les mises à jour' }))
    expect(
      within(screen.getByRole('tabpanel')).getByRole('heading', { name: 'Version installée' })
    ).toBeTruthy()
  })
})
