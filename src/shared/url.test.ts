import { describe, expect, it } from 'vitest'
import { HOME_URL } from './types'
import { engineHost, hostOf, isHomeUrl, normalizeInput, prettyUrl, searchUrl } from './url'

describe('normalizeInput', () => {
  it('renvoie l’accueil pour une saisie vide', () => {
    expect(normalizeInput('   ')).toEqual({ url: HOME_URL, kind: 'url' })
  })

  it('conserve les URL http et https', () => {
    expect(normalizeInput('https://exemple.fr/a?b=1')).toEqual({
      url: 'https://exemple.fr/a?b=1',
      kind: 'url'
    })
  })

  it('ajoute https à un domaine seul', () => {
    expect(normalizeInput('arc.net')).toEqual({ url: 'https://arc.net', kind: 'url' })
    expect(normalizeInput('www.zephium.app/work')).toEqual({
      url: 'https://www.zephium.app/work',
      kind: 'url'
    })
  })

  it('passe localhost en http', () => {
    expect(normalizeInput('localhost:5173')).toEqual({
      url: 'http://localhost:5173',
      kind: 'url'
    })
  })

  it('transforme une phrase en recherche', () => {
    expect(normalizeInput('le meilleur navigateur', 'duckduckgo')).toEqual({
      url: searchUrl('le meilleur navigateur', 'duckduckgo'),
      kind: 'search'
    })
  })

  it.each(['duckduckgo', 'brave', 'startpage', 'searxng'] as const)(
    'construit une recherche pour %s',
    (engine) => {
      const result = normalizeInput('Bruxelles Charleroi', engine)
      expect(result.kind).toBe('search')
      expect(result.url).toBe(searchUrl('Bruxelles Charleroi', engine))
    }
  )

  it('ne laisse pas passer les schémas dangereux', () => {
    const result = normalizeInput('javascript:alert(1)')
    expect(result.kind).toBe('search')
    expect(result.url.startsWith('https://duckduckgo.com')).toBe(true)
  })
})

describe('helpers', () => {
  it('reconnaît l’accueil', () => {
    expect(isHomeUrl('')).toBe(true)
    expect(isHomeUrl(HOME_URL)).toBe(true)
    expect(isHomeUrl('https://arc.net')).toBe(false)
  })

  it('extrait le domaine', () => {
    expect(hostOf('https://www.lemonde.fr/article')).toBe('lemonde.fr')
    expect(hostOf('pas une url')).toBe('')
  })

  it('affiche une adresse courte', () => {
    expect(prettyUrl('https://www.notion.so/page/')).toBe('notion.so/page')
    expect(prettyUrl(HOME_URL)).toBe('Nouvel onglet')
  })
})

describe('engineHost', () => {
  it('renvoie l’hôte pré-connectable de chaque moteur', () => {
    expect(engineHost('duckduckgo')).toBe('duckduckgo.com')
    expect(engineHost('brave')).toBe('search.brave.com')
    expect(engineHost('startpage')).toBe('www.startpage.com')
    expect(engineHost('searxng')).toBe('searx.be')
  })
})
