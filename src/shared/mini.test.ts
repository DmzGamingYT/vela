import { describe, expect, it } from 'vitest'
import {
  MINI_HEIGHT,
  MINI_MIN_HEIGHT,
  MINI_MIN_WIDTH,
  MINI_WIDTH,
  miniKeyAction,
  miniWindowSize,
  placeMiniWindow,
  type MiniKeyInput
} from './mini'

/** Écran 1920 × 1080, menu et Dock déduits. */
const SCREEN = { x: 0, y: 25, width: 1920, height: 1030 }
/** Portable : 1512 × 982, zone utile plus courte que la fenêtre demandée. */
const LAPTOP = { x: 0, y: 25, width: 1512, height: 930 }

describe('miniWindowSize', () => {
  it('prend la moitié de la largeur et 90 % de la hauteur de la fenêtre qui l’ouvre', () => {
    expect(miniWindowSize({ width: 1440, height: 900 })).toEqual({ width: 720, height: 810 })
    expect(miniWindowSize({ width: 1710, height: 1110 })).toEqual({ width: 855, height: 999 })
  })

  it('ne descend pas sous la taille utilisable sur une petite fenêtre', () => {
    const size = miniWindowSize({ width: 700, height: 380 })
    expect(size.width).toBe(MINI_MIN_WIDTH)
    expect(size.height).toBe(MINI_MIN_HEIGHT)
  })

  it('plafonne sur un très grand écran, pour rester une petite fenêtre', () => {
    const size = miniWindowSize({ width: 3200, height: 1600 })
    expect(size.width).toBe(1120)
    expect(size.height).toBe(1140)
  })

  it('garde une taille par défaut sans fenêtre principale', () => {
    expect(miniWindowSize(null)).toEqual({ width: MINI_WIDTH, height: MINI_HEIGHT })
  })

  it('reste plus grande que la version précédente sur un portable', () => {
    const size = miniWindowSize({ width: 1512, height: 930 })
    expect(size.width).toBeGreaterThan(560)
    expect(size.height).toBeGreaterThan(660)
  })
})

describe('placeMiniWindow', () => {
  it('ouvre la petite fenêtre au milieu de l’écran', () => {
    const placed = placeMiniWindow({ workArea: SCREEN })
    expect(placed.width).toBe(MINI_WIDTH)
    expect(placed.x + placed.width / 2).toBeCloseTo(SCREEN.x + SCREEN.width / 2, 0)
    expect(placed.y + placed.height / 2).toBeCloseTo(SCREEN.y + SCREEN.height / 2, 0)
  })

  it('reste centrée sur un écran de portable', () => {
    const placed = placeMiniWindow({ workArea: LAPTOP })
    expect(placed.x + placed.width / 2).toBeCloseTo(LAPTOP.x + LAPTOP.width / 2, 0)
    expect(placed.y).toBeGreaterThanOrEqual(LAPTOP.y + 16)
    expect(placed.y + placed.height).toBeLessThanOrEqual(LAPTOP.y + LAPTOP.height - 16)
  })

  it('reste toujours entièrement visible, même sur une zone utile décalée', () => {
    const shifted = { x: 1680, y: 25, width: 1200, height: 700 }
    const placed = placeMiniWindow({ workArea: shifted })
    expect(placed.x).toBeGreaterThanOrEqual(shifted.x + 16)
    expect(placed.y).toBeGreaterThanOrEqual(shifted.y + 16)
    expect(placed.x + placed.width).toBeLessThanOrEqual(shifted.x + shifted.width - 16)
    expect(placed.y + placed.height).toBeLessThanOrEqual(shifted.y + shifted.height - 16)
  })

  it('réduit la fenêtre sur un petit écran sans passer sous la taille minimale', () => {
    const tiny = { x: 0, y: 0, width: 520, height: 520 }
    const placed = placeMiniWindow({ workArea: tiny })
    expect(placed.width).toBe(520 - 32)
    expect(placed.height).toBeLessThanOrEqual(tiny.height - 32)
    expect(placed.width).toBeGreaterThanOrEqual(MINI_MIN_WIDTH)
    expect(placed).toMatchObject({ x: 16, y: 16 })
  })
})

const key = (over: Partial<MiniKeyInput>): MiniKeyInput => ({
  type: 'keyDown',
  key: 'w',
  meta: false,
  control: false,
  shift: false,
  alt: false,
  ...over
})

describe('miniKeyAction', () => {
  it('ferme avec la touche de commande du système, et seulement celle-là', () => {
    expect(miniKeyAction(key({ meta: true }), true)).toBe('close')
    expect(miniKeyAction(key({ control: true }), true)).toBeNull()
    expect(miniKeyAction(key({ control: true }), false)).toBe('close')
    expect(miniKeyAction(key({ meta: true }), false)).toBeNull()
    expect(miniKeyAction(key({}), true)).toBeNull()
    expect(miniKeyAction(key({ meta: true, shift: true }), true)).toBeNull()
    expect(miniKeyAction(key({ meta: true, alt: true }), true)).toBeNull()
  })

  it('n’agit pas sur une touche relâchée', () => {
    expect(miniKeyAction(key({ meta: true, type: 'keyUp' }), true)).toBeNull()
  })

  it('reconnaît les raccourcis de la fenêtre', () => {
    expect(miniKeyAction(key({ key: 'l', meta: true }), true)).toBe('address')
    expect(miniKeyAction(key({ key: 'R', meta: true }), true)).toBe('reload')
    expect(miniKeyAction(key({ key: '[', meta: true }), true)).toBe('back')
    expect(miniKeyAction(key({ key: ']', meta: true }), true)).toBe('forward')
    expect(miniKeyAction(key({ key: '=', meta: true }), true)).toBe('zoom-in')
    expect(miniKeyAction(key({ key: '-', meta: true }), true)).toBe('zoom-out')
    expect(miniKeyAction(key({ key: '0', meta: true }), true)).toBe('zoom-reset')
  })

  it('ferme sur Échap, mais pas sur un Échap modifié', () => {
    expect(miniKeyAction(key({ key: 'Escape' }), true)).toBe('close')
    expect(miniKeyAction(key({ key: 'Escape', meta: true }), true)).toBeNull()
    expect(miniKeyAction(key({ key: 'Escape', control: true }), false)).toBeNull()
  })
})
