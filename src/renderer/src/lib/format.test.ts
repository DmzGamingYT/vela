import { describe, expect, it } from 'vitest'
import { initials } from './format'

describe('pastille de repli', () => {
  it('garde deux lettres pour un nom de site', () => {
    expect(initials('Le Monde')).toBe('LM')
    expect(initials('Hacker News')).toBe('HN')
  })

  it('ne confond pas les titres numérotés', () => {
    // Le défaut d'origine : « Favori 1 », « Favori 10 » et « Favori 14 »
    // affichaient tous « F1 ».
    expect(initials('Favori 1')).toBe('F1')
    expect(initials('Favori 10')).toBe('F10')
    expect(initials('Favori 14')).toBe('F14')
    expect(new Set(['Favori 1', 'Favori 10', 'Favori 14'].map(initials)).size).toBe(3)
  })

  it('reste courte sur les cas courts', () => {
    expect(initials('GitHub')).toBe('G')
    expect(initials('   ')).toBe('·')
    expect(initials('')).toBe('·')
  })
})
