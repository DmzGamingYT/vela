import { useState } from 'react'
import { hostOf } from '@shared/url'
import { greeting, shortcut, timeAgo } from '../lib/format'
import { useBrowser } from '../store/browser'
import Favicon from './Favicon'
import { Icon } from './Icon'
import TasksCard from './TasksCard'

const STARTERS = [
  { label: 'GitHub', detail: 'Vos projets', url: 'https://github.com' },
  { label: 'Hacker News', detail: 'La tech du jour', url: 'https://news.ycombinator.com' },
  { label: 'Le Monde', detail: 'L’actualité', url: 'https://www.lemonde.fr' },
  { label: 'Wikipédia', detail: 'La référence libre', url: 'https://fr.wikipedia.org' }
]

export default function StartPage({ tabId }: { tabId: string }) {
  const view = useBrowser((state) => state.view)
  const navigate = useBrowser((state) => state.navigate)
  const setOverlay = useBrowser((state) => state.setOverlay)
  const [tasksOpen, setTasksOpen] = useState(false)

  if (!view) return null

  const recent = view.history.filter((entry) => /^https?:/i.test(entry.url)).slice(0, 5)
  const openTasks = view.tasks.filter((task) => !task.done).length

  return (
    <div className="start">
      <div className="start-inner">
        <header className="start-hero">
          <p className="eyebrow">
            <span className="eyebrow-dot" />
            {view.brief.dateLabel}
          </p>
          <h1 className="hero-title">
            {greeting()}
            <span className="hero-dot">.</span>
          </h1>

          <button type="button" className="hero-field" onClick={() => setOverlay('command')}>
            <Icon name="search" size={15} />
            <span>Rechercher, saisir une adresse ou demander à l’agent</span>
            <kbd>{shortcut('K')}</kbd>
          </button>
        </header>

        <div className="start-body">
          <section className="start-section recent">
            <div className="section-head">
              <h2>Récemment</h2>
            </div>

            {recent.length > 0 ? (
              <div className="recent-list">
                {recent.map((entry) => {
                  const host = hostOf(entry.url)
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      className="recent-row"
                      onClick={() => navigate(tabId, entry.url)}
                    >
                      <Favicon src={entry.favicon} label={entry.title || host} size={15} />
                      <span className="recent-copy">
                        <span className="recent-title">{entry.title || host}</span>
                        <span className="recent-host">{host}</span>
                      </span>
                      <span className="recent-time">{timeAgo(entry.visitedAt)}</span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="starters">
                <p className="starters-lede">Quelques pages pour commencer. Vos recherches ne partent que vers le moteur choisi.</p>
                <div className="starter-grid">
                  {STARTERS.map((starter) => (
                    <button
                      key={starter.url}
                      type="button"
                      className="starter-link"
                      onClick={() => navigate(tabId, starter.url)}
                    >
                      <span className="starter-label">{starter.label}</span>
                      <span className="starter-detail">{starter.detail}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="start-tasks" data-open={tasksOpen}>
            <button
              type="button"
              className="tasks-toggle"
              aria-expanded={tasksOpen}
              aria-controls="start-tasks-panel"
              onClick={() => setTasksOpen((open) => !open)}
            >
              <Icon name="chevron-right" size={13} />
              <span>Tâches du jour</span>
              <span className="tasks-count">{openTasks}</span>
            </button>

            {tasksOpen && (
              <div id="start-tasks-panel">
                <TasksCard />
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
