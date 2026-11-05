import { describe, expect, it } from 'vitest'
import {
  ICON_FAIL_TTL,
  ICON_TTL,
  bestIconCandidate,
  createIconCache,
  iconCandidatesFromHtml,
  iconCandidatesFromManifest,
  rankIconCandidates,
  type IconStore
} from './favicons'

function harness(start = 1_700_000_000_000) {
  let clock = start
  let store: IconStore = {}
  let calls = 0
  let fail = false
  const cache = createIconCache({
    load: () => store,
    save: (next) => {
      store = next
    },
    fetchIcon: async (host) => {
      calls += 1
      if (fail) throw new Error('réseau')
      return { data: Buffer.from(host).toString('base64'), type: 'image/png' }
    },
    now: () => clock
  })
  return {
    cache,
    store: () => store,
    calls: () => calls,
    advance: (ms: number) => {
      clock += ms
    },
    now: () => clock,
    failWith: (value: boolean) => {
      fail = value
    }
  }
}

describe('cache de favicons', () => {
  it('ne fait qu’une requête pour dix montages successifs', async () => {
    const h = harness()
    for (let i = 0; i < 10; i += 1) await h.cache.get('github.com')
    expect(h.calls()).toBe(1)
  })

  it('ne fait qu’une requête pour dix montages simultanés', async () => {
    const h = harness()
    const results = await Promise.all(Array.from({ length: 10 }, () => h.cache.get('github.com')))
    expect(h.calls()).toBe(1)
    expect(results.every((result) => result?.startsWith('data:image/png;base64,'))).toBe(true)
  })

  it('garde l’icône sept jours, puis la redemande', async () => {
    const h = harness()
    await h.cache.get('figma.com')
    h.advance(ICON_TTL - 1)
    await h.cache.get('figma.com')
    expect(h.calls()).toBe(1)
    h.advance(2)
    await h.cache.get('figma.com')
    expect(h.calls()).toBe(2)
  })

  it('met les échecs en cache une heure seulement', async () => {
    const h = harness()
    h.failWith(true)
    expect(await h.cache.get('introuvable.fr')).toBeNull()
    expect(h.calls()).toBe(1)
    h.advance(ICON_FAIL_TTL - 1)
    await h.cache.get('introuvable.fr')
    expect(h.calls()).toBe(1)
    h.advance(2)
    h.failWith(false)
    expect(await h.cache.get('introuvable.fr')).toMatch(/^data:/)
    expect(h.calls()).toBe(2)
  })

  it('sépare les domaines et survit au rechargement', async () => {
    const h = harness()
    await h.cache.get('a.fr')
    await h.cache.get('b.fr')
    expect(h.calls()).toBe(2)
    expect(Object.keys(h.store()).sort()).toEqual(['a.fr', 'b.fr'])

    // Nouvelle instance sur le même stockage : aucun appel réseau.
    const restored = createIconCache({
      load: () => h.store(),
      save: () => {},
      fetchIcon: async () => {
        throw new Error('ne doit pas être appelé')
      },
      now: h.now
    })
    expect(await restored.get('a.fr')).toMatch(/^data:/)
  })

  it('vide tout sur demande', async () => {
    const h = harness()
    await h.cache.get('a.fr')
    await h.cache.get('b.fr')
    expect(h.cache.size()).toBe(2)
    expect(h.cache.purge()).toBe(2)
    expect(h.cache.size()).toBe(0)
    await h.cache.get('a.fr')
    expect(h.calls()).toBe(3)
  })

  it('peek ne contacte jamais le réseau et ignore les échecs', async () => {
    const h = harness()
    expect(h.cache.peek('jamais-vu.fr')).toBeNull()
    expect(h.calls()).toBe(0)
    await h.cache.get('a.fr')
    expect(h.cache.peek('a.fr')).toMatch(/^data:/)
    // Même après expiration, la lecture seule sert l'icône déjà là.
    h.advance(ICON_TTL * 2)
    expect(h.cache.peek('a.fr')).toMatch(/^data:/)
    expect(h.calls()).toBe(1)
    h.failWith(true)
    await h.cache.get('en-echec.fr')
    expect(h.cache.peek('en-echec.fr')).toBeNull()
  })
})

describe('choix de la plus grande icône', () => {
  const page = `
    <html><head>
      <link rel="icon" sizes="16x16 32x32" href="/favicon-32.png">
      <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
      <link rel="manifest" href="/manifest.webmanifest">
    </head></html>`

  it('préfère l’Apple Touch et retient le manifeste', () => {
    const found = iconCandidatesFromHtml(page, 'https://exemple.fr/article')
    expect(found.manifest).toBe('https://exemple.fr/manifest.webmanifest')
    expect(bestIconCandidate(found.icons)).toBe('https://exemple.fr/apple-touch-icon.png')
  })

  it('garde la plus grande taille déclarée, puis l’Apple Touch à égalité', () => {
    const ranked = rankIconCandidates([
      { url: 'https://exemple.fr/icon-16.png', size: 16, apple: false },
      { url: 'https://exemple.fr/icon-512.png', size: 512, apple: false },
      { url: 'https://exemple.fr/icon-192.png', size: 192, apple: false },
      { url: 'https://exemple.fr/touch-512.png', size: 512, apple: true }
    ])
    expect(ranked[0].url).toBe('https://exemple.fr/touch-512.png')
    expect(ranked[1].url).toBe('https://exemple.fr/icon-512.png')
  })

  it('ignore les icônes servies par un autre domaine', () => {
    const found = iconCandidatesFromHtml(
      '<link rel="icon" href="https://cdn.autre.fr/icon.png"><link rel="icon" href="/local.png">',
      'https://exemple.fr/'
    )
    expect(found.icons.map((icon) => icon.url)).toEqual(['https://exemple.fr/local.png'])
  })

  it('lit les icônes du manifeste et résout leurs adresses', () => {
    const icons = iconCandidatesFromManifest(
      {
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'https://cdn.autre.fr/icon.png', sizes: '1024x1024' }
        ]
      },
      'https://exemple.fr/manifest.webmanifest'
    )
    expect(bestIconCandidate(icons)).toBe('https://exemple.fr/icon-512.png')
  })

  it('ne promet aucune icône quand la page n’en déclare pas', () => {
    const found = iconCandidatesFromHtml('<html><head></head></html>', 'https://exemple.fr/')
    expect(found.icons).toEqual([])
    expect(found.manifest).toBeNull()
    expect(bestIconCandidate(found.icons)).toBeNull()
  })
})
