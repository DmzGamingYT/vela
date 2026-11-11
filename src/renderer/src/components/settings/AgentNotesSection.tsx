import { plural, timeAgo } from '../../lib/format'
import { useBrowser } from '../../store/browser'
import { Icon } from '../Icon'

/**
 * Onglet Notes de la section Agent : les fichiers Markdown de l'appareil et
 * les dernières notes, avec un chemin direct vers le tiroir.
 */
export default function AgentNotesSection() {
  const view = useBrowser((state) => state.view)
  const setOverlay = useBrowser((state) => state.setOverlay)
  const saveAgentNote = useBrowser((state) => state.saveAgentNote)
  const toggleNotes = useBrowser((state) => state.toggleNotes)
  const hasReport = useBrowser((state) => Boolean(state.agent.markdown))

  if (!view) return null

  const openNotes = (): void => {
    setOverlay(null)
    toggleNotes(true)
  }
  const notes = view.notes ?? []
  const recent = [...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6)

  return (
    <>
      <section className="setting-block" data-settings-anchor="agent-notes-files">
        <div className="setting-head">
          <h2>Fichiers</h2>
          <p>{plural(notes.length, 'note')} · sauvegarde immédiate, aucun serveur.</p>
        </div>
        <div className="setting-row">
          <div>
            <label>Dossier des notes</label>
            <p className="setting-hint">Du Markdown lisible par n’importe quelle autre app.</p>
          </div>
          <button
            type="button"
            className="action"
            onClick={() => void window.vela.notes.openFolder()}
          >
            <Icon name="folder" size={13} />
            Ouvrir
          </button>
        </div>
        <button
          type="button"
          className="action wide"
          onClick={() => void saveAgentNote()}
          disabled={!hasReport}
        >
          <Icon name="notes" size={13} />
          Enregistrer le dernier rapport de l’agent
        </button>
      </section>

      {/* La page ne montrait qu'un compteur et un dossier : les dernières
          notes donnent une raison d'y venir et un chemin vers le tiroir. */}
      <section className="setting-block" data-settings-anchor="agent-notes-recent">
        <div className="setting-head">
          <h2>Notes récentes</h2>
          <p>
            {recent.length === 0
              ? 'Rien encore : le tiroir de notes garde les extraits d’une page en un clic.'
              : 'Les six dernières, tous profils confondus.'}
          </p>
        </div>
        {recent.length === 0 ? (
          <p className="setting-hint">
            Chaque note reste un fichier <code>.md</code>, lisible sans Vela.
          </p>
        ) : (
          <ul className="settings-note-list">
            {recent.map((note) => (
              <li key={note.id}>
                <button type="button" className="settings-note-row" onClick={openNotes}>
                  <Icon name={note.pinned ? 'star' : 'notes'} size={13} />
                  <span className="settings-note-copy">
                    <strong>{note.title || 'Note sans titre'}</strong>
                    <span>{note.preview || 'Note vide'}</span>
                  </span>
                  <span className="settings-note-date">{timeAgo(note.updatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="action wide" onClick={openNotes}>
          <Icon name="notes" size={13} />
          Ouvrir le tiroir de notes
        </button>
      </section>
    </>
  )
}
