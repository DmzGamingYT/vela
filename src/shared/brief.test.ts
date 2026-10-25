import { describe, expect, it } from 'vitest'
import { buildBrief, dateLabel } from './brief'
import { createTab } from './defaults'
import type { HistoryEntry, TabState } from './types'

const NOW = new Date('2026-10-25T09:00:00').getTime()
const HOUR = 3_600_000

function entry(url: string, title: string, visitedAt: number): HistoryEntry {
  return { id: url + visitedAt, url, title, visitedAt, spaceId: 's1' }
}

function tab(url: string, title: string, lastActiveAt: number): TabState {
  return { ...createTab('s1', NOW, { url, title }), lastActiveAt }
}

describe('buildBrief', () => {
  it('fournit trois cartes même sans historique', () => {
    const brief = buildBrief({ tabs: [], history: [], now: NOW, blocked: 0 })
    expect(brief.items).toHaveLength(3)
    expect(brief.pages).toBe(0)
    expect(brief.items.every((item) => item.kind === 'start')).toBe(true)
    expect(brief.dateLabel).toBe(dateLabel(NOW))
  })

  it('reprend la dernière page d’hier', () => {
    const brief = buildBrief({
      tabs: [tab('https://www.notion.so/a', 'Notion — Plan', NOW - HOUR)],
      history: [
        entry('https://github.com/pull/12', 'Fix sidebar', NOW - 2 * HOUR),
        entry('https://www.notion.so/a', 'Notion — Plan', NOW - 26 * HOUR)
      ],
      now: NOW,
      blocked: 4
    })
    expect(brief.items[0]).toMatchObject({ kind: 'resume', title: 'Notion — Plan' })
    expect(brief.items[0].detail).toContain('hier')
    expect(brief.blocked).toBe(4)
    expect(brief.sites).toBe(2)
    expect(brief.pages).toBe(2)
  })

  it('signale l’onglet ouvert depuis le plus longtemps', () => {
    const brief = buildBrief({
      tabs: [
        tab('https://a.fr', 'A', NOW - HOUR),
        tab('https://b.fr', 'B', NOW - 50 * HOUR),
        tab('https://c.fr', 'C', NOW - 5 * HOUR)
      ],
      history: [],
      now: NOW,
      blocked: 0
    })
    expect(brief.items[1]).toMatchObject({ kind: 'finish', title: 'B' })
    expect(brief.items[1].detail).toContain('2 j')
  })

  it('ignore les moteurs de recherche dans le focus', () => {
    const brief = buildBrief({
      tabs: [],
      history: [
        entry('https://duckduckgo.com/?q=vela', 'vela at DuckDuckGo', NOW - HOUR),
        entry('https://duckduckgo.com/?q=arc', 'arc at DuckDuckGo', NOW - 2 * HOUR)
      ],
      now: NOW,
      blocked: 0
    })
    expect(brief.items[2].kind).toBe('start')
    expect(brief.items[2].title).toContain('rapport')
  })

  it('met en avant le domaine le plus visité de la semaine', () => {
    const brief = buildBrief({
      tabs: [],
      history: [
        entry('https://www.lemonde.fr/a', 'A', NOW - HOUR),
        entry('https://lemonde.fr/b', 'B', NOW - 2 * HOUR),
        entry('https://github.com/x', 'X', NOW - 3 * HOUR)
      ],
      now: NOW,
      blocked: 2
    })
    expect(brief.items[2]).toMatchObject({ kind: 'focus', title: 'lemonde.fr' })
    expect(brief.items[2].detail).toContain('2 visites')
  })
})
