import type { CSSProperties } from 'react'
import { APP_SHORTCUTS } from '@shared/shortcuts'
import { shortcut } from '../../lib/format'
import { useBrowser } from '../../store/browser'
import { Icon } from '../Icon'
import SpaceAvatar from '../space/SpaceAvatar'

/**
 * Rail des espaces.
 *
 * Trois étages : la bascule de la barre latérale et les deux modes en haut,
 * les profils au milieu, puis la rangée d’outils et Réglages en bas. Les
 * outils vivent avec les profils, pas avec les modes : c’est là qu’on les
 * cherche une fois la page ouverte.
 *
 * La colonne est détachée de 8 px du bord de la fenêtre : l’indicateur de
 * l’espace actif, posé sur le bord extérieur, n’est plus rogné.
 */
export default function SpaceRail() {
  // Trois tranches plutôt que l'objet `view` entier : le rail ne se redessine
  // plus quand seuls les onglets ou l'historique ont bougé.
  const spaces = useBrowser((state) => state.view?.spaces)
  const activeSpaceId = useBrowser((state) => state.view?.activeSpaceId)
  const sidebarCollapsed = useBrowser((state) => state.view?.settings.sidebarCollapsed ?? false)
  const workMode = useBrowser((state) => state.workMode)
  const setWorkMode = useBrowser((state) => state.setWorkMode)
  const activateSpace = useBrowser((state) => state.activateSpace)
  const openSpaceDialog = useBrowser((state) => state.openSpaceDialog)
  const toggleSidebar = useBrowser((state) => state.toggleSidebar)
  const overlay = useBrowser((state) => state.overlay)
  const setOverlay = useBrowser((state) => state.setOverlay)
  // Les trois outils ferment la colonne, sous les profils : la recherche
  // d’onglets reste seule dans le pied de la barre latérale.
  const notesOpen = useBrowser((state) => state.notesOpen)
  const agentOpen = useBrowser((state) => state.agentOpen)
  const toggleNotes = useBrowser((state) => state.toggleNotes)
  const openAgent = useBrowser((state) => state.openAgent)
  const notes = useBrowser((state) => state.view?.notes.length ?? 0)
  const downloads = useBrowser((state) => state.view?.downloads ?? [])
  const running = downloads.find((item) => item.state === 'progress') ?? null
  const libraryOpen = overlay === 'bookmarks' || overlay === 'downloads' || overlay === 'history'
  const percent =
    running && running.total > 0
      ? Math.min(100, Math.round((running.received / running.total) * 100))
      : null

  const settingsTitle = `Réglages (${shortcut(APP_SHORTCUTS.settings.key)})`

  if (!spaces) return <aside className="rail" aria-label="Profils" />

  return (
    <aside className="rail" aria-label="Profils">
      <div className="rail-drag drag" />

      {/* Dans la rangée du titre : la bascule se lit à la hauteur du mot
          « Azimut », pas 56 px plus bas. */}
      <div className="rail-head">
        <button
          type="button"
          className="rail-ghost"
          aria-expanded={!sidebarCollapsed}
          onClick={() => toggleSidebar()}
          title={`${sidebarCollapsed ? 'Afficher' : 'Replier'} la barre latérale (${shortcut('S')})`}
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
        {spaces.map((space) => {
          const active = space.id === activeSpaceId
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

      <div className="rail-tools" role="group" aria-label="Raccourcis">
        <span className="rail-tool-sep" aria-hidden="true" />
        {/* Les outils d’abord : ce sont eux qu’on ouvre en lisant une page. */}
        <button
          type="button"
          className="rail-tool"
          data-active={notesOpen ? 'true' : undefined}
          aria-label="Notes"
          aria-pressed={notesOpen}
          title={`Notes (${shortcut(APP_SHORTCUTS.notes.key)})`}
          onClick={() => toggleNotes()}
        >
          <Icon name="notes" size={17} />
          {notes > 0 && <span className="rail-tool-count">{notes}</span>}
        </button>
        <button
          type="button"
          className="rail-tool"
          data-active={agentOpen ? 'true' : undefined}
          aria-label="Demander à l’agent"
          aria-pressed={agentOpen}
          title={`Agent (${shortcut(APP_SHORTCUTS.agent.key)})`}
          onClick={() => openAgent()}
        >
          <Icon name="sparkles" size={17} />
        </button>

        <span className="rail-tool-sep" aria-hidden="true" />

        {/* La bibliothèque tient en un seul bouton : ce qu’on garde, ce qu’on
            télécharge et ce qu’on a vu sont trois onglets d’une même feuille. */}
        <button
          type="button"
          className="rail-tool"
          data-active={libraryOpen ? 'true' : undefined}
          aria-label="Bibliothèque"
          title="Bibliothèque — marque-pages, téléchargements, historique"
          onClick={() => setOverlay(libraryOpen ? null : 'bookmarks')}
        >
          {running && (
            <svg className="rr-ring" viewBox="0 0 34 34" aria-hidden="true">
              <circle className="download-ring-track" cx="17" cy="17" r="15" />
              <circle
                className="download-ring-fill"
                data-known={percent !== null}
                cx="17"
                cy="17"
                r="15"
                strokeDasharray={
                  percent === null ? '23.5 94.25' : `${Math.max(percent, 1) * 0.9425} 94.25`
                }
              />
            </svg>
          )}
          <Icon name="stack" size={17} />
          {downloads.length > 0 && <span className="rail-tool-count">{downloads.length}</span>}
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
