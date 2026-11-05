// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PrivacyPill from './PrivacyPill'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('pastille de confidentialité', () => {
  it('affiche le bouclier seul quand rien n’est bloqué', () => {
    render(<PrivacyPill count={0} onOpen={() => {}} />)
    const button = screen.getByRole('button', { name: 'Aucune requête bloquée' })
    expect(button.dataset.empty).toBe('true')
    expect(button.querySelectorAll('svg')).toHaveLength(1)
    expect(button.textContent?.trim()).toBe('')
  })

  it('affiche le nombre et un nom accessible qui dit ce qu’il compte', () => {
    render(<PrivacyPill count={3} onOpen={() => {}} />)
    const button = screen.getByRole('button', {
      name: '3 requêtes bloquées sur cette page, voir le détail'
    })
    expect(button.dataset.empty).toBe('false')
    expect(button.textContent).toContain('3')
  })

  it('accorde le libellé au singulier', () => {
    render(<PrivacyPill count={1} onOpen={() => {}} />)
    expect(
      screen.getByRole('button', { name: '1 requête bloquée sur cette page, voir le détail' })
    ).toBeTruthy()
  })

  it('ouvre le détail au clic', () => {
    const onOpen = vi.fn()
    render(<PrivacyPill count={2} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: /2 requêtes bloquées/ }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('annonce les changements poliment, sans plus d’une annonce toutes les 5 s', () => {
    const { container, rerender } = render(<PrivacyPill count={1} onOpen={() => {}} />)
    const live = container.querySelector('[aria-live="polite"]')
    expect(live?.getAttribute('aria-live')).toBe('polite')

    // Première annonce immédiate : le lecteur d’écran sait tout de suite ce qui
    // a été bloqué, la fenêtre de 5 s ne démarre qu’ensuite.
    act(() => {
      vi.advanceTimersByTime(20)
    })
    expect(live?.textContent).toBe('1 requête bloquée sur cette page')

    // Un pic de requêtes : la deuxième annonce attend la fin de la fenêtre.
    rerender(<PrivacyPill count={4} onOpen={() => {}} />)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(live?.textContent).toBe('1 requête bloquée sur cette page')
    act(() => {
      vi.advanceTimersByTime(6000)
    })
    expect(live?.textContent).toBe('4 requêtes bloquées sur cette page')
  })
})
