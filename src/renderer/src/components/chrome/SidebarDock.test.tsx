// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SidebarDock from './SidebarDock'

type Props = ComponentProps<typeof SidebarDock>

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  Object.defineProperty(window, 'vela', {
    configurable: true,
    value: { platform: 'darwin' }
  })
})

function setup(over: Partial<Props> = {}) {
  const handlers = {
    onNotes: vi.fn(),
    onAgent: vi.fn(),
    onSettings: vi.fn()
  }
  const view = render(
    <SidebarDock
      notesOpen={false}
      agentOpen={false}
      settingsOpen={false}
      {...handlers}
      {...over}
    />
  )
  return { ...handlers, ...view }
}

function openTip(label: string): HTMLElement {
  vi.useFakeTimers()
  const button = screen.getByRole('button', { name: label })
  fireEvent.focus(button)
  act(() => {
    vi.advanceTimersByTime(500)
  })
  return button
}

describe('dock de la barre latérale', () => {
  it('rend Notes, Agent puis Réglages dans cet ordre', () => {
    setup()
    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Notes',
      'Agent',
      'Réglages'
    ])
  })

  it('expose l’état sélectionné par aria-pressed et data-active', () => {
    const { container } = setup({ notesOpen: true, agentOpen: true, settingsOpen: true })
    for (const label of ['Notes', 'Agent', 'Réglages']) {
      const button = screen.getByRole('button', { name: label })
      expect(button.getAttribute('aria-pressed')).toBe('true')
      expect(button.getAttribute('data-active')).toBe('true')
    }
    expect(container.querySelectorAll('[data-active="true"]')).toHaveLength(3)
  })

  it('appelle l’action propre à chaque bouton', () => {
    const { onNotes, onAgent, onSettings } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Notes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agent' }))
    fireEvent.click(screen.getByRole('button', { name: 'Réglages' }))
    expect(onNotes).toHaveBeenCalledTimes(1)
    expect(onAgent).toHaveBeenCalledTimes(1)
    expect(onSettings).toHaveBeenCalledTimes(1)
  })

  it('affiche l’infobulle après 500 ms au focus et la ferme avec Échap', () => {
    setup()
    const notes = screen.getByRole('button', { name: 'Notes' })
    vi.useFakeTimers()
    fireEvent.focus(notes)
    act(() => {
      vi.advanceTimersByTime(499)
    })
    expect(screen.queryByRole('tooltip')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    const tip = screen.getByRole('tooltip')
    expect(tip.textContent).toContain('Notes')
    expect(tip.textContent).toContain('⌘E')
    expect(tip.querySelector('.dock-tip-text')?.getAttribute('aria-hidden')).toBe('true')
    expect(tip.querySelector('.sr-only')?.textContent).toBe('Raccourci ⌘E')
    expect(notes.getAttribute('aria-describedby')).toBe(tip.id)

    fireEvent.keyDown(notes, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(notes.getAttribute('aria-describedby')).toBeNull()
  })

  it('écrit le raccourci à la mode Windows hors macOS', () => {
    Object.defineProperty(window, 'vela', {
      configurable: true,
      value: { platform: 'win32' }
    })
    setup()
    const settings = openTip('Réglages')
    expect(screen.getByRole('tooltip').textContent).toContain('Ctrl+,')
    expect(settings.getAttribute('aria-label')).toBe('Réglages')
  })

  it('passe en icônes seules quand la largeur descend sous 120 px', () => {
    let callback: ResizeObserverCallback | null = null
    class Observer {
      constructor(next: ResizeObserverCallback) {
        callback = next
      }
      observe(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('ResizeObserver', Observer)

    const { container } = setup()
    act(() => {
      callback?.(
        [{ contentRect: { width: 110 } } as unknown as ResizeObserverEntry],
        {} as ResizeObserver
      )
    })
    expect(container.querySelector('.sidebar-dock')?.getAttribute('data-compact')).toBe('true')
    expect(container.querySelectorAll('.dock-label')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Notes' })).toBeTruthy()
  })

  it('garde les icônes seules et les libellés accessibles en mode compact', () => {
    const { container } = setup({ compact: true })
    expect(container.querySelector('.sidebar-dock')?.getAttribute('data-compact')).toBe('true')
    expect(container.querySelectorAll('.dock-label')).toHaveLength(0)
    expect(container.querySelector('.dock-key')).toBeNull()
    for (const label of ['Notes', 'Agent', 'Réglages']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
  })
})
