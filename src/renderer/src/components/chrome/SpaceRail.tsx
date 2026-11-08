import type { CSSProperties } from 'react'
import { shortcut } from '../../lib/format'
import { useBrowser } from '../../store/browser'
import { Icon } from '../Icon'
import SidebarDock from './SidebarDock'
import SpaceAvatar from '../space/SpaceAvatar'

export default function SpaceRail() {
  const view = useBrowser((state) => state.view)
  // Le sélecteur de mode vit ici : le rail reste visible quand la barre
  // latérale est repliée, donc le mode ne disparaît plus.
  const workMode = useBrowser((state) => state.workMode)
  const setWorkMode = useBrowser((state) => state.setWorkMode)
  const activateSpace = useBrowser((state) => state.activateSpace)
  const openSpaceDialog = useBrowser((state) => state.openSpaceDialog)
  const toggleSidebar = useBrowser((state) => state.toggleSidebar)
  const notesOpen = useBrowser((state) => state.notesOpen)
  const agentOpen = useBrowser((state) => state.agentOpen)
  const overlay = useBrowser((state) => state.overlay)
  const toggleNotes = useBrowser((state) => state.toggleNotes)
  const openAgent = useBrowser((state) => state.openAgent)
  const setOverlay = useBrowser((state) => state.setOverlay)

  if (!view) return <aside className="rail" aria-label="Espaces" />

  return (
    <aside className="rail" aria-label="Espaces">
      <div className="rail-drag drag" />

      {/* Le repli commande le rail lui-même : il vit en haut, pas dans la
          pile des outils. */}
      <div className="rail-head">
        <button
          type="button"
          className="rail-ghost"
          aria-expanded={!view.settings.sidebarCollapsed}
          onClick={() => toggleSidebar()}
          title={`${view.settings.sidebarCollapsed ? 'Afficher' : 'Replier'} la barre latérale (${shortcut('S')})`}
        >
          <Icon name="panel" size={17} />
        </button>
      </div>

      <div className="rail-modes" role="tablist" aria-label="Mode">
        <button
          type="button"
          role="tab"
          className="rail-mode"
          aria-selected={workMode === 'browse'}
          data-active={workMode === 'browse'}
          onClick={() => setWorkMode('browse')}
          title={`Navigation (${shortcut('⇧A')})`}
        >
          <Icon name="globe" size={17} />
          <span className="sr-only">Navigation</span>
        </button>
        <button
          type="button"
          role="tab"
          className="rail-mode"
          aria-selected={workMode === 'work'}
          data-active={workMode === 'work'}
          onClick={() => setWorkMode('work')}
          title={`Atelier (${shortcut('⇧A')})`}
        >
          <Icon name="monitor" size={17} />
          <span className="sr-only">Atelier</span>
        </button>
      </div>

      {/* Deux groupes d’actions distincts : le trait empêche de lire les
          modes et les espaces comme une seule pile d’icônes. */}
      <div className="rail-sep" aria-hidden="true" />

      <div className="rail-spaces">
        {view.spaces.map((space) => {
          const active = space.id === view.activeSpaceId
          return (
            <button
              key={space.id}
              type="button"
              className="space-chip"
              data-active={active}
              data-avatar="true"
              style={{ '--space': space.color } as CSSProperties}
              onClick={() => activateSpace(space.id)}
              title={space.name}
              onDoubleClick={() => openSpaceDialog(space.id)}
            >
              <SpaceAvatar space={space} size={34} />
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

      {/* La barre latérale repliée ne laisse que le rail : le dock y garde les
          trois actions, en icônes seules. */}
      {view.settings.sidebarCollapsed && (
        <SidebarDock
          compact
          notesOpen={notesOpen}
          agentOpen={agentOpen}
          settingsOpen={overlay === 'settings'}
          onNotes={() => toggleNotes()}
          onAgent={() => openAgent()}
          onSettings={() => setOverlay('settings')}
        />
      )}
    </aside>
  )
}
