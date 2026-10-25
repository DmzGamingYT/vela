import { useEffect, useState } from 'react'
import { useBrowser } from '../store/browser'
import { Icon } from './Icon'

function useFocusMinutes(): number {
  const activeId = useBrowser((s) => s.view?.activeTabId ?? '')
  const [minutes, setMinutes] = useState(() => {
    const key = `vela-focus-${new Date().toISOString().slice(0, 10)}`
    return Number(localStorage.getItem(key) ?? 0) || 0
  })
  useEffect(() => {
    if (!activeId) return
    let seconds = 0
    const t = setInterval(() => {
      if (document.hidden) return
      seconds += 5
      if (seconds >= 60) {
        seconds = 0
        setMinutes((m) => {
          const next = m + 1
          try {
            localStorage.setItem(`vela-focus-${new Date().toISOString().slice(0, 10)}`, String(next))
          } catch { /* stockage plein */ }
          return next
        })
      }
    }, 5000)
    return () => clearInterval(t)
  }, [activeId])
  return minutes
}

function startOfDay(now: number): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export default function StatusBar() {
  const view = useBrowser((s) => s.view)
  const workMode = useBrowser((s) => s.workMode)
  const setWorkMode = useBrowser((s) => s.setWorkMode)
  const setOverlay = useBrowser((s) => s.setOverlay)
  const toggleNotes = useBrowser((s) => s.toggleNotes)
  const focusMinutes = useFocusMinutes()
  if (!view) return null
  const now = Date.now()
  const day = startOfDay(now)
  const dueToday = view.tasks.filter((t) => !t.done && t.dueAt != null && t.dueAt >= day).length
  const overdue = view.tasks.filter((t) => !t.done && t.dueAt != null && t.dueAt < day).length

  return (
    <div className="status-bar" role="status" aria-label="État du jour">
      <span className="status-item" title="Requêtes publicitaires bloquées cette session">
        <Icon name="shield" size={13} /> Pubs bloquées <strong>{view.blockedTotal}</strong>
      </span>
      <span className="status-sep" />
      <button type="button" className="status-item as-btn" onClick={() => setOverlay('brief')} title="Ouvrir le brief">
        <Icon name="calendar" size={13} /> Dues <strong>{dueToday}</strong>
        {overdue > 0 && <em className="status-warn">{overdue} en retard</em>}
      </button>
      <span className="status-sep" />
      <button type="button" className="status-item as-btn" onClick={() => toggleNotes(true)} title="Ouvrir les notes">
        <Icon name="notes" size={13} /> Notes <strong>{view.notes.length}</strong>
      </button>
      <span className="status-sep" />
      <span className="status-item" title="Temps focus aujourd'hui"><Icon name="clock" size={13} /> Focus <strong>{focusMinutes}m</strong></span>
      <span className="status-sep" />
      <button type="button" className="status-item as-btn" onClick={() => setOverlay('downloads')} title="Téléchargements">
        <Icon name="external" size={13} /> DL <strong>{view.downloads.length}</strong>
      </button>
      <button type="button" className="status-item as-btn" onClick={() => setOverlay('processes')} title="Gestionnaire de processus">
        <Icon name="panel" size={13} /> Proc.
      </button>
      <span className="status-sep" />
      <button type="button" className="status-item as-btn" onClick={() => setWorkMode(workMode === 'browse' ? 'work' : 'browse')} title="Basculer Browse / Work">
        {workMode === 'browse' ? 'Browse' : 'Work'}
      </button>
      <button type="button" className="status-item as-btn" onClick={() => setOverlay('command')} title="Ouvrir le lanceur">
        <Icon name="search" size={13} /> <kbd>⌘K</kbd>
      </button>
    </div>
  )
}
