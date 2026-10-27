import { describe, expect, it } from 'vitest'
import { migrateBookmarkOrder, moveBookmark, orderBookmarks, reorderBookmarks } from './bookmarkOrder'
import type { Bookmark } from './types'

function bookmark(id: string, order = 0): Bookmark {
  return {
    id,
    url: `https://${id}.example/page`,
    title: id,
    createdAt: 1_700_000_000_000,
    order
  }
}

/** Fichier de la 0.3.7 : les favoris, sans aucun champ d'ordre. */
function file037() {
  return {
    version: 1,
    spaces: [{ id: 'space-1', name: 'Personnel' }],
    bookmarks: [
      { id: 'c', url: 'https://c.example', title: 'C', createdAt: 3 },
      { id: 'a', url: 'https://a.example', title: 'A', createdAt: 1 },
      { id: 'b', url: 'https://b.example', title: 'B', createdAt: 2 }
    ]
  }
}

describe('migration de l’ordre des favoris', () => {
  it('numérote selon l’ordre actuel du fichier 0.3.7', () => {
    const raw = file037()
    const result = migrateBookmarkOrder(raw)
    expect(result.changed).toBe(true)
    const bookmarks = (result.state as { bookmarks: { id: string; order: number }[] }).bookmarks
    expect(bookmarks.map((entry) => entry.id)).toEqual(['c', 'a', 'b'])
    expect(bookmarks.map((entry) => entry.order)).toEqual([0, 1, 2])
    expect(result.journal.join(' ')).toMatch(/3 entrées/)
  })

  it('ne touche pas au reste du fichier', () => {
    const raw = file037()
    const state = migrateBookmarkOrder(raw).state as {
      version: number
      spaces: { id: string }[]
    }
    expect(state.version).toBe(1)
    expect(state.spaces).toEqual(raw.spaces)
    expect(raw.bookmarks[0]).not.toHaveProperty('order')
  })

  it('est idempotente : deuxième passage sans changement', () => {
    const first = migrateBookmarkOrder(file037())
    const second = migrateBookmarkOrder(first.state)
    expect(second.changed).toBe(false)
    expect(second.state).toBe(first.state)
    expect(second.journal).toEqual([])
  })

  it('respecte un ordre déjà complet mais trie le tableau', () => {
    const raw = {
      bookmarks: [
        { id: 'b', url: 'https://b.example', order: 1 },
        { id: 'a', url: 'https://a.example', order: 0 }
      ]
    }
    const state = migrateBookmarkOrder(raw).state as { bookmarks: { id: string; order: number }[] }
    expect(state.bookmarks.map((entry) => entry.id)).toEqual(['a', 'b'])
    expect(state.bookmarks.map((entry) => entry.order)).toEqual([0, 1])
  })

  it('referme doublons et trous sans perdre de favori', () => {
    const raw = {
      bookmarks: [
        { id: 'a', url: 'https://a.example', order: 4 },
        { id: 'b', url: 'https://b.example', order: 4 },
        { id: 'c', url: 'https://c.example', order: 9 }
      ]
    }
    const state = migrateBookmarkOrder(raw).state as { bookmarks: { id: string; order: number }[] }
    expect(state.bookmarks.map((entry) => entry.id)).toEqual(['a', 'b', 'c'])
    expect(state.bookmarks.map((entry) => entry.order)).toEqual([0, 1, 2])
  })

  it('reprend un fichier partiellement migré', () => {
    const raw = {
      bookmarks: [
        { id: 'a', url: 'https://a.example', order: 0 },
        { id: 'b', url: 'https://b.example' },
        { id: 'c', url: 'https://c.example', order: 7 }
      ]
    }
    const state = migrateBookmarkOrder(raw).state as { bookmarks: { id: string; order: number }[] }
    expect(state.bookmarks.map((entry) => entry.id)).toEqual(['a', 'b', 'c'])
    expect(state.bookmarks.map((entry) => entry.order)).toEqual([0, 1, 2])
  })

  it('ignore les entrées sans identifiant ou sans adresse, en le disant', () => {
    const raw = {
      bookmarks: [
        { id: 'a', url: 'https://a.example' },
        { url: 'https://orpheline.example' },
        { id: 'b' }
      ]
    }
    const result = migrateBookmarkOrder(raw)
    const state = result.state as { bookmarks: { id: string; order: number }[] }
    expect(state.bookmarks.map((entry) => entry.id)).toEqual(['a'])
    expect(result.journal.join(' ')).toMatch(/2 entrées de favori ignorées/)
  })

  it('ne casse rien sur un fichier corrompu ou sans favoris', () => {
    expect(migrateBookmarkOrder(null)).toEqual({ changed: false, state: null, journal: [] })
    expect(migrateBookmarkOrder('pas un objet').changed).toBe(false)
    expect(migrateBookmarkOrder({ bookmarks: 'liste' }).changed).toBe(false)
    const empty = { bookmarks: [] }
    expect(migrateBookmarkOrder(empty).changed).toBe(false)
    expect(migrateBookmarkOrder(empty).state).toBe(empty)
  })
})

describe('déplacement d’un favori', () => {
  const list = [bookmark('a', 0), bookmark('b', 1), bookmark('c', 2), bookmark('d', 3)]

  it('déplace et renumérote', () => {
    const next = moveBookmark(list, 'a', 2)
    expect(next?.map((entry) => entry.id)).toEqual(['b', 'c', 'a', 'd'])
    expect(next?.map((entry) => entry.order)).toEqual([0, 1, 2, 3])
  })

  it('laisse la liste intacte quand la position est déjà la bonne', () => {
    expect(moveBookmark(list, 'b', 1)).toBe(list)
  })

  it('refuse les positions hors limites', () => {
    expect(moveBookmark(list, 'a', 4)).toBeNull()
    expect(moveBookmark(list, 'a', -1)).toBeNull()
    expect(moveBookmark(list, 'a', 1.5)).toBeNull()
    expect(moveBookmark(list, 'a', Number.NaN)).toBeNull()
  })

  it('refuse un favori inconnu', () => {
    expect(moveBookmark(list, 'zzz', 1)).toBeNull()
  })

  it('ne modifie pas la liste d’origine', () => {
    moveBookmark(list, 'a', 3)
    expect(list.map((entry) => entry.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('permutation complète', () => {
  const list = [bookmark('a', 0), bookmark('b', 1), bookmark('c', 2)]

  it('applique une permutation valide', () => {
    const next = reorderBookmarks(list, ['c', 'a', 'b'])
    expect(next?.map((entry) => entry.id)).toEqual(['c', 'a', 'b'])
    expect(next?.map((entry) => entry.order)).toEqual([0, 1, 2])
  })

  it('refuse un doublon, un inconnu ou un favori manquant', () => {
    expect(reorderBookmarks(list, ['a', 'a', 'b'])).toBeNull()
    expect(reorderBookmarks(list, ['a', 'b', 'zzz'])).toBeNull()
    expect(reorderBookmarks(list, ['a', 'b'])).toBeNull()
  })
})

describe('remise en ordre d’une liste', () => {
  it('trie par numéro, sans numéro en fin, puis referme les trous', () => {
    const list = [bookmark('a', 8), { ...bookmark('b'), order: undefined as unknown as number }, bookmark('c', 2)]
    expect(orderBookmarks(list).map((entry) => entry.id)).toEqual(['c', 'a', 'b'])
    expect(orderBookmarks(list).map((entry) => entry.order)).toEqual([0, 1, 2])
  })
})
