import { describe, expect, it } from 'vitest'
import {
  addCard,
  buildTunnelHtml,
  buildTunnelReport,
  boxesOverlap,
  detectTensions,
  filterMap,
  layoutMap,
  looksFrench,
  removeCard,
  relevanceReason,
  scoreRelevance,
  suggestQueryFix,
  toJsonExport,
  toOpmlExport,
  toggleLink,
  DEFAULT_FILTERS,
  type MapNode,
  type TunnelMap
} from './tunnel'

const now = Date.now()

function node(patch: Partial<MapNode> & Pick<MapNode, 'id' | 'kind' | 'title'>): MapNode {
  const base: MapNode = {
    id: patch.id,
    kind: patch.kind,
    title: patch.title,
    summary: '',
    relevance: 80,
    confidence: 70,
    reason: '',
    status: 'neutral',
    parentId: null,
    createdAt: now
  }
  return { ...base, ...patch }
}

function site(id: string, patch: Partial<MapNode> = {}): MapNode {
  return node({
    id,
    kind: 'site',
    title: `Page ${id}`,
    url: `https://example.org/${id}`,
    domain: 'example.org',
    sourceType: 'wiki',
    relevance: 80,
    ...patch
  })
}

describe('pertinence', () => {
  it('classe un titre qui reprend la requête au-dessus d’une page hors sujet', () => {
    const onTopic = scoreRelevance('navigateur minimaliste', {
      title: 'Les navigateurs minimalistes',
      excerpt: 'Un navigateur minimaliste réduit l’interface au strict nécessaire.'
    })
    const offTopic = scoreRelevance('navigateur minimaliste', {
      title: 'Recette de pain au levain',
      excerpt: 'Farine, eau, sel et temps.'
    })
    expect(onTopic).toBeGreaterThanOrEqual(60)
    expect(offTopic).toBeLessThan(40)
    expect(onTopic).toBeGreaterThan(offTopic)
  })

  it('ignore les verbes de demande et compare les pluriels', () => {
    const score = scoreRelevance("utiliser l'IA pour rédiger des textes", {
      title: 'Meilleure IA pour rédiger des textes',
      excerpt: 'Palette d’outils pour écrire plus vite.'
    })
    expect(score).toBeGreaterThanOrEqual(60)
  })

  it('ne promet pas 100 % sur un seul mot trouvé dans le titre', () => {
    const score = scoreRelevance('youtube', { title: 'YouTube' })
    expect(score).toBeLessThan(95)
    expect(score).toBeGreaterThanOrEqual(60)
  })

  it('plafonne aussi une page parfaite : la mesure reste une heuristique', () => {
    const score = scoreRelevance('navigateur minimaliste', {
      title: 'Navigateur minimaliste',
      excerpt: 'Un navigateur minimaliste, sans distraction.',
      domain: 'navigateur-minimaliste.example'
    })
    expect(score).toBeLessThanOrEqual(97)
  })

  it('explique ce que la mesure a réellement vu', () => {
    const reason = relevanceReason('navigateur minimaliste', {
      title: 'Les navigateurs modernes',
      excerpt: 'Un point sur les navigateurs minimalistes.',
      domain: 'example.org'
    })
    expect(reason).toContain('2 mots de la requête')
    expect(reason).toContain('1 dans le titre')
    expect(reason).toContain('1 dans le texte')

    const empty = relevanceReason('navigateur minimaliste', {
      title: 'Recette de pain au levain',
      excerpt: 'Farine, eau, sel et temps.'
    })
    expect(empty).toContain('2 absents')
  })
})

describe('langue de la requête', () => {
  it('reconnaît le français à ses petits mots et à ses accents', () => {
    expect(looksFrench('le meilleur navigateur')).toBe(true)
    expect(looksFrench('navigateur pour lire')).toBe(true)
    // Sans petit mot, l’accent suffit : « vélo cargo » est une requête française.
    expect(looksFrench('vélo cargo')).toBe(true)
    expect(looksFrench('rédiger sans distraction')).toBe(true)
  })

  it('laisse l’anglais à l’anglais', () => {
    expect(looksFrench('cargo bike')).toBe(false)
    expect(looksFrench('minimal browser')).toBe(false)
  })
})

