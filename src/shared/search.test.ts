import { describe, expect, it } from 'vitest'
import { matchesSearch, parseSearchQuery } from './search'

describe('recherche des notes', () => {
  it('parse les mots, les expressions et les exclusions', () => {
    expect(parseSearchQuery('projet "note vocale" -brouillon -"à faire"')).toEqual({
      include: ['projet', 'note vocale'],
      exclude: ['brouillon', 'a faire']
    })
  })

  it('accepte les guillemets français et l’espace après le tiret', () => {
    expect(parseSearchQuery('« note vocale » - « brouillon »')).toEqual({
      include: ['note vocale'],
      exclude: ['brouillon']
    })
  })

  it('exige tous les mots et refuse toute exclusion présente', () => {
    const query = parseSearchQuery('projet "note vocale" -brouillon')
    expect(matchesSearch('Projet — la note vocale du cours', query)).toBe(true)
    expect(matchesSearch('Projet avec une note vocale et un brouillon', query)).toBe(false)
    expect(matchesSearch('La note vocale seule', query)).toBe(false)
  })

  it('laisse passer les notes sans le terme exclu quand il n’y a que des exclusions', () => {
    const query = parseSearchQuery('-brouillon')
    expect(matchesSearch('Une note terminée', query)).toBe(true)
    expect(matchesSearch('Un brouillon ancien', query)).toBe(false)
  })

  it('ignore les espaces et les fragments vides', () => {
    expect(parseSearchQuery('   ""   -   ')).toEqual({ include: [], exclude: [] })
  })
})
