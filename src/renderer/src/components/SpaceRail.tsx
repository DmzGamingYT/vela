import type { CSSProperties } from 'react'
import { useBrowser } from '../store/browser'
import { Icon } from './Icon'

export default function SpaceRail() {
  const view = useBrowser((state) => state.view)
  const notesOpen = useBrowser((state) => state.notesOpen)
  const activateSpace = useBrowser((state) => state.activateSpace)
  const openSpaceDialog = useBrowser((state) => state.openSpaceDialog)
  const setOverlay = useBrowser((state) => state.setOverlay)
  const updateSettings = useBrowser((state) => state.updateSettings)
  const toggleNotes = useBrowser((state) => state.toggleNotes)
  const openAgent = useBrowser((state) => state.openAgent)

  if (!view) return <aside className="rail" />

  return (
    <aside className="rail">
      <div className="rail-drag drag" />

      <div className="rail-spaces">
        {view.spaces.map((space) => {
          const active = space.id === view.activeSpaceId
          return (
            <button
              key={space.id}
              type="button"
              className="space-chip"
              data-active={active}
              style={{ '--space': space.color } as CSSProperties}
              onClick={() => activateSpace(space.id)}
              title={space.name}
              onDoubleClick={() => openSpaceDialog(space.id)}
            >
              <span>{space.name.slice(0, 1).toUpperCase()}</span>
            </button>
          )
        })}
        <button
          type="button"
          className="space-chip space-add"
          onClick={() => openSpaceDialog()}
          title="Nouvel espace"
        >
          <Icon name="plus" size={16} />
        </button>
      </div>

      <div className="rail-bottom">
        <button
          type="button"
          className="rail-ghost"
          data-active={notesOpen}
          onClick={() => toggleNotes()}
          title="Notes (⌘E)"
        >
          <Icon name="notes" size={18} />
        </button>
        <button
          type="button"
          className="rail-ghost"
          onClick={() => openAgent()}
          title="Agent (⌘J)"
        >
          <Icon name="sparkles" size={18} />
        </button>
        <button
          type="button"
          className="rail-ghost"
          onClick={() => updateSettings({ sidebarCollapsed: !view.settings.sidebarCollapsed })}
          title="Replier la barre latérale (⌘S)"
        >
          <Icon name="panel" size={18} />
        </button>
        <button
          type="button"
          className="rail-ghost"
          onClick={() => setOverlay('settings')}
          title="Réglages (⌘,)"
        >
          <Icon name="settings" size={18} />
        </button>
      </div>
    </aside>
  )
}
