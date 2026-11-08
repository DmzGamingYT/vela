import { describe, expect, it } from 'vitest'
import { domainLetter, faviconSize, isDarkMonoLogo, needsUpgrade } from './favicon'

const px = (r: number, g: number, b: number, a = 255): number[] => [r, g, b, a]
const fill = (count: number, color: number[]): number[] =>
  Array.from({ length: count }, () => color).flat()

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

describe('détection des logos sombres quasi monochromes', () => {
  it('détecte un logo noir sur fond transparent (GitHub)', () => {
    const pixels = [...fill(100, px(24, 23, 23)), ...fill(476, px(0, 0, 0, 0))]
    expect(isDarkMonoLogo(pixels)).toBe(true)
  })

  it('détecte un logo gris foncé', () => {
    expect(isDarkMonoLogo(fill(576, px(85, 85, 85)))).toBe(true)
  })

  it('laisse tranquille un logo coloré (YouTube, DuckDuckGo)', () => {
    expect(isDarkMonoLogo(fill(576, px(255, 0, 0)))).toBe(false)
    expect(isDarkMonoLogo(fill(576, px(222, 88, 51)))).toBe(false)
  })

  it('laisse tranquille un logo clair ou gris moyen', () => {
    expect(isDarkMonoLogo(fill(576, px(240, 240, 240)))).toBe(false)
    expect(isDarkMonoLogo(fill(576, px(136, 136, 136)))).toBe(false)
  })

  it('laisse tranquille un logo sombre sur fond blanc opaque', () => {
    const pixels = [...fill(100, px(24, 23, 23)), ...fill(476, px(255, 255, 255))]
    expect(isDarkMonoLogo(pixels)).toBe(false)
  })

  it('ignore une image presque vide', () => {
    const pixels = [...fill(4, px(0, 0, 0)), ...fill(572, px(0, 0, 0, 0))]
    expect(isDarkMonoLogo(pixels)).toBe(false)
    expect(isDarkMonoLogo([])).toBe(false)
  })
})
