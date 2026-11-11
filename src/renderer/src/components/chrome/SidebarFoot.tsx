import { APP_SHORTCUTS } from '@shared/shortcuts'
import { shortcut } from '../../lib/format'
import { useBrowser } from '../../store/browser'
import { Icon } from '../Icon'

interface SidebarFootProps {
  query: string
  onQuery(value: string): void
  /** Onglets de l’espace en veille (repliés par la lune). */
  asleep: number
}

/**
 * Pied de la barre latérale.
 *
 * Cinq raccourcis, rangés par usage et non par type de contenu : d'abord les
 * deux outils qu'on ouvre en travaillant (notes, agent), puis un filet, puis
 * la bibliothèque (téléchargements, historique, marque-pages). Le geste
 * fréquent est à gauche, sous la main ; l'archive à droite. Un filet sépare
 * les deux familles. Réglages a quitté cette colonne pour le rail de gauche.
 */
export default function SidebarFoot({ query, onQuery, asleep }: SidebarFootProps) {
  const overlay = useBrowser((state) => state.overlay)
  const setOverlay = useBrowser((state) => state.setOverlay)
  const notesOpen = useBrowser((state) => state.notesOpen)
  const agentOpen = useBrowser((state) => state.agentOpen)
  const toggleNotes = useBrowser((state) => state.toggleNotes)
  const openAgent = useBrowser((state) => state.openAgent)
  const notes = useBrowser((state) => state.view?.notes.length ?? 0)
  const downloads = useBrowser((state) => state.view?.downloads ?? [])
  // L'anneau de progression vit ici désormais : le rail de lecture ne porte
  // plus de bouton Téléchargements, deux entrées pour un même panneau.
  const running = downloads.find((item) => item.state === 'progress') ?? null
  const percent =
    running && running.total > 0
      ? Math.min(100, Math.round((running.received / running.total) * 100))
      : null

  return (
    <div className="sidebar-foot">
      <label className="foot-search">
        <Icon name="search" size={14} />
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onQuery('')
          }}
          placeholder="Filtrer les onglets"
          aria-label="Filtrer les onglets de ce profil"
          spellCheck={false}
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            className="foot-clear"
            aria-label="Effacer la recherche"
            onClick={() => onQuery('')}
          >
            <Icon name="close" size={13} />
          </button>
        )}
      </label>

      <div className="foot-row" role="group" aria-label="Raccourcis de la barre latérale">
        {/* Les outils d'abord : ce sont eux qu'on ouvre en lisant une page. */}
        <button
          type="button"
          className="foot-btn"
          data-active={notesOpen ? 'true' : undefined}
          aria-label="Notes"
          aria-pressed={notesOpen}
          title={`Notes (${shortcut(APP_SHORTCUTS.notes.key)})`}
          onClick={() => toggleNotes()}
        >
          <Icon name="notes" size={17} />
          {notes > 0 && <span className="foot-count">{notes}</span>}
        </button>
        <button
          type="button"
          className="foot-btn"
          data-active={agentOpen ? 'true' : undefined}
          aria-label="Demander à l’agent"
          aria-pressed={agentOpen}
          title={`Agent (${shortcut(APP_SHORTCUTS.agent.key)})`}
          onClick={() => openAgent()}
        >
          <Icon name="sparkles" size={17} />
        </button>

        <span className="foot-sep" aria-hidden="true" />

        {/* Puis la bibliothèque : ce qu'on télécharge, ce qu'on a vu, ce qu'on
            garde. L'ordre suit le cycle de la page. */}
        <button
          type="button"
          className="foot-btn"
          data-active={overlay === 'downloads' ? 'true' : undefined}
          aria-label={
            downloads.length > 0 ? `Téléchargements, ${downloads.length}` : 'Téléchargements'
          }
          title={running ? 'Téléchargement en cours' : 'Téléchargements'}
          onClick={() => setOverlay(overlay === 'downloads' ? null : 'downloads')}
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
          <Icon name="download" size={17} />
          {downloads.length > 0 && <span className="foot-count">{downloads.length}</span>}
        </button>
        <button
          type="button"
          className="foot-btn"
          data-active={overlay === 'history' ? 'true' : undefined}
          aria-label="Historique"
          title="Historique"
          onClick={() => setOverlay(overlay === 'history' ? null : 'history')}
        >
          <Icon name="history" size={17} />
        </button>
        <button
          type="button"
          className="foot-btn"
          data-active={overlay === 'bookmarks' ? 'true' : undefined}
          aria-label="Marque-pages"
          title="Marque-pages"
          onClick={() => setOverlay(overlay === 'bookmarks' ? null : 'bookmarks')}
        >
          <Icon name="list" size={17} />
        </button>
      </div>

      {asleep > 0 && (
        <p
          className="foot-note"
          title="En veille : la mémoire de ces onglets est libérée, la page se recharge à l’ouverture"
        >
          {asleep} onglet{asleep > 1 ? 's' : ''} en veille
        </p>
      )}
    </div>
  )
}
