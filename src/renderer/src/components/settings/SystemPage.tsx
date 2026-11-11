import { useRef, useState, type KeyboardEvent } from 'react'
import AboutPage from './AboutPage'
import ShortcutsSection from './ShortcutsSection'
import UpdatesPage from './UpdatesPage'
import { resolveTab } from './settingsSearch'

type Tab = 'shortcuts' | 'updates' | 'about'

const TABS: { id: Tab; label: string }[] = [
  { id: 'shortcuts', label: 'Raccourcis' },
  { id: 'updates', label: 'Mises à jour' },
  { id: 'about', label: 'À propos' }
]

/**
 * Section Système : les raccourcis, les mises à jour et l'identité de Vela.
 * Les trois anciennes pages sont réunies sous ces onglets ; À propos renvoie
 * vers l'onglet des mises à jour au lieu d'ouvrir une autre page.
 */
export default function SystemPage({ initialTab }: { initialTab?: string }) {
  const [tab, setTab] = useState<Tab>(() => resolveTab(initialTab, TABS, 'shortcuts'))
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({
    shortcuts: null,
    updates: null,
    about: null
  })

  const chooseTab = (next: Tab): void => {
    setTab(next)
    tabRefs.current[next]?.focus()
  }

  const tabKeys = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const last = TABS.length - 1
    let nextIndex: number
    if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = last
    else if (event.key === 'ArrowRight') nextIndex = index === last ? 0 : index + 1
    else if (event.key === 'ArrowLeft') nextIndex = index === 0 ? last : index - 1
    else return
    event.preventDefault()
    const next = TABS[nextIndex].id
    setTab(next)
    tabRefs.current[next]?.focus()
  }

  return (
    <div className="system-page">
      <div className="system-tabs" role="tablist" aria-label="Sous-sections du système">
        {TABS.map((entry, index) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`system-tab-${entry.id}`}
            className="system-tab"
            data-active={tab === entry.id}
            aria-selected={tab === entry.id}
            aria-controls={`system-panel-${entry.id}`}
            tabIndex={tab === entry.id ? 0 : -1}
            ref={(node) => {
              tabRefs.current[entry.id] = node
            }}
            onClick={() => chooseTab(entry.id)}
            onKeyDown={(event) => tabKeys(event, index)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div
        className="system-panel"
        id="system-panel-shortcuts"
        role="tabpanel"
        aria-labelledby="system-tab-shortcuts"
        hidden={tab !== 'shortcuts'}
      >
        <ShortcutsSection />
      </div>

      <div
        className="system-panel"
        id="system-panel-updates"
        role="tabpanel"
        aria-labelledby="system-tab-updates"
        hidden={tab !== 'updates'}
      >
        <UpdatesPage />
      </div>

      <div
        className="system-panel"
        id="system-panel-about"
        role="tabpanel"
        aria-labelledby="system-tab-about"
        hidden={tab !== 'about'}
      >
        <AboutPage onOpenUpdates={() => chooseTab('updates')} />
      </div>
    </div>
  )
}
