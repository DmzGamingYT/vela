import type { BriefItem } from '@shared/types'
import { hostOf } from '@shared/url'
import { greeting, initials, shortcut, timeAgo, tintFor } from '../lib/format'
import { useBrowser } from '../store/browser'
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
  const selectTab = useBrowser((state) => state.selectTab)
  const setOverlay = useBrowser((state) => state.setOverlay)
  const openAgent = useBrowser((state) => state.openAgent)
  const openSpaceDialog = useBrowser((state) => state.openSpaceDialog)
  const toggleNotes = useBrowser((state) => state.toggleNotes)
  const splitToggle = useBrowser((state) => state.splitToggle)
  const newTab = useBrowser((state) => state.newTab)

  if (!view) return null

  const recent = view.history.filter((entry) => /^https?:/i.test(entry.url)).slice(0, 5)

  const openBriefItem = (item: BriefItem): void => {
    if (item.tabId) {
      selectTab(item.tabId)
      return
    }
    if (item.url) {
      navigate(tabId, item.url)
      return
    }
    if (item.kind === 'start') {
      if (/espace/i.test(item.title)) openSpaceDialog()
      else if (/rapport|agent/i.test(item.title) || /agent/i.test(item.detail)) openAgent()
      else setOverlay('command')
    }
  }

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
          <p className="hero-lede">
            Le web, votre atelier. Vos onglets, vos notes et un agent dans le même espace — sans le bruit.
          </p>

          <button type="button" className="hero-field" onClick={() => setOverlay('command')}>
            <Icon name="search" size={15} />
            <span>Rechercher, saisir une adresse ou demander à l’agent</span>
            <kbd>{shortcut('K')}</kbd>
          </button>

          <div className="hero-actions">
            <button type="button" className="action primary" onClick={() => openAgent()}>
              <Icon name="sparkles" size={15} />
              Demander à l’agent
              <kbd>{shortcut('J')}</kbd>
            </button>
            <button type="button" className="action" onClick={() => splitToggle()}>
              <Icon name="split" size={15} />
              Vue scindée
            </button>
          </div>

          <div className="stat-strip">
            <span className="stat-chip" data-tone="sage">
              <Icon name="shield" size={12} />
              <strong>{view.blockedTotal}</strong> pubs bloquées
            </span>
            <span className="stat-chip">
              <Icon name="calendar" size={12} />
              <strong>{view.tasks.filter((task) => !task.done).length}</strong> tâches du jour
            </span>
            <span className="stat-chip">
              <Icon name="notes" size={12} />
              <strong>{view.notes.length}</strong> notes
            </span>
            <span className="stat-chip">
              <Icon name="globe" size={12} />
              <strong>{view.tabs.filter((tab) => tab.spaceId === view.activeSpaceId).length}</strong> onglets
            </span>
          </div>
        </header>

        <section className="start-section">
          <div className="section-head">
            <h2>
              Brief du jour <span className="section-count">03</span>
            </h2>
            <button type="button" className="text-btn" onClick={() => setOverlay('brief')}>
              Ouvrir <Icon name="chevron-right" size={13} />
            </button>
          </div>

          <div className="brief-cards">
            {view.brief.items.map((item, index) => (
              <button
                key={`${item.label}-${item.title}`}
                type="button"
                className="brief-item"
                data-kind={item.kind}
                onClick={() => openBriefItem(item)}
              >
                <span className="brief-number">{String(index + 1).padStart(2, '0')}</span>
                <span className="brief-label">{item.label}</span>
                <span className="brief-title">{item.title}</span>
                <span className="brief-detail">{item.detail}</span>
                <span className="brief-go">
                  <Icon name="arrow-right" size={14} />
                </span>
              </button>
            ))}
          </div>
        </section>

        <div className="start-columns">
          <section className="start-section recent">
            <div className="section-head">
              <h2>Récemment</h2>
            </div>

            {recent.length > 0 ? (
              <div className="recent-list">
                {recent.map((entry) => {
                  const host = hostOf(entry.url)
                  const tint = tintFor(host)
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      className="recent-row"
                      onClick={() => navigate(tabId, entry.url)}
                    >
                      <span className="recent-icon" style={{ color: tint, background: `${tint}1c` }}>
                        {initials(host)}
                      </span>
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
                <p className="starters-lede">Quelques pages pour commencer — rien n’est envoyé nulle part.</p>
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

          <aside className="start-aside">
            <TasksCard />
            <div className="start-section">
            <div className="section-head">
              <h2>Raccourcis</h2>
            </div>
            <div className="shortcut-list">
              <button type="button" className="shortcut-row" onClick={() => newTab()}>
                <Icon name="plus" size={14} />
                <span>Nouvel onglet</span>
                <kbd>{shortcut('T')}</kbd>
              </button>
              <button type="button" className="shortcut-row" onClick={() => openSpaceDialog()}>
                <Icon name="circle" size={14} />
                <span>Nouvel espace</span>
              </button>
              <button type="button" className="shortcut-row" onClick={() => toggleNotes()}>
                <Icon name="notes" size={14} />
                <span>Notes à côté</span>
                <kbd>{shortcut('E')}</kbd>
              </button>
              <button type="button" className="shortcut-row" onClick={() => setOverlay('brief')}>
                <Icon name="calendar" size={14} />
                <span>Brief du jour</span>
                <kbd>{shortcut('⇧B')}</kbd>
              </button>
            </div>

            <div className="privacy-strip">
              <Icon name="shield" size={14} />
              <span>
                <strong>{view.blockedTotal}</strong> requêtes publicitaires bloquées cette session.
              </span>
            </div>
            </div>
          </aside>
        </div>

        <footer className="start-foot">
          <span>{view.tabs.filter((tab) => tab.spaceId === view.activeSpaceId).length} onglets dans cet espace</span>
          <span className="start-foot-key">
            <kbd>{shortcut('K')}</kbd> onglets, notes, tâches, agent
          </span>
        </footer>
      </div>
    </div>
  )
}
