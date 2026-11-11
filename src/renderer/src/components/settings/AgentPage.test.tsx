// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/defaults'
import type { AppView } from '@shared/types'
import { useBrowser } from '../../store/browser'
import AgentPage from './AgentPage'

const settings = structuredClone(DEFAULT_SETTINGS)
const view = {
  settings,
  notes: [
    { id: 'note-1', title: 'Plan', preview: 'Deux lignes', updatedAt: Date.now(), pinned: false }
  ]
} as unknown as AppView

beforeEach(() => {
  vi.stubGlobal('vela', { platform: 'darwin' })
  useBrowser.setState({ view, overlay: null })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  useBrowser.setState({ view: null, overlay: null })
})

describe('agent en trois sous-sections', () => {
  it('ouvre le modèle actif, puis bascule vers les fournisseurs et les notes', () => {
    render(<AgentPage settings={settings} />)

    expect(screen.getByRole('tab', { name: 'Modèle actif' }).getAttribute('aria-selected')).toBe(
      'true'
    )
    expect(
      within(screen.getByRole('tabpanel')).getByRole('heading', { name: 'Accès au modèle' })
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Fournisseurs' }))
    expect(
      within(screen.getByRole('tabpanel')).getByRole('heading', { name: 'Fournisseurs' })
    ).toBeTruthy()
    expect(
      within(screen.getByRole('tabpanel')).getByRole('button', { name: /Utiliser OpenAI/ })
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Notes' }))
    expect(
      within(screen.getByRole('tabpanel')).getByRole('heading', { name: 'Fichiers' })
    ).toBeTruthy()
    expect(within(screen.getByRole('tabpanel')).getByText('Plan')).toBeTruthy()
  })
})
