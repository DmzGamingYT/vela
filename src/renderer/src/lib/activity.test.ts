import { describe, expect, it } from 'vitest'
import { ACTIVITY_DAYS, weekdayInitials, weeklyActivity } from './activity'

const DAY = 86_400_000
// Un dimanche à midi, heure locale : la journée en cours est le dernier point.
const NOW = new Date(2026, 10, 15, 12, 0, 0).getTime()

describe('weeklyActivity', () => {
  it('range les visites du plus ancien au plus récent, aujourd’hui compris', () => {
    const counts = weeklyActivity(
      [{ visitedAt: NOW }, { visitedAt: NOW - DAY }, { visitedAt: NOW - DAY }],
      null,
      NOW
    )
    expect(counts).toHaveLength(ACTIVITY_DAYS)
    expect(counts[ACTIVITY_DAYS - 1]).toBe(1)
    expect(counts[ACTIVITY_DAYS - 2]).toBe(2)
  })

  it('ne compte que le profil demandé', () => {
    const counts = weeklyActivity(
      [
        { visitedAt: NOW, spaceId: 'a' },
        { visitedAt: NOW, spaceId: 'b' },
        { visitedAt: NOW - DAY, spaceId: 'a' }
      ],
      'a',
      NOW
    )
    expect(counts.reduce((total, value) => total + value, 0)).toBe(2)
  })

  it('ignore ce qui sort des sept jours', () => {
    const counts = weeklyActivity(
      [{ visitedAt: NOW - 9 * DAY }, { visitedAt: NOW + 2 * DAY }],
      null,
      NOW
    )
    expect(counts.every((value) => value === 0)).toBe(true)
  })
})

describe('weekdayInitials', () => {
  it('donne sept initiales qui finissent par le jour courant', () => {
    const labels = weekdayInitials(NOW)
    expect(labels).toHaveLength(ACTIVITY_DAYS)
    expect(labels[labels.length - 1]).toBe('D')
    expect(labels.join('')).toMatch(/^[DLMJVSD]{7}$/)
  })
})
