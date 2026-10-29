import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { HighlightsStore, NotesStore, normalizeTags } from './notes'
import { NoteAudioStore } from './noteAudio'

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

describe('protection des notes et enregistrements', () => {
  it('conserve les enregistrements et bloque les écritures si l’index est corrompu', () => {
    const dir = tempDir()
    const audio = new NoteAudioStore(dir)
    const saved = audio.save('space-1', `data:audio/webm;base64,${Buffer.from('audio').toString('base64')}`)
    const index = join(dir, 'notes', 'index.json')
    writeFileSync(index, '{ invalide', 'utf8')
    const notes = new NotesStore(dir)
    notes.prune()
    if (notes.canReadIndex) audio.prune(notes.audioNames())
    expect(notes.canReadIndex).toBe(false)
    expect(saved && audio.read(saved.name)).toBeTruthy()
    expect(() => notes.save({ title: 'Nouvelle', body: '', spaceId: 'space-1' })).toThrow(/illisible/)
    expect(readFileSync(index, 'utf8')).toBe('{ invalide')
  })

  it('ne considère pas un index absent comme neuf si des notes existent', () => {
    const dir = tempDir()
    mkdirSync(join(dir, 'notes'), { recursive: true })
    writeFileSync(join(dir, 'notes', 'ancienne.md'), 'Contenu conservé', 'utf8')
    const notes = new NotesStore(dir)
    expect(notes.canReadIndex).toBe(false)
    expect(() => notes.save({ title: 'Nouvelle', body: '', spaceId: 'space' })).toThrow(/illisible/)
  })

  it('ne purge pas les références si le corps d’une note est absent', () => {
    const dir = tempDir()
    const notes = new NotesStore(dir)
    const saved = notes.save({ title: 'Note', body: 'texte', spaceId: 'space' })
    rmSync(join(dir, 'notes', `note-${saved.id.slice(0, 8)}.md`))
    notes.prune()
    expect(notes.canReadIndex).toBe(false)
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

  /** Chemin du .md d'une note, lu dans l'index plutôt que deviné. */
  function fileOf(store: NotesStore, title: string): string {
    const index = JSON.parse(readFileSync(join(store.dir, 'index.json'), 'utf8')) as {
      title: string
      file: string
    }[]
    return join(store.dir, index.find((entry) => entry.title === title)?.file ?? '')
  }

  it('écrit la note et l’index avant de toucher aux notes liées', () => {
    const { store, a, b } = linked()
    const renamed = store.rename(a, 'Projet de mémoire')
    expect(renamed?.updated).toBe(1)
    expect(renamed?.note.linksFailed ?? 0).toBe(0)
    // Le fichier renommé et l'index sont à jour, et le lien a suivi.
    expect(existsSync(fileOf(store, 'Projet de mémoire'))).toBe(true)
    expect(store.get(b)?.body).toContain('[[Projet de mémoire|le projet]]')
  })

  it.skipIf(process.getuid?.() === 0)('garde le renommage quand une note liée refuse l’écriture', () => {
    const { store, a, b } = linked()
    const linkedFile = fileOf(store, 'Méthode')
    const before = readFileSync(linkedFile, 'utf8')
    chmodSync(linkedFile, 0o444)
    try {
      const renamed = store.rename(a, 'Projet de mémoire')
      expect(renamed?.note.title).toBe('Projet de mémoire')
      expect(renamed?.note.linksUpdated ?? 0).toBe(0)
      expect(renamed?.note.linksFailed).toBe(1)
      expect(store.get(b)?.body).toBe(before)
      expect(store.list().some((note) => note.title === 'Projet de mémoire')).toBe(true)
    } finally {
      chmodSync(linkedFile, 0o644)
    }
  })

  it.skipIf(process.getuid?.() === 0)('remet le fichier en place si l’index ne peut pas être écrit', () => {
    const { store, a } = linked()
    const before = fileOf(store, 'Projet TFE')
    chmodSync(store.dir, 0o555)
    try {
      expect(() => store.rename(a, 'Projet de mémoire')).toThrow()
    } finally {
      chmodSync(store.dir, 0o755)
    }
    expect(existsSync(before)).toBe(true)
    expect(store.get(a)?.title).toBe('Projet TFE')
    expect(store.get(a)?.body).toContain('[[Méthode]]')
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
