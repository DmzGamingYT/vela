import { useState } from 'react'
import { useBrowser } from '../store/browser'
import { Icon } from './Icon'

export default function TasksCard() {
  const tasks = useBrowser((s) => s.view?.tasks ?? [])
  const createTask = useBrowser((s) => s.createTask)
  const toggleTask = useBrowser((s) => s.toggleTask)
  const deleteTask = useBrowser((s) => s.deleteTask)
  const [draft, setDraft] = useState('')

  const open = tasks.filter((t) => !t.done)
  const done = tasks.filter((t) => t.done).slice(0, 3)

  const submit = () => {
    if (!draft.trim()) return
    void createTask(draft.trim(), true)
    setDraft('')
  }

  return (
    <section className="start-section tasks-card">
      <div className="section-head">
        <h2>Tâches du jour</h2>
        <span className="section-count">{open.length}</span>
      </div>
      <div className="tasks-add">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ajouter une tâche pour aujourd’hui…"
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          aria-label="Nouvelle tâche"
        />
        <button type="button" className="icon-btn" onClick={submit} title="Ajouter">
          <Icon name="plus" size={14} />
        </button>
      </div>
      {open.length === 0 && <p className="setting-hint">Rien d’échu. Ajoutez la première étape du jour.</p>}
      <ul className="tasks-list">
        {open.slice(0, 6).map((task) => (
          <li key={task.id} className="task-row">
            <button
              type="button" className="task-check" role="checkbox" aria-checked={false}
              onClick={() => void toggleTask(task.id)} title="Marquer faite"
            />
            <span className="task-title">{task.title}</span>
            <button type="button" className="tab-action" onClick={() => void deleteTask(task.id)} title="Supprimer">
              <Icon name="trash" size={12} />
            </button>
          </li>
        ))}
        {done.map((task) => (
          <li key={task.id} className="task-row" data-done="true">
            <button type="button" className="task-check" data-done="true" role="checkbox" aria-checked={true} onClick={() => void toggleTask(task.id)} title="Rouvrir" />
            <span className="task-title">{task.title}</span>
            <button type="button" className="tab-action" onClick={() => void deleteTask(task.id)} title="Supprimer">
              <Icon name="trash" size={12} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
