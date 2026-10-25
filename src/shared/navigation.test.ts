import { describe, expect, it } from 'vitest'
import { shouldOpenAsPopup } from './navigation'

describe('shouldOpenAsPopup', () => {
  it('ouvre une vraie fenêtre pour les popups (OAuth)', () => {
    expect(shouldOpenAsPopup('new-window')).toBe(true)
  })

  it('garde les liens en onglets', () => {
    for (const disposition of ['default', 'foreground-tab', 'background-tab', 'other']) {
      expect(shouldOpenAsPopup(disposition)).toBe(false)
    }
  })
})
