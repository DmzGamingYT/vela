import { hostOf } from '@shared/url'
import { shortcut } from '../../lib/format'
import { useBrowser } from '../../store/browser'
import Favicon from '../Favicon'
import { Icon } from '../Icon'

/**
 * Les pages gardées : un onglet de la Bibliothèque.
 *
 * Pas d'étoile ici : celle de la barre d'adresse garde déjà la page courante.
 * Deux boutons pour un même geste, un de trop.
 */
export default function BookmarksList() {
  const view = useBrowser((s) => s.view)
  const setOverlay = useBrowser((s) => s.setOverlay)
  const newTab = useBrowser((s) => s.newTab)
  const removeBookmark = useBrowser((s) => s.removeBookmark)

  if (!view) return null
  const bookmarks = view.bookmarks

  return (
    <div className="settings-scroll library-scroll">
      {bookmarks.length === 0 && (
        <p className="setting-hint">
          Aucun marque-page. Ouvrez une page puis {shortcut('D')}, ou l’étoile dans la barre
          d’adresse.
        </p>
      )}
      <ul className="library-list">
        {bookmarks.map((entry) => {
          const host = hostOf(entry.url)
          return (
            <li key={entry.id} className="library-row">
              <button
                type="button"
                className="library-open"
                onClick={() => {
                  setOverlay(null)
                  newTab(entry.url)
                }}
                title={entry.url}
              >
                <Favicon src={entry.favicon} label={entry.title || host} />
                <span className="library-copy">
                  <span className="library-title">{entry.title || host}</span>
                  <span className="library-host">{host}</span>
                </span>
              </button>
              <button
                type="button"
                className="tab-action"
                title="Retirer des marque-pages"
                onClick={() => void removeBookmark(entry.id)}
              >
                <Icon name="trash" size={12} />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
