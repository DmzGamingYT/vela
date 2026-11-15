/** Sept jours, du plus ancien au plus récent, minuit à minuit. */
export const ACTIVITY_DAYS = 7

const DAY = 86_400_000

interface Visit {
  visitedAt: number
  spaceId?: string
}

/**
 * Visites par jour d'un profil sur les sept derniers jours, aujourd'hui
 * compris. `spaceId` vide compte tous les profils ; une visite dans le futur
 * (horloge qui recule) est ignorée plutôt que rangée au hasard.
 */
export function weeklyActivity(
  history: readonly Visit[],
  spaceId: string | null,
  now = Date.now()
): number[] {
  const counts = new Array<number>(ACTIVITY_DAYS).fill(0)
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  const start = midnight.getTime() - (ACTIVITY_DAYS - 1) * DAY
  for (const visit of history) {
    if (spaceId && visit.spaceId !== spaceId) continue
    if (visit.visitedAt < start || visit.visitedAt > now + DAY) continue
    const index = Math.floor((visit.visitedAt - start) / DAY)
    if (index >= 0 && index < ACTIVITY_DAYS) counts[index] += 1
  }
  return counts
}

/** Étiquettes courtes des sept jours, du plus ancien au plus récent. */
export function weekdayInitials(now = Date.now()): string[] {
  const names = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
  const labels: string[] = []
  for (let offset = ACTIVITY_DAYS - 1; offset >= 0; offset -= 1) {
    const date = new Date(now - offset * DAY)
    labels.push(names[date.getDay()])
  }
  return labels
}
