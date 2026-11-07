// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SavedIndicator from './SavedIndicator'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('indicateur Enregistré', () => {
  it('reste muet au montage puis disparaît après deux secondes', () => {
    const { rerender } = render(<SavedIndicator value="initial" />)

    expect(screen.queryByText('Enregistré')).toBeNull()
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite')

    rerender(<SavedIndicator value="modifié" />)
    expect(screen.getByText('Enregistré')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(1999)
    })
    expect(screen.getByText('Enregistré')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByText('Enregistré')).toBeNull()
  })

  it('réarme le délai quand deux changements se suivent', () => {
    const { rerender } = render(<SavedIndicator value="un" />)
    rerender(<SavedIndicator value="deux" />)

    act(() => {
      vi.advanceTimersByTime(1500)
    })
    rerender(<SavedIndicator value="trois" />)

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('Enregistré')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.queryByText('Enregistré')).toBeNull()
  })
})