describe('filtres du tunnel', () => {
  const tree = [
    node({ id: 'subject', kind: 'subject', title: 'Sujet' }),
    node({ id: 'angle', kind: 'angle', title: 'Angle', parentId: 'subject' }),
    site('good', { parentId: 'angle', relevance: 82 }),
    site('weak', { parentId: 'angle', relevance: 45 }),
    site('old', { parentId: 'angle', relevance: 90, publishedAt: now - 1000 * 60 * 60 * 24 * 900 })
  ]

  it('masque les sources sous le seuil et les ancêtres sans descendant gardé', () => {
    const { visible, hiddenSites } = filterMap(tree, { ...DEFAULT_FILTERS, minRelevance: 60 })
    expect(visible.has('good')).toBe(true)
    expect(visible.has('weak')).toBe(false)
    expect(visible.has('old')).toBe(true)
    expect(visible.has('angle')).toBe(true)
    expect(hiddenSites).toBe(1)
  })

  it('filtre par langue quand la page l’indique', () => {
    const tree = [
      node({ id: 'subject', kind: 'subject', title: 'Sujet' }),
      node({ id: 'angle', kind: 'angle', title: 'Angle', parentId: 'subject' }),
      site('fr', { parentId: 'angle', lang: 'fr' }),
      site('en', { parentId: 'angle', lang: 'en' })
    ]
    const french = filterMap(tree, { ...DEFAULT_FILTERS, lang: 'fr' })
    expect(french.visible.has('fr')).toBe(true)
    expect(french.visible.has('en')).toBe(false)
    expect(french.hiddenSites).toBe(1)
  })

  it('filtre par étiquette et par niveau de détail de la page', () => {
    const tagged = [
      node({ id: 'subject', kind: 'subject', title: 'Sujet' }),
      node({ id: 'angle', kind: 'angle', title: 'Angle', parentId: 'subject' }),
      site('histoire', {
        parentId: 'angle',
        title: 'Histoire du web',
        excerpt: 'Une histoire longue, racontée par ses acteurs.'
      }),
      site('bref', { parentId: 'angle', title: 'Note brève', excerpt: 'Trois lignes.' })
    ]
    const byTag = filterMap(tagged, { ...DEFAULT_FILTERS, tags: ['histoire'] })
    expect(byTag.visible.has('histoire')).toBe(true)
    expect(byTag.visible.has('bref')).toBe(false)

    const detailed = filterMap(tagged, { ...DEFAULT_FILTERS, minExcerpt: 40 })
    expect(detailed.visible.has('histoire')).toBe(true)
    expect(detailed.visible.has('bref')).toBe(false)
  })

  it('filtre par date et par type de source', () => {
    const byDate = filterMap(tree, { ...DEFAULT_FILTERS, from: now - 1000 * 60 * 60 * 24 * 30 })
    expect(byDate.visible.has('old')).toBe(false)
    const byType = filterMap(tree, { ...DEFAULT_FILTERS, sourceTypes: ['news'] })
    expect(byType.visible.has('good')).toBe(false)
    expect(byType.hiddenSites).toBe(3)
    expect(byType.visible.has('angle')).toBe(false)
  })
})

