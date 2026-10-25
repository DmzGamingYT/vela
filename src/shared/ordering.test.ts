import { describe, expect, it } from 'vitest'
import { moveTab } from './ordering'
import type { TabState } from './types'

function tab(id: string, patch: Partial<TabState> = {}): TabState {
  return {
    id,
    spaceId: 's1',
    url: 'https://exemple.fr',
    title: id,
    pinned: false,
    createdAt: 0,
    lastActiveAt: 0,
    ...patch
  }
}

const ids = (tabs: TabState[]): string[] => tabs.map((item) => item.id)

describe('moveTab', () => {
  it('place un onglet avant sa cible', () => {
    const tabs = [tab('a'), tab('b'), tab('c')]
    expect(ids(moveTab(tabs, { id: 'c', targetId: 'a', position: 'before' }))).toEqual(['c', 'a', 'b'])
  })

  it('place un onglet après sa cible', () => {
    const tabs = [tab('a'), tab('b'), tab('c')]
    expect(ids(moveTab(tabs, { id: 'a', targetId: 'b', position: 'after' }))).toEqual(['b', 'a', 'c'])
  })

  it('refuse de mélanger espaces ou épinglés', () => {
    const tabs = [tab('a'), tab('b', { spaceId: 's2' }), tab('c', { pinned: true })]
    expect(moveTab(tabs, { id: 'a', targetId: 'b', position: 'before' })).toBe(tabs)
    expect(moveTab(tabs, { id: 'a', targetId: 'c', position: 'before' })).toBe(tabs)
  })

  it('rejoint un dossier et passe en fin de liste', () => {
    const tabs = [tab('a'), tab('b'), tab('c', { spaceId: 's2' })]
    const moved = moveTab(tabs, { id: 'a', groupId: 'g1' })
    expect(ids(moved)).toEqual(['b', 'a', 'c'])
    expect(moved.find((item) => item.id === 'a')?.groupId).toBe('g1')
  })

  it('sort d’un dossier', () => {
    const tabs = [tab('a', { groupId: 'g1' }), tab('b')]
    const moved = moveTab(tabs, { id: 'a', groupId: null })
    expect(moved.find((item) => item.id === 'a')?.groupId).toBeNull()
  })

  it('hérite du dossier de la cible', () => {
    const tabs = [tab('a'), tab('b', { groupId: 'g1' })]
    const moved = moveTab(tabs, { id: 'a', targetId: 'b', position: 'before' })
    expect(moved[0].groupId).toBe('g1')
    expect(ids(moved)).toEqual(['a', 'b'])
  })

  it('détache un onglet épinglé de tout dossier', () => {
    const tabs = [tab('a', { pinned: true, groupId: 'g1' }), tab('b', { pinned: true })]
    const moved = moveTab(tabs, { id: 'a', targetId: 'b', position: 'after' })
    expect(moved.find((item) => item.id === 'a')?.groupId).toBeNull()
  })
})
