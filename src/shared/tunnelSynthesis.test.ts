import { describe, expect, it } from 'vitest'
import type { MapNode, TunnelMap } from './tunnel'
import { angleGroups, buildTunnelSynthesis, queryMatches, synthesisMarkdown } from './tunnelSynthesis'

function node(partial: Partial<MapNode> & { id: string; kind: MapNode['kind']; title: string }): MapNode {
  return {
    summary: '',
    relevance: 70,
    confidence: 60,
    reason: '',
    status: 'neutral',
    parentId: null,
    createdAt: 1,
    ...partial
  }
}

const nodes: MapNode[] = [
  node({ id: 'sujet', kind: 'subject', title: 'Héberger des images', relevance: 100 }),
  node({ id: 'a1', kind: 'angle', title: 'Licences', summary: 'Licences', parentId: 'sujet' }),
  node({ id: 'a2', kind: 'angle', title: 'Coût réel', summary: 'La facture suit la diffusion.', parentId: 'sujet' }),
  node({
    id: 's1',
    kind: 'site',
    title: 'Creative Commons expliquées',
    domain: 'commons.wikimedia.org',
    url: 'https://commons.wikimedia.org/wiki/Licences',
    summary: 'Ce que libre recouvre.',
    excerpt:
      'Une licence libre donne des droits précis. Elle reste la licence de l’auteur, et l’attribution est obligatoire dans la plupart des cas.',
    sourceType: 'wiki',
    status: 'kept',
    parentId: 'a1',
    publishedAt: Date.UTC(2024, 2, 1),
    relevance: 92
  }),
  node({
    id: 's2',
    kind: 'site',
    title: 'Le coût caché de la bande passante',
    domain: 'arstechnica.com',
    url: 'https://arstechnica.com/cost',
    summary: 'La diffusion décide de la facture.',
    excerpt: 'Le stockage ne représente que 8 % de la facture ; la diffusion décide du reste.',
    sourceType: 'news',
    status: 'kept',
    parentId: 'a2',
    publishedAt: Date.UTC(2023, 4, 1),
    relevance: 88
  }),
  node({
    id: 's3',
    kind: 'site',
    title: 'Page écartée',
    domain: 'example.com',
    summary: '',
    excerpt: '',
    status: 'dismissed',
    parentId: 'a2',
    relevance: 40
  }),
  node({
    id: 't1',
    kind: 'tension',
    title: 'Divergence sur « coût »',
    summary: 'Deux sources avancent une valeur différente : 0,015 et 0,03.',
    relatedIds: ['s1', 's2'],
    status: 'neutral',
    relevance: 88
  })
]

const map: TunnelMap = {
  id: 'm1',
  spaceId: 'sp1',
  query: 'Comparer les hébergeurs d’images libres',
  lang: 'fr',
  nodes,
  createdAt: 1,
  updatedAt: Date.UTC(2026, 10, 7)
}

describe('groupes d’angles', () => {
  it('garde les pages visibles et compte les pages masquées', () => {
    const groups = angleGroups(nodes)
    expect(groups.map((group) => group.title)).toEqual(['Licences', 'Coût réel'])
    expect(groups[0].sites.map((site) => site.id)).toEqual(['s1'])
    expect(groups[1].sites.map((site) => site.id)).toEqual(['s2'])
    expect(groups[1].hidden).toBe(1)
    expect(groups[1].total).toBe(2)
  })

  it('n’affiche pas un angle sans page retenue', () => {
    const empty = [node({ id: 'a3', kind: 'angle', title: 'Vide', parentId: null })]
    expect(angleGroups(empty)).toEqual([])
  })
})

describe('synthèse', () => {
  it('cite des pages numérotées et n’invente aucune source', () => {
    const synthesis = buildTunnelSynthesis(map)
    expect(synthesis.sources).toHaveLength(2)
    expect(synthesis.kept).toBe(2)
    expect(synthesis.explored).toBe(3)
    expect(synthesis.sections).toHaveLength(2)
    const citations = synthesis.sections.flatMap((section) =>
      section.paragraphs.flatMap((paragraph) => paragraph.citations)
    )
    expect(citations.every((citation) => citation >= 1 && citation <= 2)).toBe(true)
    expect(synthesis.sections[0].quote?.citation).toBe(1)
    expect(synthesis.decisions[0].citations).toEqual([1, 2])
  })

  it('ne répète pas le titre de l’angle quand le résumé le reprend', () => {
    const synthesis = buildTunnelSynthesis(map)
    const licences = synthesis.sections.find((section) => section.heading === 'Licences')
    expect(licences?.paragraphs.some((paragraph) => paragraph.text === 'Licences')).toBe(false)
  })

  it('écrit un Markdown avec les numéros de source', () => {
    const markdown = synthesisMarkdown(buildTunnelSynthesis(map))
    expect(markdown).toContain('## Licences')
    expect(markdown).toMatch(/\[1\]/)
    expect(markdown).toContain('https://commons.wikimedia.org/wiki/Licences')
    expect(markdown).toContain('À trancher')
  })

  it('mesure les mots de la question retrouvés', () => {
    const matches = queryMatches('hébergeurs images libres', nodes[3])
    expect(matches.total).toBeGreaterThan(0)
    expect(matches.missing).toBeGreaterThanOrEqual(0)
  })
})