describe('édition de la carte', () => {
  const map: TunnelMap = {
    id: 'map',
    spaceId: 'space',
    query: 'sujet',
    lang: 'fr',
    createdAt: now,
    updatedAt: now,
    nodes: [
      node({ id: 'subject', kind: 'subject', title: 'Sujet' }),
      node({ id: 'angle', kind: 'angle', title: 'Angle', parentId: 'subject' }),
      site('a', { parentId: 'angle' }),
      site('b', { parentId: 'angle' })
    ]
  }

  it('ajoute une carte sous le nœud choisi, marquée comme manuelle', () => {
    const next = addCard(map, 'angle', { title: 'Limites', kind: 'detail' })
    expect(next.nodes).toHaveLength(map.nodes.length + 1)
    const created = next.nodes[next.nodes.length - 1]
    expect(created.title).toBe('Limites')
    expect(created.parentId).toBe('angle')
    expect(created.manual).toBe(true)
    // Une carte manuelle échappe à l’entonnoir.
    const filtered = filterMap(next.nodes, { ...DEFAULT_FILTERS, minRelevance: 95 })
    expect(filtered.visible.has(created.id)).toBe(true)
  })

  it('supprime une carte avec sa descendance et nettoie les liens', () => {
    const withLink = toggleLink(map, 'a', 'b')
    expect(withLink.nodes.find((entry) => entry.id === 'a')?.relatedIds).toEqual(['b'])
    const pruned = removeCard(withLink, 'angle')
    expect(pruned.nodes.map((entry) => entry.id)).toEqual(['subject'])
    const prunedSite = removeCard(withLink, 'a')
    expect(prunedSite.nodes.map((entry) => entry.id)).toEqual(['subject', 'angle', 'b'])
    expect(prunedSite.nodes.find((entry) => entry.id === 'b')?.relatedIds).toEqual([])
  })

  it('relie puis délie deux cartes sans doublon', () => {
    const once = toggleLink(map, 'a', 'b')
    const twice = toggleLink(once, 'a', 'b')
    expect(twice.nodes.find((entry) => entry.id === 'a')?.relatedIds).toEqual([])
    expect(toggleLink(map, 'a', 'a')).toBe(map)
  })
})

describe('mise en page', () => {
  it('ne superpose aucun nœud et aligne les niveaux en colonnes', () => {
    const tree = [
      node({ id: 's', kind: 'subject', title: 'Sujet' }),
      node({ id: 'a1', kind: 'angle', title: 'Angle 1', parentId: 's' }),
      node({ id: 'a2', kind: 'angle', title: 'Angle 2', parentId: 's' }),
      site('s1', { parentId: 'a1' }),
      site('s2', { parentId: 'a1' }),
      site('s3', { parentId: 'a2' })
    ]
    const layout = layoutMap(tree)
    const boxes = Object.values(layout.boxes)
    expect(boxes).toHaveLength(6)
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        expect(boxesOverlap(boxes[i], boxes[j])).toBe(false)
      }
    }
    expect(layout.boxes.s.x).toBeLessThan(layout.boxes.a1.x)
    expect(layout.boxes.a1.x).toBe(layout.boxes.a2.x)
    expect(layout.boxes.s1.x).toBeGreaterThan(layout.boxes.a1.x)
  })
})

describe('tensions', () => {
  it('détecte deux valeurs divergentes et cite les deux phrases', () => {
    const sites = [
      site('a', {
        domain: 'source-a.fr',
        excerpt: 'Le prix moyen atteint 120 euros en 2019 selon cette étude.'
      }),
      site('b', {
        domain: 'source-b.fr',
        excerpt: 'Le prix moyen atteint 180 euros en 2021 selon ce rapport.'
      })
    ]
    const tensions = detectTensions(sites)
    expect(tensions.length).toBeGreaterThan(0)
    expect(tensions[0].kind).toBe('tension')
    expect(tensions[0].relatedIds?.sort()).toEqual(['a', 'b'])
    expect(tensions[0].excerpt).toContain('source-a.fr')
    expect(tensions[0].excerpt).toContain('source-b.fr')
  })

  it('ne crée rien quand les sources concordent', () => {
    const sites = [
      site('a', { excerpt: 'Le prix moyen atteint 120 euros en 2019.' }),
      site('b', { excerpt: 'Le prix moyen atteint 120 euros en 2019.' })
    ]
    expect(detectTensions(sites)).toHaveLength(0)
  })
})

