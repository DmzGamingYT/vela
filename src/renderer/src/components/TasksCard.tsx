import { useState } from 'react'
import { useBrowser } from '../store/browser'
import { Icon } from './Icon'

/**
 * Module « Tâches du jour » de l'accueil : progression visible, coche animée
 * et ajout direct. Les tâches vivent dans l'espace actif (store principal).
 */
export default function TasksCard() {
  const tasks = useBrowser((s) => s.view?.tasks ?? [])
  const createTask = useBrowser((s) => s.createTask)
  const toggleTask = useBrowser((s) => s.toggleTask)
  const deleteTask = useBrowser((s) => s.deleteTask)
  const [draft, setDraft] = useState('')

  const open = tasks.filter((t) => !t.done)
  const done = tasks.filter((t) => t.done)
  const total = tasks.length
  const percent = total === 0 ? 0 : Math.round((done.length / total) * 100)
  const visible = [...open.slice(0, 4), ...done.slice(0, 2)]

  const submit = (): void => {
    if (!draft.trim()) return
    void createTask(draft.trim(), true)
    setDraft('')
  }

  return (
    <section className="home-card home-tasks" aria-label="Tâches du jour">
      <div className="home-card-head">
        <h2>Tâches du jour</h2>
        <span className="tasks-score" aria-hidden="true">
          {done.length}/{total}
        </span>
      </div>

      <div className="tasks-progress">
        <span
          className="tasks-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={`${done.length} tâche${done.length > 1 ? 's' : ''} sur ${total}`}
        >
          <span style={{ width: `${percent}%` }} data-empty={total === 0 ? 'true' : undefined} />
        </span>
        <span className="tasks-pct">{percent} %</span>
      </div>

      {total === 0 && (
        <p className="tasks-hint">Rien pour l’instant. La première étape du jour suffit pour commencer.</p>
      )}

      <ul className="tasks-list">
        {visible.map((task) => (
          <li key={task.id} className="task-row" data-done={task.done ? 'true' : undefined}>
            <button
              type="button"
              className="task-check"
              data-done={task.done ? 'true' : undefined}
              role="checkbox"
              aria-checked={task.done}
              aria-label={task.done ? `Rouvrir ${task.title}` : `Marquer ${task.title} faite`}
              onClick={() => void toggleTask(task.id)}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="m3.5 8.5 3 3 6-6" />
              </svg>
            </button>
            <span className="task-title">{task.title}</span>
            <button
              type="button"
              className="task-remove"
              onClick={() => void deleteTask(task.id)}
              title="Supprimer"
              aria-label={`Supprimer ${task.title}`}
            >
              <Icon name="close" size={11} />
            </button>
          </li>
        ))}
      </ul>

      <div className="tasks-add">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ajouter une tâche…"
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          aria-label="Nouvelle tâche"
        />
        <button type="button" onClick={submit} title="Ajouter" aria-label="Ajouter la tâche" disabled={!draft.trim()}>
          <Icon name="plus" size={13} />
        </button>
      </div>
    </section>
  )
}
