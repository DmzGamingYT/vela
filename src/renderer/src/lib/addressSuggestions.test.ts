import { describe, expect, it } from 'vitest'
import type { AppView } from '@shared/types'
import { buildAddressSuggestions, suggestionTitle } from './addressSuggestions'

function makeView(overrides: Record<string, unknown> = {}): AppView {
  return {
    tabs: [
      {
        id: 'tab-home',
        spaceId: 'space',
        url: 'about:home',
        title: 'Accueil',
        pinned: false,
        createdAt: 1,
        lastActiveAt: 1
      },
      {
        id: 'tab-docs',
        spaceId: 'space',
        url: 'https://docs.example.com/guide',
        title: 'Guide de documentation',
        pinned: false,
        createdAt: 1,
        lastActiveAt: 1
      }
    ],
    history: [
      {
        id: 'h1',
        spaceId: 'space',
        url: 'https://example.com/article',
        title: 'Un article',
        visitedAt: 1
      },
      {
        id: 'h2',
        spaceId: 'space',
        url: 'https://docs.example.com/guide?utm=1',
        title: 'Guide de documentation',
        visitedAt: 2
      }
    ],
    bookmarks: [
      {
        id: 'b1',
        url: 'https://bookmark.example.org/',
        title: 'Un favori',
        createdAt: 1,
        order: 0
      }
    ],
    settings: {
      searchEngine: 'duckduckgo',
      customEngineId: '',
      customEngines: [],
      searxInstance: '',
      searchKeywords: []
    },
    ...overrides
  } as unknown as AppView
}

describe('suggestionTitle', () => {
  it('garde un titre qui ne prétend pas être un autre domaine', () => {
    expect(
      suggestionTitle('Guide de documentation', 'https://docs.example.com/guide', 'docs.example.com')
    ).toBe('Guide de documentation')
  })

  it('remplace un titre qui affiche un autre domaine par le domaine réel', () => {
    expect(suggestionTitle('accounts.google.com', 'https://banque.example/', 'banque.example')).toBe(
      'banque.example'
    )
  })

  it('réduit une page de connexion à son domaine', () => {
    expect(
      suggestionTitle(
        'Se connecter — Google Accounts',
        'https://accounts.google.com/signin',
        'accounts.google.com'
      )
    ).toBe('accounts.google.com')
  })

  it('réduit une adresse complète au domaine', () => {
    expect(
      suggestionTitle('https://example.com/chemin', 'https://example.com/chemin', 'example.com')
    ).toBe('example.com')
  })
})

describe('buildAddressSuggestions', () => {
  it('sépare les onglets, les récents et les favoris quand le champ est vide', () => {
    const model = buildAddressSuggestions(makeView(), 'tab-home', '')
    expect(model.groups.map((group) => group.title)).toEqual([
      'Onglets ouverts',
      'Récents',
      'Favoris'
    ])
    expect(model.rows.some((row) => row.kind === 'tab')).toBe(true)
    expect(model.rows.some((row) => row.kind === 'history')).toBe(true)
    expect(model.rows.some((row) => row.kind === 'bookmark')).toBe(true)
  })

  it('dédoublonne une adresse canonique déjà présente dans les onglets', () => {
    const model = buildAddressSuggestions(makeView(), 'tab-home', '')
    expect(model.groups.find((group) => group.id === 'history')?.rows).toHaveLength(1)
    expect(model.rows.filter((row) => row.url.includes('docs.example.com'))).toHaveLength(1)
  })

  it('met en tête ce que Entrée ouvrira, puis les correspondances', () => {
    const model = buildAddressSuggestions(makeView(), 'tab-home', 'doc')
    expect(model.rows[0].kind).toBe('search')
    expect(model.rows[0].title).toContain('Rechercher')
    expect(model.rows.some((row) => row.kind === 'tab' && row.title === 'Guide de documentation')).toBe(
      true
    )
  })
})
