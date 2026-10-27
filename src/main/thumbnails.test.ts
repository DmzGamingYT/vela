import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { thumbnailDir, Thumbnails } from './thumbnails'

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vela-thumbs-'))
  dirs.push(dir)
  return dir
}

async function seed(dir: string, url: string): Promise<void> {
  mkdirSync(thumbnailDir(dir), { recursive: true })
  // Le nom exact est calculé par la classe : on écrit via une capture factice.
  const store = new Thumbnails(dir, () => true)
  const fake = {
    capturePage: async () => ({
      getSize: () => ({ width: 800, height: 600 }),
      resize: () => ({ toJPEG: () => Buffer.from('vignette-jpeg') })
    })
  } as unknown as Parameters<Thumbnails['capture']>[0]
  await store.capture(fake, url)
}

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  dirs.length = 0
})

describe('vignettes de pages récentes', () => {
  it('capture, relit et compte une vignette', async () => {
    const dir = tempDir()
    const store = new Thumbnails(dir, () => true)
    const fake = {
      capturePage: async () => ({
        getSize: () => ({ width: 800, height: 600 }),
        resize: () => ({ toJPEG: () => Buffer.from('vignette-jpeg') })
      })
    } as unknown as Parameters<Thumbnails['capture']>[0]
    expect(await store.capture(fake, 'https://exemple.fr/page')).toBe(true)
    expect(store.count()).toBe(1)
    expect(store.has('https://exemple.fr/page')).toBe(true)
    expect(store.dataUrl('https://exemple.fr/page')).toMatch(/^data:image\/jpeg;base64,/)
    expect(store.dataUrl('https://autre.fr/')).toBeNull()
  })

  it('ne capture rien quand le réglage est désactivé', async () => {
    const dir = tempDir()
    const store = new Thumbnails(dir, () => false)
    const fake = {
      capturePage: async () => {
        throw new Error('ne doit pas être appelé')
      }
    } as unknown as Parameters<Thumbnails['capture']>[0]
    expect(await store.capture(fake, 'https://exemple.fr/page')).toBe(false)
    expect(store.count()).toBe(0)
  })

  it('ignore les adresses internes', async () => {
    const dir = tempDir()
    const store = new Thumbnails(dir, () => true)
    const fake = { capturePage: async () => ({}) } as unknown as Parameters<Thumbnails['capture']>[0]
    expect(await store.capture(fake, 'vela://accueil')).toBe(false)
    expect(await store.capture(fake, 'about:blank')).toBe(false)
  })

  it('vide tout sur demande et ne sert plus rien ensuite', async () => {
    const dir = tempDir()
    const store = new Thumbnails(dir, () => true)
    await seed(dir, 'https://a.fr/')
    await seed(dir, 'https://b.fr/')
    expect(store.count()).toBe(2)
    expect(store.purge()).toBe(2)
    expect(store.count()).toBe(0)
    expect(store.dataUrl('https://a.fr/')).toBeNull()
  })

  it('oublie tout de suite ce qui est sur le disque quand le réglage est coupé', async () => {
    const dir = tempDir()
    await seed(dir, 'https://a.fr/')
    const off = new Thumbnails(dir, () => false)
    expect(off.dataUrl('https://a.fr/')).toBeNull()
    expect(off.count()).toBe(1)
  })
})

describe('dossier des vignettes', () => {
  it('reste dans le dossier de données', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'vela.json'), '{}')
    expect(thumbnailDir(dir).startsWith(dir)).toBe(true)
  })
})
