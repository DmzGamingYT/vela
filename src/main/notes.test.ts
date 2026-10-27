import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { HighlightsStore, NotesStore, normalizeTags } from './notes'

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vela-notes-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop() as string
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('étiquettes de note', () => {
  it('nettoie, déduplique et borne le nombre d’étiquettes', () => {
    expect(normalizeTags(['  #Histoire ', 'histoire', 'TODO', '', 42])).toEqual(['Histoire', 'TODO'])
    const many = Array.from({ length: 12 }, (_, index) => `tag-${index}`)
    expect(normalizeTags(many)).toHaveLength(8)
    expect(normalizeTags('histoire')).toEqual([])
  })
})

describe('NotesStore', () => {
  it('enregistre les étiquettes et l’épinglage, et liste les épinglées d’abord', () => {
    const store = new NotesStore(tempDir())
    const first = store.save({
      title: 'Ancienne',
      body: 'Corps ancien',
      spaceId: 'space',
      url: 'https://example.org/a'
    })
    const pinned = store.save({
      title: 'Épinglée',
      body: 'Corps épinglé',
      spaceId: 'space',
      tags: ['veille', 'veille', 'IA'],
      pinned: true
    })
    expect(first.tags).toEqual([])
    expect(pinned.tags).toEqual(['veille', 'IA'])
    expect(pinned.pinned).toBe(true)

    const list = store.list()
    expect(list[0].id).toBe(pinned.id)
    expect(list[1].id).toBe(first.id)
    expect(list[0].tags).toEqual(['veille', 'IA'])
  })

  it('conserve les étiquettes quand une sauvegarde ne les mentionne pas', () => {
    const store = new NotesStore(tempDir())
    const note = store.save({ title: 'Note', body: 'v1', spaceId: 'space', tags: ['projet'], pinned: true })
    const updated = store.save({ id: note.id, title: 'Note', body: 'v2', spaceId: 'space' })
    expect(updated.tags).toEqual(['projet'])
    expect(updated.pinned).toBe(true)
    expect(updated.body).toBe('v2')
    expect(store.get(note.id)?.pinned).toBe(true)
  })

  it('retrouve la note rattachée à une URL', () => {
    const store = new NotesStore(tempDir())
    store.save({ title: 'A', body: 'a', spaceId: 'space', url: 'https://example.org/a' })
    const latest = store.save({ title: 'B', body: 'b', spaceId: 'space', url: 'https://example.org/a' })
    expect(store.findByUrl('https://example.org/a')?.id).toBe(latest.id)
    expect(store.findByUrl('https://example.org/inconnu')).toBeNull()
  })

  it('relit un index hérité sans étiquettes ni épinglage', () => {
    const dir = tempDir()
    const notesDir = join(dir, 'notes')
    mkdirSync(notesDir, { recursive: true })
    writeFileSync(join(notesDir, 'ancienne-1234.md'), '# Ancienne\n\ncontenu', 'utf8')
    writeFileSync(
      join(notesDir, 'index.json'),
      JSON.stringify([
        { id: 'note-1', title: 'Ancienne', file: 'ancienne-1234.md', spaceId: 'space', updatedAt: 1 }
      ]),
      'utf8'
    )
    const store = new NotesStore(dir)
    expect(store.list()[0]).toMatchObject({ id: 'note-1', tags: [], pinned: false })
    expect(readFileSync(join(notesDir, 'ancienne-1234.md'), 'utf8')).toContain('Ancienne')
  })
})

describe('liens entre notes dans le stockage', () => {
  function linked(): { store: NotesStore; a: string; b: string; c: string } {
    const store = new NotesStore(tempDir())
    const c = store.save({ title: 'Sources', body: 'Rien encore.', spaceId: 'space' })
    const b = store.save({ title: 'Méthode', body: 'Voir [[Sources]] et [[Projet TFE|le projet]].', spaceId: 'space' })
    const a = store.save({ title: 'Projet TFE', body: 'La [[Méthode]] avant tout.', spaceId: 'space' })
    return { store, a: a.id, b: b.id, c: c.id }
  }

  it('met à jour les liens lors d’un renommage, et sait revenir en arrière', () => {
    const { store, a, b } = linked()
    const renamed = store.rename(a, 'Projet de mémoire')
    expect(renamed?.previous).toBe('Projet TFE')
    expect(renamed?.updated).toBe(1)
    expect(store.get(b)?.body).toBe('Voir [[Sources]] et [[Projet de mémoire|le projet]].')

    store.rename(a, 'Projet TFE')
    expect(store.get(b)?.body).toBe('Voir [[Sources]] et [[Projet TFE|le projet]].')
  })

  it('gère un cycle A → B → A sans lien cassé', () => {
    const { store, a, b } = linked()
    store.save({ id: b, title: 'Méthode et outils', body: store.get(b)?.body ?? '', spaceId: 'space' })
    expect(store.get(a)?.body).toBe('La [[Méthode et outils]] avant tout.')
    store.save({ id: b, title: 'Méthode', body: store.get(b)?.body ?? '', spaceId: 'space' })
    expect(store.get(a)?.body).toBe('La [[Méthode]] avant tout.')
    expect(store.graph(a).outgoing.map((ref) => ref.title)).toEqual(['Méthode'])
    expect(store.graph(b).incoming.map((ref) => ref.title)).toEqual(['Projet TFE'])
  })

  it('signale un titre cité qui n’existe pas', () => {
    const { store, c } = linked()
    store.save({ id: c, title: 'Sources', body: 'Voir [[Note disparue]].', spaceId: 'space' })
    expect(store.graph(c).missing).toEqual(['Note disparue'])
  })

  it('renommer n’abîme pas les notes qui ne citent rien', () => {
    const { store, c } = linked()
    const before = store.get(c)?.body
    store.rename(store.list().find((note) => note.title === 'Méthode')?.id ?? '', 'Autre titre')
    expect(store.get(c)?.body).toBe(before)
  })

  it('liste les enregistrements vocaux cités par les notes', () => {
    const store = new NotesStore(tempDir())
    store.save({
      title: 'Note vocale',
      body: '![Note vocale 0:12](vela-audio:space-1/abcd1234.webm)',
      spaceId: 'space-1'
    })
    expect([...store.audioNames()]).toEqual(['space-1/abcd1234.webm'])
  })
})

describe('HighlightsStore', () => {
  it('ajoute un surlignage une seule fois et le range par page', () => {
    const store = new HighlightsStore(tempDir())
    const first = store.add({ url: 'https://example.org/a', title: 'A', text: 'passage clé' })
    const again = store.add({ url: 'https://example.org/a', title: 'A', text: 'passage clé' })
    store.add({ url: 'https://example.org/b', title: 'B', text: 'autre page' })
    expect(again.id).toBe(first.id)
    expect(store.list('https://example.org/a')).toHaveLength(1)
    expect(store.list('https://example.org/b')).toHaveLength(1)
    store.remove(first.id)
    expect(store.list('https://example.org/a')).toHaveLength(0)
  })
})
