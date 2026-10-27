import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { NoteAudioStore, isAudioName, parseAudioDataUrl } from './noteAudio'

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vela-audio-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true })
})

const bytes = Buffer.from('enregistrement-vocal')
const webm = `data:audio/webm;base64,${bytes.toString('base64')}`

describe('enregistrements vocaux locaux', () => {
  it('écrit un fichier dans le dossier de l’espace et le relit', () => {
    const store = new NoteAudioStore(tempDir())
    const saved = store.save('space-1', webm)
    expect(saved?.name).toMatch(/^space-1\/[a-z0-9]{4,40}\.webm$/)
    expect(saved?.name && isAudioName(saved.name)).toBe(true)
    const read = store.read(saved?.name)
    expect(read).toBe(webm)
    expect(store.file(saved?.name)?.mime).toBe('audio/webm')
  })

  it('refuse un type inconnu, une taille nulle ou un faux nom', () => {
    const store = new NoteAudioStore(tempDir())
    expect(parseAudioDataUrl('data:audio/flac;base64,AAAA')).toBeNull()
    expect(parseAudioDataUrl('data:audio/webm;base64,')).toBeNull()
    expect(parseAudioDataUrl('https://exemple.fr/son.webm')).toBeNull()
    expect(store.save('space-1', 'data:text/plain;base64,AAAA')).toBeNull()
    expect(store.read('../../vela.json')).toBeNull()
    expect(store.read('space-1/abc.webm/..')).toBeNull()
    expect(store.remove('autre/abc.webm')).toBe(false)
    expect(isAudioName('space-1/..%2F..%2Fvela.json')).toBe(false)
  })

  it('nettoie un nom d’espace douteux sans sortir du dossier', () => {
    const base = tempDir()
    const store = new NoteAudioStore(base)
    const saved = store.save('../..', webm)
    expect(saved?.name.startsWith('espace-') || saved?.name.startsWith('--')).toBe(true)
    expect(existsSync(join(base, 'vela.json'))).toBe(false)
  })

  it('supprime sur demande, et purge les fichiers non cités', () => {
    const store = new NoteAudioStore(tempDir())
    const first = store.save('space-1', webm)
    const second = store.save('space-1', webm)
    expect(store.remove(first?.name)).toBe(true)
    expect(store.read(first?.name)).toBeNull()
    expect(store.read(second?.name)).toBe(webm)

    const removed = store.prune(new Set([second?.name ?? '']))
    expect(removed).toBe(0)
    const orphan = store.save('space-2', webm)
    expect(store.prune(new Set([second?.name ?? '']))).toBe(1)
    expect(store.read(orphan?.name)).toBeNull()
    expect(store.prune(new Set())).toBe(1)
  })

  it('garde les fichiers existants hors de portée des noms calculés', () => {
    const base = tempDir()
    const store = new NoteAudioStore(base)
    writeFileSync(join(base, 'notes', 'vela.json'), '{}', 'utf8')
    store.prune(new Set())
    expect(statSync(join(base, 'notes', 'vela.json')).isFile()).toBe(true)
    expect(readdirSync(join(base, 'notes')).includes('audio')).toBe(true)
  })
})
