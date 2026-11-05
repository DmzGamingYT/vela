// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TabView } from '@shared/types'
import PinnedTabTile from './PinnedTabTile'

afterEach(cleanup)

const tab = (over: Partial<TabView> = {}): TabView => ({
  id: 'tab-1',
  spaceId: 'space-1',
  url: 'https://exemple.fr/[PAGE]',
  title: '[TITRE DE L’ONGLET]',
  favicon: 'data:image/png;base64,AA==',
  pinned: true,
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
  blockedHosts: [],
  ...over
})

function setup(over: Partial<TabView> = {}, active = false) {
  const handlers = {
    onActivate: vi.fn(),
    onToggleMute: vi.fn(),
    onContextMenu: vi.fn(),
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
    onDragOver: vi.fn(),
    onDrop: vi.fn(),
    onKeyDown: vi.fn()
  }
  const view = render(<PinnedTabTile tab={tab(over)} active={active} {...handlers} />)
  return { ...handlers, container: view.container }
}

describe('tuile d’onglet épinglé', () => {
  it('rend l’état de repos sans pastille sonore', () => {
    const { container } = setup()
    const tile = container.querySelector('.pin-tile')
    expect(tile?.getAttribute('data-active')).toBeNull()
    expect(tile?.getAttribute('data-sound')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Son en cours' })).toBeNull()
    expect(screen.getByRole('button', { name: /TITRE DE L/ })).toBeTruthy()
  })

  it('marque l’état actif sans le confondre avec le son', () => {
    const { container } = setup({}, true)
    const tile = container.querySelector('.pin-tile')
    expect(tile?.getAttribute('data-active')).toBe('true')
    expect(tile?.getAttribute('data-sound')).toBeNull()
    expect(screen.getByRole('button', { name: /onglet actif/ })).toBeTruthy()
  })

  it('affiche la pastille « Son en cours » quand la page joue', () => {
    const { container } = setup({ audible: true })
    const tile = container.querySelector('.pin-tile')
    expect(tile?.getAttribute('data-sound')).toBe('playing')
    const sound = screen.getByRole('button', { name: 'Son en cours' })
    expect(sound.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: /son en cours/ })).toBeTruthy()
  })

  it('affiche la pastille « Son coupé » quand le son est coupé', () => {
    const { container } = setup({ audible: true, muted: true })
    const tile = container.querySelector('.pin-tile')
    expect(tile?.getAttribute('data-sound')).toBe('muted')
    const sound = screen.getByRole('button', { name: 'Son coupé' })
    expect(sound.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /son coupé/ })).toBeTruthy()
  })

  it('cumule l’état actif et le son sans les mélanger', () => {
    const { container } = setup({ audible: true }, true)
    const tile = container.querySelector('.pin-tile')
    expect(tile?.getAttribute('data-active')).toBe('true')
    expect(tile?.getAttribute('data-sound')).toBe('playing')
  })

  it('coupe le son sans activer l’onglet', () => {
    const { onActivate, onToggleMute } = setup({ audible: true })
    fireEvent.click(screen.getByRole('button', { name: 'Son en cours' }))
    expect(onToggleMute).toHaveBeenCalledTimes(1)
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('montre l’infobulle au focus et la ferme avec Échap', () => {
    setup()
    const main = screen.getByRole('button', { name: /TITRE DE L/ })
    fireEvent.focusIn(main)
    expect(screen.getByRole('tooltip').textContent).toBe('[TITRE DE L’ONGLET]')
    fireEvent.keyDown(main, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('donne au clavier le bouton principal puis la pastille sonore', () => {
    setup({ audible: true })
    const labels = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))
    expect(labels[0]).toContain('[TITRE DE L’ONGLET]')
    expect(labels[1]).toBe('Son en cours')
  })
})
