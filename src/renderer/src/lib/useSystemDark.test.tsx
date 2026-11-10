// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSystemDark } from './useSystemDark'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useSystemDark', () => {
  it('suit un changement de prefers-color-scheme en direct', () => {
    let dark = false
    const listeners = new Set<() => void>()
    const query = {
      get matches() {
        return dark
      },
      media: '(prefers-color-scheme: dark)',
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener)
    }

    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => query)
    )

    const { result } = renderHook(() => useSystemDark())
    expect(result.current).toBe(false)

    act(() => {
      dark = true
      listeners.forEach((listener) => listener())
    })
    expect(result.current).toBe(true)
  })
})
