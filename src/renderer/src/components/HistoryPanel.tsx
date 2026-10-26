import { useEffect, useState } from 'react'
import type { HistoryEntry } from '@shared/types'
import { hostOf } from '@shared/url'
import { shortDate, timeAgo } from '../lib/format'
import { useBrowser } from '../store/browser'
import Favicon from './Favicon'
import { Icon } from './Icon'

function dayLabel(timestamp: number): string {
  const date = new Date(timestamp)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const same = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (same(date, today)) return 'Aujourd’hui'
  if (same(date, yesterday)) return 'Hier'
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(date)
}

export default function HistoryPanel() {
  const setOverlay = useBrowser((s) => s.setOverlay)
  const newTab = useBrowser((s) => s.newTab)
  const removeHistory = useBrowser((s) => s.removeHistory)
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)

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
  const days = new Map<string, HistoryEntry[]>()
  for (const entry of rows) {
    const key = dayLabel(entry.visitedAt)
    const bucket = days.get(key)
    if (bucket) bucket.push(entry)
    else days.set(key, [entry])
  }

  const remove = async (url: string): Promise<void> => {
    setEntries((current) => (current ? current.filter((item) => item.url !== url) : current))
    await removeHistory(url)
  }

  return (
    <div className="overlay" onMouseDown={() => setOverlay(null)}>
      <div className="sheet library-sheet" role="dialog" aria-label="Historique" onMouseDown={(e) => e.stopPropagation()}>
        <header className="settings-head">
          <div>
            <h1>Historique</h1>
            <p>Conservé sur cet appareil uniquement, jamais synchronisé.</p>
          </div>
          <div className="library-head-actions">
            {rows.length > 0 && (
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  void window.vela.history.clear().then(() => setEntries([]))
                }}
              >
                <Icon name="trash" size={13} /> Effacer tout
              </button>
            )}
            <button type="button" className="icon-btn" onClick={() => setOverlay(null)} title="Fermer">
              <Icon name="close" size={17} />
            </button>
          </div>
        </header>

        <div className="settings-scroll library-scroll">
          {entries === null && <p className="setting-hint">Chargement…</p>}
          {entries !== null && rows.length === 0 && (
            <p className="setting-hint">Rien encore : les pages que vous ouvrez apparaîtront ici.</p>
          )}
          {Array.from(days, ([label, list]) => (
            <section key={label} className="library-day">
              <h2>{label}</h2>
              <ul className="library-list">
                {list.map((entry) => {
                  const host = hostOf(entry.url)
                  return (
                    <li key={`${entry.id}-${entry.visitedAt}`} className="library-row">
                      <button
                        type="button"
                        className="library-open"
                        onClick={() => {
                          setOverlay(null)
                          newTab(entry.url)
                        }}
                        title={entry.url}
                      >
                        <Favicon src={entry.favicon} label={entry.title || host} />
                        <span className="library-copy">
                          <span className="library-title">{entry.title || host}</span>
                          <span className="library-host">
                            {host} · {shortDate(entry.visitedAt)}
                          </span>
                        </span>
                        <span className="library-time">{timeAgo(entry.visitedAt)}</span>
                      </button>
                      <button
                        type="button"
                        className="tab-action"
                        title="Supprimer cette entrée"
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
      </div>
    </div>
  )
}
