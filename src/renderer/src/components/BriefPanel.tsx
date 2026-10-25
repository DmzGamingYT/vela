import type { BriefItem } from '@shared/types'
import { useBrowser } from '../store/browser'
import { Icon } from './Icon'

export default function BriefPanel() {
  const view = useBrowser((state) => state.view)
  const setOverlay = useBrowser((state) => state.setOverlay)
  const selectTab = useBrowser((state) => state.selectTab)
  const navigate = useBrowser((state) => state.navigate)
  const openAgent = useBrowser((state) => state.openAgent)
  const openSpaceDialog = useBrowser((state) => state.openSpaceDialog)

  if (!view) return null

  const open = (item: BriefItem): void => {
    setOverlay(null)
    if (item.tabId) {
      selectTab(item.tabId)
      return
    }
    if (item.url) {
      navigate(view.activeTabId, item.url)
      return
    }
    if (item.kind === 'start') {
      if (/espace/i.test(item.title)) openSpaceDialog()
      else if (/rapport|agent/i.test(item.title) || /agent/i.test(item.detail)) {
        openAgent('Fais-moi le brief de mes onglets ouverts')
      } else {
        setOverlay('command')
      }
    }
  }

  return (
    <div className="overlay" onMouseDown={() => setOverlay(null)}>
      <div className="sheet brief-sheet" role="dialog" aria-label="Brief du jour" onMouseDown={(event) => event.stopPropagation()}>
        <header className="sheet-head">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-dot" />
              {view.brief.dateLabel}
            </p>
            <h1>Brief du jour</h1>
            <p className="sheet-lede">
              Trois choses qui méritent votre attention, calculées sur cet appareil à partir de vos onglets et de votre historique.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={() => setOverlay(null)} title="Fermer">
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="brief-stats">
          <div>
            <strong>{view.brief.pages}</strong>
            <span>pages cette semaine</span>
          </div>
          <div>
            <strong>{view.brief.sites}</strong>
            <span>sites visités</span>
          </div>
          <div>
            <strong>{view.brief.blocked}</strong>
            <span>requêtes bloquées</span>
          </div>
        </div>

        <div className="brief-lines">
          {view.brief.items.map((item, index) => (
            <button type="button" key={`${item.label}-${item.title}`} className="brief-line" onClick={() => open(item)}>
              <span className="brief-line-number">{String(index + 1).padStart(2, '0')}</span>
              <span className="brief-line-body">
                <span className="brief-label">{item.label}</span>
                <span className="brief-line-title">{item.title}</span>
                <span className="brief-line-detail">{item.detail}</span>
              </span>
              <span className="brief-line-go">
                <Icon name="arrow-right" size={16} />
              </span>
            </button>
          ))}
        </div>

        <footer className="sheet-foot">
          <span className="foot-note">
            <Icon name="shield" size={13} />
            Aucune donnée ne quitte cet appareil.
          </span>
          <button
            type="button"
            className="action primary"
            onClick={() => {
              setOverlay(null)
              openAgent('Fais-moi le brief de mes onglets ouverts')
            }}
          >
            <Icon name="sparkles" size={14} />
            Demander à l’agent
          </button>
        </footer>
      </div>
    </div>
  )
}
