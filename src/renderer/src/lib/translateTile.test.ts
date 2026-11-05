import { describe, expect, it } from 'vitest'
import { translateTileTokens, type TranslateTileMode, type TranslateTileState } from './translateTile'

const STATES: TranslateTileState[] = ['rest', 'hover', 'focus', 'active', 'disabled']
const MODES: TranslateTileMode[] = ['light', 'dark']

describe('tuile de traduction', () => {
  it('synchronise toujours --halo avec le fond', () => {
    for (const mode of MODES) {
      for (const state of STATES) {
        const tokens = translateTileTokens(state, mode)
        expect(tokens.halo, `${state} / ${mode}`).toBe(tokens.background)
      }
    }
  })

  it('reste blanche au repos en clair', () => {
    expect(translateTileTokens('rest', 'light')).toMatchObject({
      background: '#ffffff',
      color: '#1c1b1a',
      border: '#ddd8d1',
      halo: '#ffffff'
    })
  })

  it('prend l’accent plein à l’état actif', () => {
    expect(translateTileTokens('active', 'light')).toMatchObject({
      background: 'var(--clay)',
      color: '#ffffff',
      halo: 'var(--clay)'
    })
    expect(translateTileTokens('active', 'dark').color).toBe('#ffffff')
  })

  it('garde un fond sombre et un texte clair en mode sombre', () => {
    expect(translateTileTokens('rest', 'dark')).toMatchObject({
      background: '#211f1d',
      color: '#f4f1ec',
      halo: '#211f1d'
    })
  })

  it('atténue seulement l’encre quand la tuile est désactivée', () => {
    const tokens = translateTileTokens('disabled', 'light')
    expect(tokens.color).toContain('40%')
    expect(tokens.background).toBe('#ffffff')
  })
})
