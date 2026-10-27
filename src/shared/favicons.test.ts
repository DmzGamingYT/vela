import { describe, expect, it } from 'vitest'
import { ICON_FAIL_TTL, ICON_TTL, createIconCache, type IconStore } from './favicons'

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
})
