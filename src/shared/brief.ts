import type { Brief, BriefItem, HistoryEntry, TabState } from './types'
import { hostOf, isHomeUrl } from './url'

const DAY = 86_400_000

export function dateLabel(now: number): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(new Date(now))
}

function startOfDay(now: number): number {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function relativeDay(timestamp: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(timestamp)) / DAY)
  if (days <= 0) return "aujourd'hui"
  if (days === 1) return 'hier'
  if (days < 7) return `il y a ${days} jours`
  return `il y a ${Math.floor(days / 7)} sem.`
}

function openFor(timestamp: number, now: number): string {
  const hours = Math.floor((now - timestamp) / 3_600_000)
  if (hours < 1) return "ouvert à l'instant"
  if (hours < 24) return `ouvert depuis ${hours} h`
  return `ouvert depuis ${Math.floor(hours / 24)} j`
}

const SEARCH_HOSTS = new Set(['duckduckgo.com', 'google.com', 'search.brave.com', 'bing.com'])

function topDomain(history: HistoryEntry[]): { host: string; count: number } | null {
  const counts = new Map<string, number>()
  for (const entry of history) {
    const host = hostOf(entry.url)
    if (!host || SEARCH_HOSTS.has(host)) continue
    counts.set(host, (counts.get(host) ?? 0) + 1)
  }
  let best: { host: string; count: number } | null = null
  for (const [host, count] of counts) {
    if (!best || count > best.count) best = { host, count }
  }
  return best
}

/**
 * Brief local : aucune requête réseau, uniquement l'historique et les onglets.
 * Trois cartes, toujours remplies — même au premier lancement.
 */
export function buildBrief(input: {
  tabs: TabState[]
  history: HistoryEntry[]
  now: number
  blocked: number
}): Brief {
  const { tabs, history, now, blocked } = input
  const recent = history.filter((entry) => entry.visitedAt <= now).slice().sort((a, b) => b.visitedAt - a.visitedAt)
  const dayStart = startOfDay(now)
  const weekStart = now - 7 * DAY
  const week = recent.filter((entry) => entry.visitedAt >= weekStart)
  const openTabs = tabs.filter((tab) => !isHomeUrl(tab.url))
  const items: BriefItem[] = []

  const earlier = recent.find((entry) => entry.visitedAt < dayStart && !isHomeUrl(entry.url))
  const resume = earlier ?? recent.find((entry) => !isHomeUrl(entry.url))
  if (resume) {
    items.push({
      kind: 'resume',
      label: earlier ? 'Reprendre' : 'Continuer',
      title: resume.title || hostOf(resume.url),
      detail: `${relativeDay(resume.visitedAt, now)} · ${hostOf(resume.url)}`,
      url: resume.url
    })
  } else {
    items.push({
      kind: 'start',
      label: 'Démarrer',
      title: 'Prenez vos marques',
      detail: '⌘K ouvre la barre de commande — onglets, actions, agent.'
    })
  }

  const finish = openTabs
    .filter((tab) => tab.id !== openTabs[0]?.id)
    .slice()
    .sort((a, b) => a.lastActiveAt - b.lastActiveAt)[0]
  if (finish) {
    items.push({
      kind: 'finish',
      label: 'À finir',
      title: finish.title || hostOf(finish.url),
      detail: `${openFor(finish.lastActiveAt, now)} · ${hostOf(finish.url)}`,
      tabId: finish.id,
      url: finish.url
    })
  } else {
    items.push({
      kind: 'start',
      label: 'Organiser',
      title: 'Un espace par contexte',
      detail: 'Travail, veille, personnel : cookies et sessions isolés.'
    })
  }

  const domain = topDomain(week)
  if (domain) {
    items.push({
      kind: 'focus',
      label: 'Focus',
      title: domain.host,
      detail: `${domain.count} visite${domain.count > 1 ? 's' : ''} · 7 derniers jours`,
      url: `https://${domain.host}`
    })
  } else {
    items.push({
      kind: 'start',
      label: 'Déléguer',
      title: 'Un rapport, pas dix onglets',
      detail: 'Ouvrez l’agent et transformez vos pages en synthèse.'
    })
  }

  const sites = new Set(week.map((entry) => hostOf(entry.url)).filter(Boolean))

  return {
    items: items.slice(0, 3),
    pages: week.length,
    sites: sites.size,
    blocked,
    dateLabel: dateLabel(now)
  }
}
