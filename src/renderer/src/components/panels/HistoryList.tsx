import { useEffect, useMemo, useState } from 'react'
import type { HistoryEntry } from '@shared/types'
import { hostOf } from '@shared/url'
import { shortDate, timeAgo } from '../../lib/format'
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

/** Lignes rendues d'un coup : au-delà, l'ouverture du panneau saccadait. */
const PAGE = 150

const EMPTY: HistoryEntry[] = []

// Un formateur unique pour tout le panneau : `dayLabel` en construisait un par
// entrée, soit jusqu'à cinq cents instances ICU à chaque frappe dans le filtre.
const DAY_FMT = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long'
})

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

/** Clé de regroupement : le minuit local du jour, en millisecondes. */
function dayKeyOf(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** Libellé d'un groupe : calculé une fois par groupe, jamais par entrée. */
function dayLabel(dayKey: number, now: number): string {
  const today = dayKeyOf(now)
  if (dayKey === today) return 'Aujourd’hui'
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (dayKey === yesterday.getTime()) return 'Hier'
  return DAY_FMT.format(new Date(dayKey))
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count > 1 ? plural : singular}`
}

/**
 * Les pages visitées : un onglet de la Bibliothèque.
 *
 * La feuille et son en-tête appartiennent au panneau qui l'accueille ; cette
 * liste garde son filtre, ses périodes et son propre défilement.
 */
export default function HistoryList() {
  const setOverlay = useBrowser((s) => s.setOverlay)
  const newTab = useBrowser((s) => s.newTab)
  const removeHistory = useBrowser((s) => s.removeHistory)
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [query, setQuery] = useState('')
  const [period, setPeriod] = useState<Period>('all')
  const [limit, setLimit] = useState(PAGE)
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

  const rows = entries ?? EMPTY
  // Tout le filtrage est mémorisé : une frappe ne refaisait jusqu'ici que les
  // mêmes parcours sur les cinq cents entrées, plus le regroupement.
  const counts = useMemo<Record<Period, number>>(
    () => ({
      all: rows.length,
      today: rows.filter((entry) => entry.visitedAt >= periodStart('today', now)).length,
      week: rows.filter((entry) => entry.visitedAt >= periodStart('week', now)).length,
      month: rows.filter((entry) => entry.visitedAt >= periodStart('month', now)).length
    }),
    [rows, now]
  )
  const needle = useMemo(() => query.trim().toLowerCase(), [query])
  const filtered = useMemo(() => {
    const from = periodStart(period, now)
    return rows.filter((entry) => {
      if (period !== 'all' && entry.visitedAt < from) return false
      if (!needle) return true
      const host = hostOf(entry.url)
      return `${entry.title}\n${entry.url}\n${host}`.toLowerCase().includes(needle)
    })
  }, [rows, needle, period, now])
  const sites = useMemo(() => new Set(filtered.map((entry) => hostOf(entry.url))).size, [filtered])
  const visible = useMemo(() => filtered.slice(0, limit), [filtered, limit])
  const remaining = filtered.length - visible.length
  const days = useMemo(() => {
    const byDay = new Map<number, HistoryEntry[]>()
    for (const entry of visible) {
      const key = dayKeyOf(entry.visitedAt)
      const bucket = byDay.get(key)
      if (bucket) bucket.push(entry)
      else byDay.set(key, [entry])
    }
    return Array.from(byDay).sort((a, b) => b[0] - a[0])
  }, [visible])

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
    setLimit(PAGE)
  }

  return (
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
              onClick={() => {
                setPeriod(item.id)
                setLimit(PAGE)
              }}
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
              onChange={(event) => {
                setQuery(event.target.value)
                setLimit(PAGE)
              }}
                                placeholder="Filtrer par titre ou adresse"
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

          {days.map(([dayKey, list]) => (
            <section key={dayKey} className="history-day">
              <div className="history-day-head">
                <h2>{dayLabel(dayKey, now)}</h2>
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
                        {/* L'icône vient du disque si l'appareil la
                                connaît, sinon du site une fois la ligne
                                visible : une liste de cent cinquante lignes
                                ne demande plus un domaine par ligne. */}
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

          {remaining > 0 && (
            <button
              type="button"
              className="ghost-btn history-more"
              onClick={() => setLimit((current) => current + PAGE)}
            >
              Afficher {Math.min(remaining, PAGE)} page{remaining > 1 ? 's' : ''} de plus
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
