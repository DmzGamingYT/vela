import { describe, expect, it } from 'vitest'
import {
  audioRefs,
  audioToken,
  completeLink,
  findNoteByTitle,
  linkQueryAt,
  noteGraph,
  removeAudioToken,
  rewriteWikiTargets,
  suggestNotes,
  wikiLinks,
  wikiTargets
} from './noteLinks'

const notes = [
  { id: 'a', title: 'Projet TFE', body: 'Voir [[Méthode]] et [[Sources|les sources]].' },
  { id: 'b', title: 'Méthode', body: 'Retour au [[projet tfe]].' },
  { id: 'c', title: 'Sources', body: 'Aucun lien.' }
]

describe('liens entre notes', () => {
  it('lit les liens, avec ou sans alias', () => {
    const links = wikiLinks('Voir [[Projet TFE]] et [[Sources|les sources]].')
    expect(links.map((link) => link.target)).toEqual(['Projet TFE', 'Sources'])
    expect(links[1].alias).toBe('les sources')
    expect(wikiLinks('Rien ici')).toEqual([])
  })

  it('déduplique les titres cités, casse et accents ignorés', () => {
    expect(wikiTargets('[[Été]] [[ete]] [[Autre]]')).toEqual(['Été', 'Autre'])
  })

  it('retrouve une note par son titre, sans tenir compte de la casse', () => {
    expect(findNoteByTitle(notes, '  projet tfe ')?.id).toBe('a')
    expect(findNoteByTitle(notes, 'inconnue')).toBeNull()
  })

  it('réécrit les liens lors d’un renommage, alias conservé', () => {
    const result = rewriteWikiTargets('[[Méthode]] et [[méthode|la méthode]]', 'Méthode', 'Méthode 2026')
    expect(result.count).toBe(2)
    expect(result.body).toBe('[[Méthode 2026]] et [[Méthode 2026|la méthode]]')
  })

  it('ne boucle pas sur un cycle A → B → A', () => {
    const bodies = new Map([
      ['a', 'Voir [[B]].'],
      ['b', 'Voir [[A]] et [[B|lui-même]].']
    ])
    const rename = (from: string, to: string): void => {
      for (const [id, body] of bodies) bodies.set(id, rewriteWikiTargets(body, from, to).body)
    }
    rename('A', 'A2')
    expect(bodies.get('b')).toBe('Voir [[A2]] et [[B|lui-même]].')
    rename('A2', 'A')
    expect(bodies.get('b')).toBe('Voir [[A]] et [[B|lui-même]].')
    // Le retour est complet, sans doublon ni lien imbriqué.
    expect(bodies.get('a')).toBe('Voir [[B]].')
  })

  it('ne touche pas un titre partiel, ni un lien déjà à jour', () => {
    expect(rewriteWikiTargets('[[Méthodes]]', 'Méthode', 'Autre').count).toBe(0)
    expect(rewriteWikiTargets('[[Méthode]]', 'Méthode', 'Méthode').count).toBe(0)
    expect(rewriteWikiTargets('[[Méthode]]', 'Méthode', '   ').count).toBe(0)
  })

  it('calcule les liens sortants, entrants et cassés', () => {
    const graph = noteGraph(notes, 'a')
    expect(graph.outgoing.map((ref) => ref.id)).toEqual(['b', 'c'])
    expect(graph.incoming.map((ref) => ref.id)).toEqual(['b'])
    expect(graph.missing).toEqual([])

    const withMissing = noteGraph([...notes, { id: 'd', title: 'Idées', body: 'Voir [[Note absente]].' }], 'd')
    expect(withMissing.missing).toEqual(['Note absente'])
  })

  it('trouve le lien en cours de frappe et le complète', () => {
    const body = 'Une idée : [[Mét'
    const query = linkQueryAt(body, body.length)
    expect(query).toEqual({ start: 11, query: 'Mét' })
    const done = completeLink(body, body.length, 'Méthode')
    expect(done.body).toBe('Une idée : [[Méthode]]')
    expect(done.caret).toBe(done.body.length)

    expect(linkQueryAt('déjà [[fermé]] ici', 20)).toBeNull()
    expect(linkQueryAt('un crochet [ seul', 17)).toBeNull()
    expect(linkQueryAt('deux lignes [[ou\n', 17)).toBeNull()
  })

  it('insère un lien vide sans frappe en cours', () => {
    const result = completeLink('Texte ', 6, 'Projet TFE')
    expect(result.body).toBe('Texte [[Projet TFE]]')
  })

  it('propose d’abord les titres qui commencent par la frappe', () => {
    const list = [
      { id: '1', title: 'Méthode' },
      { id: '2', title: 'Méthodologie' },
      { id: '3', title: 'Ancienne méthode' },
      { id: '4', title: 'Sources' }
    ]
    expect(suggestNotes(list, 'meth').map((note) => note.id)).toEqual(['1', '2', '3'])
    expect(suggestNotes(list, '', '1').map((note) => note.id)).toEqual(['2', '3', '4'])
    expect(suggestNotes(list, 'zzz')).toEqual([])
  })

  it('repère les enregistrements cités par une note', () => {
    const token = audioToken('projet-tfe/abc123.webm', 72)
    expect(token).toBe('![Note vocale 1:12](vela-audio:projet-tfe/abc123.webm)')
    expect(audioRefs(`Texte\n${token}\n${token}`)).toEqual(['projet-tfe/abc123.webm'])
    expect(audioRefs('aucun')).toEqual([])
    expect(removeAudioToken(`Avant\n\n${token}\n\nAprès`, 'projet-tfe/abc123.webm')).toBe('Avant\n\nAprès')
    expect(removeAudioToken('Rien', 'projet-tfe/abc123.webm')).toBe('Rien')
  })
})
