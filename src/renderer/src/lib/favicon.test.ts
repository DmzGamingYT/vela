import { describe, expect, it } from 'vitest'
import { domainLetter, faviconSize, needsUpgrade } from './favicon'

describe('favicon d’une tuile épinglée', () => {
  it('prend la première lettre du domaine, jamais celle du titre', () => {
    expect(domainLetter('https://www.exemple.fr/article')).toBe('E')
    expect(domainLetter('https://github.com/vela')).toBe('G')
    expect(domainLetter('https://123.exemple.fr')).toBe('1')
    expect(domainLetter('')).toBe('·')
  })

  it('ne dépasse pas le cadre de 40 px', () => {
    expect(faviconSize(180, 40)).toBe(40)
    expect(faviconSize(64, 40)).toBe(40)
    expect(faviconSize(40, 40)).toBe(40)
    expect(faviconSize(0, 40)).toBe(40)
  })

  it('laisse une icône native de 16 ou 32 px à sa taille', () => {
    expect(faviconSize(32, 40)).toBe(32)
    expect(faviconSize(16, 40)).toBe(16)
    expect(needsUpgrade(16, 40)).toBe(true)
    expect(needsUpgrade(32, 40)).toBe(true)
    expect(needsUpgrade(40, 40)).toBe(false)
    expect(needsUpgrade(180, 40)).toBe(false)
  })
})
