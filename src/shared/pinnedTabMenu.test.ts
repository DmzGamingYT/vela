import { describe, expect, it } from 'vitest'
import { canSleep, canToggleSound, pinnedNeighbour, pinnedTitle } from './pinnedTabMenu'

describe('menu d’un onglet épinglé', () => {
  it('nettoie le compteur de notifications du titre', () => {
    expect(pinnedTitle('(1115) Gmail', 'mail.exemple')).toBe('Gmail')
    expect(pinnedTitle('  Journal  ', 'journal.exemple')).toBe('Journal')
  })

  it('retombe sur le domaine quand le titre est vide', () => {
    expect(pinnedTitle('', 'journal.exemple')).toBe('journal.exemple')
    expect(pinnedTitle('   ', '  ')).toBe('Page')
  })

  it('n’offre le son que si la page en émet ou est coupée', () => {
    expect(canToggleSound({ audible: true, muted: false })).toBe(true)
    expect(canToggleSound({ audible: false, muted: true })).toBe(true)
    expect(canToggleSound({ audible: false, muted: false })).toBe(false)
  })

  it('n’offre la veille que si la page est encore chargée', () => {
    expect(canSleep({ asleep: false })).toBe(true)
    expect(canSleep({ asleep: true })).toBe(false)
  })

  it('masque les déplacements aux extrémités', () => {
    const ids = ['a', 'b', 'c']
    expect(pinnedNeighbour(ids, 'a', -1)).toBeNull()
    expect(pinnedNeighbour(ids, 'a', 1)).toBe('b')
    expect(pinnedNeighbour(ids, 'c', 1)).toBeNull()
    expect(pinnedNeighbour(ids, 'c', -1)).toBe('b')
    expect(pinnedNeighbour(ids, 'absent', 1)).toBeNull()
  })
})
