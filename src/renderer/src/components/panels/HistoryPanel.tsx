import { useEffect, useState } from 'react'
import type { HistoryEntry } from '@shared/types'
import { hostOf } from '@shared/url'
import { shortDate, timeAgo } from '../../lib/format'
import { useModalFocus } from '../../lib/useModalFocus'
import { useBrowser } from '../../store/browser'
import Favicon from '../Favicon'
import { Icon } from '../Icon'

type Period = 'all' | 'today' | 'week' | 'month'

const PERIODS: { id: Period; label: string }[] = [
  { id: 'all', label: 'Tout' },
  { id: 'today', label: 'Aujourd’hui' },
  { id: 'week', label: '7 jours' },
  { id: 'month', label: '30 jours' }
]

const DAY = 86_400_000

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function periodStart(period: Period, now: number): number {
  if (period === 'today') return startOfDay(now)
  if (period === 'week') return startOfDay(now) - 6 * DAY
  if (period === 'month') return startOfDay(now) - 29 * DAY
  return 0
}

function dayLabel(timestamp: number, now: number): string {
  const date = new Date(timestamp)
  const today = new Date(now)
  const yesterday = new Date(now)
  yesterday.setDate(today.getDate() - 1)
  const same = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  if (same(date, today)) return 'Aujourd’hui'
  if (same(date, yesterday)) return 'Hier'
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(date)
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count > 1 ? plural : singular}`
}

export default function HistoryPanel() {
  const setOverlay = useBrowser((s) => s.setOverlay)
  const newTab = useBrowser((s) => s.newTab)
  const removeHistory = useBrowser((s) => s.removeHistory)
  const sheetRef = useModalFocus<HTMLDivElement>()
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [query, setQuery] = useState('')
  const [period, setPeriod] = useState<Period>('all')
  const [now] = useState(() => Date.now())

  useEffect(() => {
    let alive = true
    void window.vela.history
      .list()
      .then((list) => {
        if (alive) setEntries(list)
      })
      .catch(() => {
        if (alive) setEntries([])
      })
    return () => {
      alive = false
    }
  }, [])

  const rows = entries ?? []
  const counts: Record<Period, number> = {
    all: rows.length,
    today: rows.filter((entry) => entry.visitedAt >= periodStart('today', now)).length,
    week: rows.filter((entry) => entry.visitedAt >= periodStart('week', now)).length,
    month: rows.filter((entry) => entry.visitedAt >= periodStart('month', now)).length
  }
  const needle = query.trim().toLowerCase()
  const from = periodStart(period, now)
  const filtered = rows.filter((entry) => {
    if (period !== 'all' && entry.visitedAt < from) return false
    if (!needle) return true
    const host = hostOf(entry.url)
    return `${entry.title}\n${entry.url}\n${host}`.toLowerCase().includes(needle)
  })
  const sites = new Set(filtered.map((entry) => hostOf(entry.url))).size
  const days = new Map<string, HistoryEntry[]>()
  for (const entry of filtered) {
    const key = dayLabel(entry.visitedAt, now)
    const bucket = days.get(key)
    if (bucket) bucket.push(entry)
    else days.set(key, [entry])
  }

  const remove = async (url: string): Promise<void> => {
    setEntries((current) => (current ? current.filter((item) => item.url !== url) : current))
    await removeHistory(url)
  }

  const clearAll = (): void => {
    void window.vela.history
      .clear()
      .then(() => setEntries([]))
      .catch(() => undefined)
  }

  const resetFilters = (): void => {
    setQuery('')
    setPeriod('all')
  }

  return (
    <div className="overlay" onMouseDown={() => setOverlay(null)}>
      <div
        ref={sheetRef}
        className="sheet history-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Historique"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="history-head">
          <div className="history-head-copy">
            <span className="history-kicker">
              <Icon name="history" size={12} />
              Journal local
            </span>
            <h2>Historique</h2>
            <p>Conservé sur cet appareil uniquement, jamais synchronisé.</p>
          </div>
          <div className="history-head-actions">
            {rows.length > 0 && (
              <button
                type="button"
                className="ghost-btn history-clear"
                onClick={clearAll}
                title="Effacer tout l’historique"
                aria-label="Effacer tout l’historique"
              >
                <Icon name="trash" size={13} />
                <span>Effacer tout</span>
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              onClick={() => setOverlay(null)}
              title="Fermer"
              aria-label="Fermer"
            >
              <Icon name="close" size={17} />
            </button>
          </div>
        </header>

        <div className="history-layout">
          <aside className="history-aside">
            <div className="history-summary">
              <span className="history-summary-label">Pages visibles</span>
              <strong>{filtered.length}</strong>
              <span className="history-summary-sites">
                {countLabel(sites, 'site', 'sites')} visité{sites > 1 ? 's' : ''}
              </span>
            </div>

            <nav className="history-filters" aria-label="Période de l’historique">
              <span className="history-aside-label">Période</span>
              {PERIODS.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className="history-filter"
                  data-active={period === item.id}
                  aria-pressed={period === item.id}
                  onClick={() => setPeriod(item.id)}
                >
                  <span>{item.label}</span>
                  <span className="history-filter-count">{counts[item.id]}</span>
                </button>
              ))}
            </nav>

            <p className="history-local">
              <Icon name="lock" size={12} />
              <span>Rien ne quitte cet appareil.</span>
            </p>
          </aside>

          <section className="history-main" aria-label="Pages visitées">
            <div className="history-toolbar">
              <div className="history-search">
                <Icon name="search" size={14} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filtrer par titre, site ou adresse"
                  aria-label="Rechercher dans l’historique"
                  spellCheck={false}
                />
                {query && (
                  <button
                    type="button"
                    className="history-search-clear"
                    onClick={() => setQuery('')}
                    title="Effacer la recherche"
                    aria-label="Effacer la recherche"
                  >
                    <Icon name="close" size={11} />
                  </button>
                )}
              </div>
              <span className="history-result" aria-live="polite">
                {countLabel(filtered.length, 'page', 'pages')}
              </span>
            </div>

            <div className="history-scroll">
              {entries === null && <p className="history-empty">Chargement…</p>}
              {entries !== null && rows.length === 0 && (
                <p className="history-empty">
                  <strong>Rien encore.</strong>
                  Les pages que vous ouvrez apparaîtront ici.
                </p>
              )}
              {entries !== null && rows.length > 0 && filtered.length === 0 && (
                <p className="history-empty">
                  <strong>Aucune page ne correspond.</strong>
                  Essayez un autre mot ou une autre période.
                  <button type="button" className="link-btn" onClick={resetFilters}>
                    Tout afficher
                  </button>
                </p>
              )}

              {Array.from(days, ([label, list]) => (
                <section key={label} className="history-day">
                  <div className="history-day-head">
                    <h2>{label}</h2>
                    <span>{list.length}</span>
                  </div>
                  <ul className="history-list">
                    {list.map((entry) => {
                      const host = hostOf(entry.url)
                      return (
                        <li key={`${entry.id}-${entry.visitedAt}`} className="history-row">
                          <button
                            type="button"
                            className="history-open"
                            onClick={() => {
                              setOverlay(null)
                              newTab(entry.url)
                            }}
                            title={entry.url}
                          >
                            <Favicon
                              src={entry.favicon}
                              url={entry.url}
                              label={entry.title || host}
                              size={16}
                              spaceId={entry.spaceId}
                            />
                            <span className="history-copy">
                              <span className="history-title">{entry.title || host}</span>
                              <span className="history-host">{host}</span>
                            </span>
                            <span className="history-meta">
                              <span className="history-date">{shortDate(entry.visitedAt)}</span>
                              <span className="history-time">{timeAgo(entry.visitedAt)}</span>
                            </span>
                          </button>
                          <button
                            type="button"
                            className="history-remove"
                            title="Supprimer cette entrée"
                            aria-label={`Supprimer ${entry.title || host} de l’historique`}
                            onClick={() => void remove(entry.url)}
                          >
                            <Icon name="close" size={12} />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
