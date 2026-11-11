import type { CSSProperties } from 'react'
import { APP_SHORTCUTS } from '@shared/shortcuts'
import { shortcut } from '../../lib/format'
import { useBrowser } from '../../store/browser'
import { Icon } from '../Icon'
import SpaceAvatar from '../space/SpaceAvatar'

/**
 * Rail des espaces.
 *
 * Trois étages : la bascule de la barre latérale dans la rangée du titre, les
 * deux modes au milieu, les espaces puis « + » en bas. Réglages ferme la
 * colonne sous le « + » : la barre latérale n’a donc plus de carte pour lui.
 *
 * La colonne est détachée de 8 px du bord de la fenêtre : l’indicateur de
 * l’espace actif, posé sur le bord extérieur, n’est plus rogné.
 */
export default function SpaceRail() {
  const view = useBrowser((state) => state.view)
  const workMode = useBrowser((state) => state.workMode)
  const setWorkMode = useBrowser((state) => state.setWorkMode)
  const activateSpace = useBrowser((state) => state.activateSpace)
  const openSpaceDialog = useBrowser((state) => state.openSpaceDialog)
  const toggleSidebar = useBrowser((state) => state.toggleSidebar)
  const overlay = useBrowser((state) => state.overlay)
  const setOverlay = useBrowser((state) => state.setOverlay)

  const settingsTitle = `Réglages (${shortcut(APP_SHORTCUTS.settings.key)})`

  if (!view) return <aside className="rail" aria-label="Profils" />

  return (
    <aside className="rail" aria-label="Profils">
      <div className="rail-drag drag" />

      {/* Dans la rangée du titre : la bascule se lit à la hauteur du mot
          « Vela », pas 56 px plus bas. */}
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
          <Icon name="globe" size={18} />
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
          <Icon name="monitor" size={18} />
          <span className="sr-only">Atelier</span>
        </button>
      </div>

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
              <SpaceAvatar space={space} size={36} />
            </button>
          )
        })}
        <button
          type="button"
          className="space-chip space-add"
          onClick={() => openSpaceDialog()}
          title="Nouveau profil"
        >
          <Icon name="plus" size={16} />
        </button>
      </div>

      <button
        type="button"
        className="rail-ghost rail-settings"
        data-active={overlay === 'settings'}
        aria-pressed={overlay === 'settings'}
        onClick={() => setOverlay(overlay === 'settings' ? null : 'settings')}
        title={settingsTitle}
        aria-label="Réglages"
      >
        <Icon name="settings" size={17} />
      </button>
    </aside>
  )
}
