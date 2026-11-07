import { describe, expect, it } from 'vitest'
import { peekKeyAction, type PeekKeyInput } from './peek'

const key = (over: Partial<PeekKeyInput> = {}): PeekKeyInput => ({
  type: 'keyDown',
  key: '',
  meta: false,
  control: false,
  shift: false,
  alt: false,
  ...over
})

describe('raccourcis du coup d’œil', () => {
  it('ferme sur Échap, avec ou sans commande', () => {
    expect(peekKeyAction(key({ key: 'Escape' }), true)).toBe('close')
    expect(peekKeyAction(key({ key: 'Escape', meta: true }), true)).toBe('close')
  })

  it('remonte à l’adresse avec ⌘L', () => {
    expect(peekKeyAction(key({ key: 'l', meta: true }), true)).toBe('address')
    expect(peekKeyAction(key({ key: 'L', control: true }), false)).toBe('address')
  })

  it('reprend les gestes d’un onglet', () => {
    expect(peekKeyAction(key({ key: 'r', meta: true }), true)).toBe('reload')
    expect(peekKeyAction(key({ key: '[', meta: true }), true)).toBe('back')
    expect(peekKeyAction(key({ key: ']', meta: true }), true)).toBe('forward')
    expect(peekKeyAction(key({ key: 'w', meta: true }), true)).toBe('close')
  })

  it('gère le zoom', () => {
    expect(peekKeyAction(key({ key: '+', meta: true }), true)).toBe('zoom-in')
    expect(peekKeyAction(key({ key: '=', meta: true }), true)).toBe('zoom-in')
    expect(peekKeyAction(key({ key: '-', meta: true }), true)).toBe('zoom-out')
    expect(peekKeyAction(key({ key: '0', meta: true }), true)).toBe('zoom-reset')
  })

  it('ignore les frappes sans commande, avec modificateurs, ou hors keyDown', () => {
    expect(peekKeyAction(key({ key: 'l' }), true)).toBeNull()
    expect(peekKeyAction(key({ key: 'l', meta: true, shift: true }), true)).toBeNull()
    expect(peekKeyAction(key({ key: 'l', meta: true, alt: true }), true)).toBeNull()
    expect(peekKeyAction(key({ type: 'keyUp', key: 'l', meta: true }), true)).toBeNull()
  })
})
