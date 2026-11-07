// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateInfo } from '@shared/api'
import type { AppView } from '@shared/types'
import { useBrowser } from '../../store/browser'
import StatusBar from './StatusBar'

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

const zoom = vi.fn(() => undefined)

function setState(over: Record<string, unknown> = {}): void {
  useBrowser.setState({
    view: { downloads: [] } as unknown as AppView,
    update: info(),
    overlay: null,
    zoomNotice: null,
    zoom: zoom as unknown as ReturnType<typeof useBrowser.getState>['zoom'],
    ...over
  })
}

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  zoom.mockClear()
  Object.defineProperty(window, 'vela', {
    configurable: true,
    value: { platform: 'darwin', updates: {} }
  })
  setState()
})

afterEach(() => {
  cleanup()
  useBrowser.setState({ view: null, update: null, overlay: null, zoomNotice: null })
})

describe('barre de statut', () => {
  it('ne rappelle pas la mise à jour : elle a sa section', () => {
    setState({ zoomNotice: null })
    render(<StatusBar />)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByText(/Mise à jour/)).toBeNull()
    expect(screen.queryByText('Ouvrir le DMG')).toBeNull()
  })

  it('tais aussi la progression et les erreurs de mise à jour', () => {
    setState({ update: info({ state: 'downloading', progress: 42 }), zoomNotice: null })
    const first = render(<StatusBar />)
    expect(screen.queryByRole('progressbar')).toBeNull()
    first.unmount()
    setState({ update: info({ state: 'error', message: 'Réseau indisponible.' }), zoomNotice: null })
    render(<StatusBar />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('affiche le zoom quand il a bougé et le remet à 100 %', () => {
    setState({ zoomNotice: 150 })
    render(<StatusBar />)
    const bouton = screen.getByRole('button', { name: 'Zoom 150 pour cent, revenir à 100 %' })
    expect(bouton.textContent).toContain('150 %')
    fireEvent.click(bouton)
    expect(zoom).toHaveBeenCalledWith('reset')
  })
})
