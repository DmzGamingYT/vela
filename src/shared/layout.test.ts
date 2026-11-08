import { describe, expect, it } from 'vitest'
import {
  AUTO_COLLAPSE_WIDTH,
  MIN_PANE_WIDTH,
  clampSplitRatio,
  SPLIT_HANDLE_WIDTH,
  SPLIT_MIN_WIDTH,
  SPLIT_PANES_WIDTH,
  panesCanSplit
} from './layout'

describe('clampSplitRatio', () => {
  it('keeps both panes above their minimum width in narrow split views', () => {
    const width = 668
    const minRatio = MIN_PANE_WIDTH / width
    const maxRatio = (width - MIN_PANE_WIDTH - SPLIT_HANDLE_WIDTH) / width

    expect(clampSplitRatio(0.25, width)).toBeCloseTo(minRatio)
    expect(clampSplitRatio(0.75, width)).toBeCloseTo(maxRatio)
    expect(clampSplitRatio(0.5, width)).toBe(0.5)
    expect(clampSplitRatio(0.1, 1400)).toBe(0.25)
    expect(clampSplitRatio(0.9, 1400)).toBe(0.75)
  })

  it('retains the regular 25–75% range when no width is measured', () => {
    expect(clampSplitRatio(0.1, 0)).toBe(0.25)
    expect(clampSplitRatio(0.9, 0)).toBe(0.75)
  })
})

describe('panesCanSplit', () => {
  it('laisse passer le premier rendu, avant toute mesure', () => {
    expect(panesCanSplit(0)).toBe(true)
    expect(panesCanSplit(-1)).toBe(true)
  })

  it('demande exactement deux volets lisibles plus la poignée', () => {
    expect(SPLIT_PANES_WIDTH).toBe(MIN_PANE_WIDTH * 2 + SPLIT_HANDLE_WIDTH)
    expect(panesCanSplit(SPLIT_PANES_WIDTH - 1)).toBe(false)
    expect(panesCanSplit(SPLIT_PANES_WIDTH)).toBe(true)
    expect(panesCanSplit(1400)).toBe(true)
  })

  it('refuse la place laissée par un tiroir ouvert dans une fenêtre large', () => {
    // Fenêtre au minimum réel (980 px) + tiroir Notes (~340 px) : la largeur
    // de la fenêtre seule dirait « oui », la mesure des volets dit « non ».
    expect(980).toBeGreaterThanOrEqual(SPLIT_MIN_WIDTH)
    expect(panesCanSplit(980 - 340 - 60)).toBe(false)
  })

  it('garde les seuils cohérents entre le principal et la coque', () => {
    expect(SPLIT_MIN_WIDTH).toBeGreaterThanOrEqual(SPLIT_PANES_WIDTH)
    expect(AUTO_COLLAPSE_WIDTH).toBe(SPLIT_MIN_WIDTH)
  })
})
