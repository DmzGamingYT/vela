import { describe, expect, it } from 'vitest'
import { opensMiniWindow, shouldOpenAsPopup } from './navigation'

describe('shouldOpenAsPopup', () => {
  it('ouvre une vraie fenêtre pour les popups (OAuth), qui annoncent des features', () => {
    expect(shouldOpenAsPopup('new-window', 'width=500,height=600,noreferrer')).toBe(true)
  })

  it('ne prend pas un ⇧ + clic pour une popup : même disposition, sans features', () => {
    expect(shouldOpenAsPopup('new-window', '')).toBe(false)
  })

  it('garde les liens en onglets', () => {
    for (const disposition of ['default', 'foreground-tab', 'background-tab']) {
      expect(shouldOpenAsPopup(disposition)).toBe(false)
    }
  })
})

describe('opensMiniWindow', () => {
  it('reconnaît le geste d’Arc (⌘⌥ + clic) et ⇧ + clic', () => {
    expect(opensMiniWindow('other')).toBe(true)
    expect(opensMiniWindow('new-window', '')).toBe(true)
  })

  it('laisse les popups, les onglets et la navigation normale tranquilles', () => {
    expect(opensMiniWindow('new-window', 'width=500')).toBe(false)
    expect(opensMiniWindow('background-tab')).toBe(false)
    expect(opensMiniWindow('foreground-tab')).toBe(false)
    expect(opensMiniWindow('default')).toBe(false)
  })
})
