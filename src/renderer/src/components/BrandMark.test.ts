import { describe, expect, it } from 'vitest'
import { readableTint } from './BrandMark'

/**
 * Une marque presque blanche (xAI) disparaîtrait sur le fond clair, une marque
 * presque noire sur le fond sombre : ces cas suivent l'encre du thème.
 */
describe('teinte des marques', () => {
  it('ramène les marques extrêmes à l’encre', () => {
    expect(readableTint('#f4f4f6')).toBe('var(--ink)')
    expect(readableTint('#000000')).toBe('var(--ink)')
    expect(readableTint('#111111')).toBe('var(--ink)')
  })

  it('laisse les teintes de marque intactes', () => {
    expect(readableTint('#74aa9c')).toBe('#74aa9c')
    expect(readableTint('#d97757')).toBe('#d97757')
    expect(readableTint('#4d6bfe')).toBe('#4d6bfe')
    expect(readableTint('#f55036')).toBe('#f55036')
  })

  it('ne touche pas une valeur qui n’est pas un hexadécimal', () => {
    expect(readableTint('var(--accent)')).toBe('var(--accent)')
  })
})
