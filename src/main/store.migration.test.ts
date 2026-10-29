import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Le Store ne touche au trousseau que pour les clés de modèles.
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => false,
    decryptString: () => '',
    encryptString: () => Buffer.from('')
  }
}))

const { Store } = await import('./store')

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vela-store-'))
  dirs.push(dir)
  return dir
}

function backups(dir: string): string[] {
  return readdirSync(dir).filter((name) => name.startsWith('vela-backup-'))
}

/** Fichier tel que la 0.3.7 l'écrivait : pas de champ d'ordre. */
function writeLegacy(dir: string, bookmarks: { id: string; url: string; title: string; createdAt: number }[]) {
  writeFileSync(
    join(dir, 'vela.json'),
    JSON.stringify({
      version: 1,
      spaces: [{ id: 'space-1', name: 'Personnel', color: '#5b5bd6' }],
      tabs: [],
      bookmarks
    }),
    'utf8'
  )
}

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  dirs.length = 0
})

describe('migration des favoris au démarrage', () => {
  it('numérote, sauvegarde le fichier d’origine puis reste idempotente', () => {
    const dir = tempDir()
    writeLegacy(dir, [
      { id: 'c', url: 'https://c.example', title: 'C', createdAt: 3 },
      { id: 'a', url: 'https://a.example', title: 'A', createdAt: 1 },
      { id: 'b', url: 'https://b.example', title: 'B', createdAt: 2 }
    ])
    const before = readFileSync(join(dir, 'vela.json'), 'utf8')

    const first = new Store(dir)
    first.flush()

    const afterMigration = first.get().bookmarks
    expect(afterMigration.map((entry) => entry.id)).toEqual(['c', 'a', 'b'])
    expect(afterMigration.map((entry) => entry.order)).toEqual([0, 1, 2])
    expect(afterMigration.map((entry) => entry.title)).toEqual(['C', 'A', 'B'])

    const saved = backups(dir)
    expect(saved).toHaveLength(1)
    expect(readFileSync(join(dir, saved[0]), 'utf8')).toBe(before)

    const written = JSON.parse(readFileSync(join(dir, 'vela.json'), 'utf8')) as {
      bookmarks: { id: string; order: number }[]
    }
    expect(written.bookmarks.map((entry) => entry.order)).toEqual([0, 1, 2])

    const second = new Store(dir)
    second.flush()
    expect(backups(dir)).toHaveLength(1)
    expect(second.get().bookmarks.map((entry) => entry.order)).toEqual([0, 1, 2])
    expect(second.get().bookmarks.map((entry) => entry.id)).toEqual(['c', 'a', 'b'])
  })

  it('reprend un fichier partiellement migré en gardant l’ordre visible', () => {
    const dir = tempDir()
    writeFileSync(
      join(dir, 'vela.json'),
      JSON.stringify({
        version: 1,
        spaces: [{ id: 'space-1', name: 'Personnel', color: '#5b5bd6' }],
        tabs: [],
        bookmarks: [
          { id: 'a', url: 'https://a.example', title: 'A', createdAt: 1, order: 0 },
          { id: 'b', url: 'https://b.example', title: 'B', createdAt: 2 },
          { id: 'c', url: 'https://c.example', title: 'C', createdAt: 3, order: 7 }
        ]
      }),
      'utf8'
    )
    const store = new Store(dir)
    store.flush()
    expect(store.get().bookmarks.map((entry) => entry.id)).toEqual(['a', 'b', 'c'])
    expect(store.get().bookmarks.map((entry) => entry.order)).toEqual([0, 1, 2])
    expect(backups(dir)).toHaveLength(1)
    expect(readFileSync(join(dir, 'migration.log'), 'utf8')).toMatch(/Ordre des favoris normalisé/)
  })

  it('refuse de démarrer sur un fichier corrompu sans écraser les données', () => {
    const dir = tempDir()
    const original = '{ pas du json'
    writeFileSync(join(dir, 'vela.json'), original, 'utf8')
    expect(() => new Store(dir)).toThrow(/données de Vela sont illisibles/)
    expect(readFileSync(join(dir, 'vela.json'), 'utf8')).toBe(original)
    expect(backups(dir)).toHaveLength(0)
  })

  it('démarre sur des favoris sans identifiant, en le journalisant', () => {
    const dir = tempDir()
    writeFileSync(
      join(dir, 'vela.json'),
      JSON.stringify({
        version: 1,
        spaces: [{ id: 'space-1', name: 'Personnel', color: '#5b5bd6' }],
        tabs: [],
        bookmarks: [{ id: 'a', url: 'https://a.example', title: 'A', createdAt: 1 }, { url: 'https://x.example' }]
      }),
      'utf8'
    )
    const store = new Store(dir)
    store.flush()
    expect(store.get().bookmarks.map((entry) => entry.id)).toEqual(['a'])
    expect(store.get().bookmarks[0].order).toBe(0)
    expect(readFileSync(join(dir, 'migration.log'), 'utf8')).toMatch(/ignorée/)
    expect(backups(dir)).toHaveLength(1)
  })

  it('ajoute un nouveau favori en fin de liste et le renumérote', () => {
    const dir = tempDir()
    const store = new Store(dir)
    store.toggleBookmark('https://un.example', 'Un')
    store.toggleBookmark('https://deux.example', 'Deux')
    store.flush()
    expect(store.get().bookmarks.map((entry) => entry.title)).toEqual(['Un', 'Deux'])
    expect(store.get().bookmarks.map((entry) => entry.order)).toEqual([0, 1])

    store.removeBookmark(store.get().bookmarks[0].id)
    store.flush()
    expect(store.get().bookmarks.map((entry) => entry.order)).toEqual([0])
  })

  it('importe dans l’ordre du fichier source', () => {
    const dir = tempDir()
    const store = new Store(dir)
    store.addBookmarks([
      { url: 'https://z.example', title: 'Z' },
      { url: 'https://a.example', title: 'A' },
      { url: 'https://m.example', title: 'M' }
    ])
    store.flush()
    expect(store.get().bookmarks.map((entry) => entry.title)).toEqual(['Z', 'A', 'M'])
    expect(store.get().bookmarks.map((entry) => entry.order)).toEqual([0, 1, 2])
  })

  it('déplace et réordonne avec validation', () => {
    const dir = tempDir()
    const store = new Store(dir)
    store.addBookmarks([
      { url: 'https://a.example', title: 'A' },
      { url: 'https://b.example', title: 'B' },
      { url: 'https://c.example', title: 'C' }
    ])
    const [a, b, c] = store.get().bookmarks

    expect(store.moveBookmark(a.id, 2)).toBe(true)
    expect(store.get().bookmarks.map((entry) => entry.title)).toEqual(['B', 'C', 'A'])
    expect(store.get().bookmarks.map((entry) => entry.order)).toEqual([0, 1, 2])

    expect(store.moveBookmark(c.id, 3)).toBe(false)
    expect(store.moveBookmark('inconnu', 0)).toBe(false)
    expect(store.get().bookmarks.map((entry) => entry.title)).toEqual(['B', 'C', 'A'])

    expect(store.reorderBookmarks([a.id, b.id, c.id])).toBe(true)
    expect(store.get().bookmarks.map((entry) => entry.title)).toEqual(['A', 'B', 'C'])

    expect(store.reorderBookmarks([a.id, a.id, b.id])).toBe(false)
    expect(store.reorderBookmarks([a.id, b.id])).toBe(false)
    expect(store.get().bookmarks.map((entry) => entry.title)).toEqual(['A', 'B', 'C'])
  })

  it('donne une partition aux espaces qui n’en ont pas', () => {
    const dir = tempDir()
    writeFileSync(
      join(dir, 'vela.json'),
      JSON.stringify({
        version: 1,
        spaces: [
          { id: 'space-1', name: 'Personnel', color: '#5b5bd6' },
          { id: 'space-2', name: 'Travail', color: '#4FB6D8', partition: '../partagee' }
        ],
        tabs: [],
        bookmarks: []
      }),
      'utf8'
    )
    const store = new Store(dir)
    store.flush()
    const [first, second] = store.get().spaces
    expect(first.partition).toBe('persist:vela-space-1')
    // Une valeur douteuse n'est pas reprise telle quelle : chaque espace garde
    // sa propre session.
    expect(second.partition).toBe('persist:vela-space-2')

    const reopened = new Store(dir)
    expect(reopened.get().spaces.map((space) => space.partition)).toEqual([
      'persist:vela-space-1',
      'persist:vela-space-2'
    ])
  })

  it('sort les photos d’avatar de vela.json, avec sauvegarde', () => {
    const dir = tempDir()
    const bytes = Buffer.from('photo-avatar-0-3-7')
    const avatar = `image:data:image/jpeg;base64,${bytes.toString('base64')}`
    writeFileSync(
      join(dir, 'vela.json'),
      JSON.stringify({
        version: 1,
        spaces: [{ id: 'space-1', name: 'Personnel', color: '#5b5bd6', avatar }],
        tabs: [],
        bookmarks: []
      }),
      'utf8'
    )
    const before = readFileSync(join(dir, 'vela.json'), 'utf8')

    const store = new Store(dir)
    store.flush()
    const stored = store.get().spaces[0].avatar
    expect(stored).toMatch(/^image:file:[a-f0-9]{24}\.jpg$/)

    const written = readFileSync(join(dir, 'vela.json'), 'utf8')
    expect(written).not.toContain('image:data:')
    expect(written).toContain('image:file:')
    expect(backups(dir)).toHaveLength(1)
    expect(readFileSync(join(dir, backups(dir)[0]), 'utf8')).toBe(before)
    const files = readdirSync(join(dir, 'avatars'))
    expect(files).toEqual([(stored as string).slice(11)])

    // Deuxième démarrage : aucun nouveau fichier, aucune nouvelle sauvegarde.
    const again = new Store(dir)
    again.flush()
    expect(again.get().spaces[0].avatar).toBe(stored)
    expect(backups(dir)).toHaveLength(1)
    expect(readdirSync(join(dir, 'avatars'))).toHaveLength(1)
  })

  it('signale une photo refusée et ne crée pas de fichier', () => {
    const dir = tempDir()
    const avatar = 'image:data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='
    writeFileSync(
      join(dir, 'vela.json'),
      JSON.stringify({
        version: 1,
        spaces: [{ id: 'space-1', name: 'Personnel', color: '#5b5bd6', avatar }],
        tabs: [],
        bookmarks: []
      }),
      'utf8'
    )
    const store = new Store(dir)
    store.flush()
    // Le format n'est pas une image acceptée : l'avatar invalide est écarté
    // comme avant, et rien n'est écrit sur le disque.
    expect(store.get().spaces[0].avatar).toBeNull()
    expect(backups(dir)).toHaveLength(0)
    expect(existsSync(join(dir, 'avatars'))).toBe(false)
    expect(readFileSync(join(dir, 'migration.log'), 'utf8')).toMatch(/non converties/)
  })

  it('garde l’ordre après un redémarrage', () => {
    const dir = tempDir()
    const store = new Store(dir)
    store.addBookmarks([
      { url: 'https://a.example', title: 'A' },
      { url: 'https://b.example', title: 'B' },
      { url: 'https://c.example', title: 'C' }
    ])
    const ids = store.get().bookmarks.map((entry) => entry.id)
    store.moveBookmark(ids[2], 0)
    store.flush()

    const reopened = new Store(dir)
    expect(reopened.get().bookmarks.map((entry) => entry.title)).toEqual(['C', 'A', 'B'])
    expect(reopened.get().bookmarks.map((entry) => entry.order)).toEqual([0, 1, 2])
    expect(backups(dir)).toHaveLength(0)
  })
})

describe('niveau de blocage', () => {
  it('ouvre un fichier sans niveau en mode traqueurs', () => {
    const dir = tempDir()
    const store = new Store(dir)
    store.flush()
    const reopened = new Store(dir)
    expect(reopened.get().settings.blockLevel).toBe('trackers')
    expect(reopened.get().settings.blockTrackers).toBe(true)
  })

  it('garde le mode renforcé et refuse une valeur inconnue', () => {
    const dir = tempDir()
    const store = new Store(dir)
    store.update((state) => {
      state.settings.blockLevel = 'strict'
    })
    store.flush()
    expect(new Store(dir).get().settings.blockLevel).toBe('strict')

    const raw = JSON.parse(readFileSync(join(dir, 'vela.json'), 'utf8'))
    raw.settings.blockLevel = 'tout'
    writeFileSync(join(dir, 'vela.json'), JSON.stringify(raw), 'utf8')
    expect(new Store(dir).get().settings.blockLevel).toBe('trackers')
  })
})
