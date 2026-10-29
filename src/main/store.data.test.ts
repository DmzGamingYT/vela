import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Trousseau simulé : chaque test choisit s'il chiffre, déchiffre ou échoue.
const keychain = vi.hoisted(() => ({
  available: true,
  decryptFails: false,
  encryptFails: false
}))

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => keychain.available,
    decryptString: (buffer: Buffer) => {
      if (keychain.decryptFails) throw new Error('trousseau indisponible')
      const text = buffer.toString('latin1')
      return text.startsWith('enc:') ? text.slice(4) : ''
    },
    encryptString: (value: string) => {
      if (keychain.encryptFails) throw new Error('trousseau verrouillé')
      return Buffer.from(`enc:${value}`, 'latin1')
    }
  }
}))

const { Store } = await import('./store')
const { TUNNEL_MAP_LIMIT } = await import('@shared/tunnel')
import type { TunnelMap } from '@shared/tunnel'

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vela-data-'))
  dirs.push(dir)
  return dir
}

function legacyFile(dir: string, value = 'sk-ancienne-cle'): string {
  const file = join(dir, 'secret.bin')
  writeFileSync(file, Buffer.from(`enc:${value}`, 'latin1'))
  return file
}

function map(id: string, updatedAt: number): TunnelMap {
  return {
    id,
    spaceId: 'space-1',
    query: `sujet ${id}`,
    lang: 'fr',
    nodes: [
      {
        id: `${id}-n`,
        kind: 'subject',
        title: `Sujet ${id}`,
        summary: '',
        relevance: 100,
        confidence: 90,
        reason: 'sujet de la carte',
        status: 'neutral',
        parentId: null,
        createdAt: updatedAt
      }
    ],
    createdAt: updatedAt,
    updatedAt
  }
}

afterEach(() => {
  keychain.available = true
  keychain.decryptFails = false
  keychain.encryptFails = false
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  dirs.length = 0
})

describe('clé héritée (secret.bin)', () => {
  it('ne supprime l’ancienne clé qu’après relecture de la nouvelle', () => {
    const dir = tempDir()
    const legacy = legacyFile(dir)
    const store = new Store(dir)
    store.flush()

    expect(store.getSecret('openai')).toBe('sk-ancienne-cle')
    expect(existsSync(legacy)).toBe(false)
    expect(readFileSync(join(dir, 'secrets.json')).toString('latin1')).toContain('sk-ancienne-cle')
  })

  it('garde le fichier quand le chiffrement est indisponible', () => {
    keychain.available = false
    const dir = tempDir()
    const legacy = legacyFile(dir)
    const store = new Store(dir)

    expect(store.getSecret('openai')).toBeNull()
    expect(existsSync(legacy)).toBe(true)
  })

  it('garde le fichier quand la clé est illisible', () => {
    keychain.decryptFails = true
    const dir = tempDir()
    const legacy = legacyFile(dir)
    const store = new Store(dir)

    expect(store.getSecret('openai')).toBeNull()
    expect(existsSync(legacy)).toBe(true)
  })

  it('garde le fichier quand l’écriture échoue, sans clé en mémoire', () => {
    keychain.encryptFails = true
    const dir = tempDir()
    const legacy = legacyFile(dir)
    const store = new Store(dir)

    expect(store.getSecret('openai')).toBeNull()
    expect(existsSync(legacy)).toBe(true)
  })

  it('ne devine pas le fournisseur quand la clé active existe déjà', () => {
    const dir = tempDir()
    keychain.encryptFails = false
    // Première passe : la clé rejoint OpenAI.
    legacyFile(dir, 'sk-premiere')
    new Store(dir).flush()
    // Seconde passe : une autre ancienne clé apparaît, OpenAI en a déjà une.
    const legacy = legacyFile(dir, 'sk-seconde')
    const store = new Store(dir)

    expect(store.getSecret('openai')).toBe('sk-premiere')
    expect(existsSync(legacy)).toBe(true)
  })
})

describe('plafond des cartes du tunnel', () => {
  it('garde vingt cartes et refuse la suivante sans rien évincer', () => {
    const dir = tempDir()
    const store = new Store(dir)
    for (let index = 0; index < TUNNEL_MAP_LIMIT; index += 1) {
      expect(store.saveTunnelMap(map(`carte-${index}`, 1000 + index))).toBe(true)
    }

    expect(store.saveTunnelMap(map('carte-de-trop', 99_000))).toBe(false)
    const kept = store.listTunnelMaps()
    expect(kept).toHaveLength(TUNNEL_MAP_LIMIT)
    // La plus ancienne n'a pas été sacrifiée : c'était le défaut d'origine.
    expect(kept.some((entry) => entry.id === 'carte-0')).toBe(true)
    expect(kept.some((entry) => entry.id === 'carte-de-trop')).toBe(false)
  })

  it('met toujours à jour une carte existante au plafond', () => {
    const dir = tempDir()
    const store = new Store(dir)
    for (let index = 0; index < TUNNEL_MAP_LIMIT; index += 1) {
      store.saveTunnelMap(map(`carte-${index}`, 1000 + index))
    }

    expect(store.saveTunnelMap(map('carte-3', 50_000))).toBe(true)
    expect(store.getTunnelMap('carte-3')?.updatedAt).toBe(50_000)
    expect(store.listTunnelMaps()[0].id).toBe('carte-3')
    expect(store.listTunnelMaps()).toHaveLength(TUNNEL_MAP_LIMIT)
  })

  it('refuse aussi la copie qui dépasserait le plafond', () => {
    const dir = tempDir()
    const store = new Store(dir)
    for (let index = 0; index < TUNNEL_MAP_LIMIT; index += 1) {
      store.saveTunnelMap(map(`carte-${index}`, 1000 + index))
    }

    expect(store.duplicateTunnelMap('carte-0')).toBeNull()
    expect(store.listTunnelMaps()).toHaveLength(TUNNEL_MAP_LIMIT)
  })
})
