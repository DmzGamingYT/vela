import { describe, expect, it } from 'vitest'
import { categoryOf, categoryTotals, groupHosts, parentDomain } from './blockCategories'

describe('catégories du bouclier', () => {
  it('nomme le domaine parent, sans casser les suffixes à deux étiquettes', () => {
    expect(parentDomain('ads.doubleclick.net')).toBe('doubleclick.net')
    expect(parentDomain('www.bbc.co.uk')).toBe('bbc.co.uk')
    expect(parentDomain('example.com')).toBe('example.com')
  })

  it('étiquette les domaines connus par usage', () => {
    expect(categoryOf('doubleclick.net')).toBe('ad')
    expect(categoryOf('www.google-analytics.com')).toBe('analytics')
    expect(categoryOf('connect.facebook.net')).toBe('social')
    expect(categoryOf('tracker.example')).toBe('track')
    expect(categoryOf('service.example')).toBe('other')
  })

  it('regroupe les sous-domaines et additionne leurs requêtes', () => {
    const groups = groupHosts([
      { host: 'ads.doubleclick.net', count: 3 },
      { host: 'stats.doubleclick.net', count: 1 },
      { host: 'cdn.example.com', count: 2 }
    ])

    expect(groups.map((group) => group.parent)).toEqual(['doubleclick.net', 'example.com'])
    expect(groups[0].total).toBe(4)
    expect(groups[0].hosts.map((entry) => entry.host)).toEqual([
      'ads.doubleclick.net',
      'stats.doubleclick.net'
    ])
    expect(groups[1].hosts).toHaveLength(1)
  })

  it('signale un groupe mixte quand les usages diffèrent', () => {
    const groups = groupHosts([
      { host: 'ads.doubleclick.net', count: 2 },
      { host: 'stats.doubleclick.net', count: 1 }
    ])

    expect(groups[0].category).toBe('ad')
    // Deux hôtes du même parent, deux usages : le groupe ne prend pas une
    // étiquette pour l’autre.
    const mixed = groupHosts([
      { host: 'metrics.example.com', count: 2 },
      { host: 'cdn.example.com', count: 1 }
    ])
    expect(mixed[0].category).toBeNull()
  })

  it('somme par catégorie dans l’ordre d’affichage', () => {
    const totals = categoryTotals([
      { host: 'www.google-analytics.com', count: 2 },
      { host: 'doubleclick.net', count: 3 },
      { host: 'ads.doubleclick.net', count: 1 }
    ])

    expect(totals).toEqual([
      { category: 'ad', count: 4 },
      { category: 'analytics', count: 2 }
    ])
  })
})
