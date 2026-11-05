// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateInfo } from '@shared/api'
import type { AppView } from '@shared/types'
import { useBrowser } from '../store/browser'
import StatusBar from './StatusBar'

const LATER_KEY = 'vela.update.later'

const info = (over: Partial<UpdateInfo> = {}): UpdateInfo => ({
  state: 'downloaded',
  version: '0.3.26',
  currentVersion: '0.3.25',
  progress: 100,
  message: null,
  releaseUrl: 'https://github.com/DmzGamingYT/vela/releases/tag/v0.3.26',
  channel: 'mac',
  appImageWritable: true,
  ...over
})

const cancel = vi.fn(async () => info({ state: 'cancelled' }))
const download = vi.fn(async () => info({ state: 'downloading', progress: 0 }))
const install = vi.fn(async () => undefined)
const releases = vi.fn(async () => undefined)

function setUpdate(update: UpdateInfo): void {
  useBrowser.setState({
    view: { downloads: [] } as unknown as AppView,
    update,
    overlay: null,
    zoomNotice: null
  })
}

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  cancel.mockClear()
  download.mockClear()
  install.mockClear()
  releases.mockClear()
  Object.defineProperty(window, 'vela', {
    configurable: true,
    value: {
      platform: 'darwin',
      updates: { cancel, download, install, releases }
    }
  })
  setUpdate(info())
})

afterEach(() => {
  cleanup()
  useBrowser.setState({ view: null, update: null, overlay: null, zoomNotice: null })
})

describe('barre de statut', () => {
  it('ne double pas le compteur de blocages du volet', () => {
    render(<StatusBar />)
    expect(screen.queryByText(/bloquée/)).toBeNull()
  })

  it('affiche l’annonce prête et l’action principale', () => {
    render(<StatusBar />)
    expect(screen.getByText('Mise à jour 0.3.26 prête')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le DMG' }))
    expect(install).toHaveBeenCalledTimes(1)
  })

  it('ouvre la carte de détail et la referme avec Échap', () => {
    render(<StatusBar />)
    const zone = screen.getByRole('button', { name: /Mise à jour 0.3.26 prête/ })
    fireEvent.click(zone)
    const dialog = screen.getByRole('dialog', { name: 'Vela 0.3.26 est prête' })
    expect(dialog.textContent).toContain('MISE À JOUR')
    expect(dialog.textContent).toContain('[RÉSUMÉ DES CHANGEMENTS')
    expect(screen.getByRole('link', { name: 'Notes de version' }).getAttribute('href')).toBe(
      'https://github.com/DmzGamingYT/vela/releases/tag/v0.3.26'
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(zone)
  })

  it('reporte la mise à jour pour la session seulement', () => {
    const first = render(<StatusBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Plus tard' }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(sessionStorage.getItem(LATER_KEY)).toBe('0.3.26')

    first.unmount()
    render(<StatusBar />)
    expect(screen.queryByRole('status')).toBeNull()

    sessionStorage.clear()
    first.unmount()
    render(<StatusBar />)
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('affiche la progression réelle et annule le téléchargement', async () => {
    setUpdate(info({ state: 'downloading', progress: 42 }))
    render(<StatusBar />)
    expect(screen.getByText('Téléchargement de la 0.3.26')).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('42')
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('propose de réessayer après une erreur', async () => {
    setUpdate(info({ state: 'error', message: 'Réseau indisponible.' }))
    render(<StatusBar />)
    expect(screen.getByRole('alert').textContent).toContain('Réseau indisponible.')
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1))
  })

  it('donne un ordre de tabulation naturel', () => {
    render(<StatusBar />)
    const names = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent)
    expect(names[0]).toBe('Mise à jour 0.3.26 prête')
    expect(names[1]).toBe('Ouvrir le DMG')
    expect(names[2]).toBe('Plus tard')
    for (const button of screen.getAllByRole('button')) expect(button.tabIndex).toBe(0)
  })
})