describe('rapport', () => {
  const map: TunnelMap = {
    id: 'map',
    spaceId: 'space',
    query: 'navigateur minimaliste',
    lang: 'fr',
    createdAt: now,
    updatedAt: now,
    nodes: [
      node({ id: 'subject', kind: 'subject', title: 'Navigateur minimaliste' }),
      node({ id: 'angle', kind: 'angle', title: 'Panorama', parentId: 'subject' }),
      site('a', { parentId: 'angle', title: 'Liste de navigateurs', relevance: 90 }),
      site('b', { parentId: 'angle', title: 'Navigateur léger', relevance: 70 }),
      site('c', { parentId: 'angle', title: 'Hors sujet', relevance: 20, status: 'dismissed' }),
      node({
        id: 'tension',
        kind: 'tension',
        title: 'Divergence',
        relatedIds: ['a', 'b'],
        excerpt: 'a : « 2019 »\nb : « 2021 »'
      })
    ]
  }

  it('numérote seulement les sources de la carte et ignore les écartées', () => {
    const report = buildTunnelReport(map)
    expect(report).toContain('[1] Liste de navigateurs')
    expect(report).toContain('[2] Navigateur léger')
    expect(report).not.toContain('Hors sujet')
    expect(report).toContain('## Tensions entre sources')
    expect(report).toContain('https://example.org/a')
  })

  it('respecte les sources visibles', () => {
    const report = buildTunnelReport(map, new Set(['b']))
    expect(report).not.toContain('[1] Liste de navigateurs')
    expect(report).toContain('Navigateur léger')
  })

  it('exporte un document HTML autonome et un JSON complet', () => {
    const html = buildTunnelHtml(map)
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('Liste de navigateurs')
    expect(html).not.toContain('Hors sujet')
    const json = JSON.parse(toJsonExport(map)) as { nodes: MapNode[]; query: string }
    expect(json.query).toBe(map.query)
    expect(json.nodes).toHaveLength(map.nodes.length)
  })
})

describe('correction de requête', () => {
  it('propose une correction pour une faute fréquente', () => {
    expect(suggestQueryFix('utilisr l ia pour redigir des texte')).toBe(
      'utiliser l ia pour rédiger des texte'
    )
  })

  it('ne corrige pas une requête déjà propre ni les sigles courts', () => {
    expect(suggestQueryFix('navigateur minimaliste')).toBeNull()
    expect(suggestQueryFix('ia locale')).toBeNull()
  })
})

describe('export OPML', () => {
  it('garde la hiérarchie, les URL et échappe le XML', () => {
    const map: TunnelMap = {
      id: 'map',
      spaceId: 'space',
      query: 'navigateurs & vie privée',
      title: 'Veille',
      lang: 'fr',
      nodes: [
        node({ id: 'sujet', kind: 'subject', title: 'Navigateurs', parentId: null }),
        node({ id: 'angle', kind: 'angle', title: 'Vie privée', parentId: 'sujet' }),
        node({
          id: 'site',
          kind: 'site',
          title: 'DuckDuckGo <privé>',
          parentId: 'angle',
          url: 'https://duckduckgo.com/'
        }),
        node({ id: 'ecarte', kind: 'site', title: 'Hors sujet', parentId: 'angle', status: 'dismissed' })
      ],
      createdAt: now,
      updatedAt: now
    }
    const opml = toOpmlExport(map)
    expect(opml).toContain('<opml version="2.0">')
    expect(opml).toContain('text="Navigateurs"')
    expect(opml).toContain('text="Vie privée"')
    expect(opml).toContain('text="DuckDuckGo &lt;privé&gt;"')
    expect(opml).toContain('htmlUrl="https://duckduckgo.com/"')
    expect(opml).not.toContain('Hors sujet')
  })
})
