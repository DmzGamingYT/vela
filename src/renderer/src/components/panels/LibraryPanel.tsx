import { useState } from 'react'
import { useModalFocus } from '../../lib/useModalFocus'
import { useBrowser } from '../../store/browser'
import { Icon } from '../Icon'
import BookmarksList from './BookmarksList'
import DownloadsList from './DownloadsList'
import HistoryList from './HistoryList'

export type LibraryTab = 'bookmarks' | 'downloads' | 'history'

const TABS: { id: LibraryTab; label: string }[] = [
  { id: 'bookmarks', label: 'Marque-pages' },
  { id: 'downloads', label: 'Téléchargements' },
  { id: 'history', label: 'Historique' }
]

/**
 * Bibliothèque : les trois listes de l’app, dans un seul panneau.
 *
 * Ce qu’on garde, ce qu’on télécharge et ce qu’on a vu sont trois vues du même
 * sujet — trois boutons dans le pied de la barre latérale pour trois listes
 * qu’on n’ouvre jamais deux à la fois, c’était une de trop.
 *
 * L’onglet d’ouverture vient de `overlay` : le pied, les raccourcis et les
 * liens existants ouvrent donc directement la bonne liste. Il ne sert que
 * d’état initial — le panneau est démonté à chaque fermeture, donc il repart
 * toujours de l’onglet demandé, et changer d’onglet ne relance pas de rendu en
 * cascade depuis un effet.
 */
export default function LibraryPanel({ tab }: { tab: LibraryTab | null }) {
  const setOverlay = useBrowser((s) => s.setOverlay)
  const sheetRef = useModalFocus<HTMLDivElement>()
  const [active, setActive] = useState<LibraryTab>(tab ?? 'bookmarks')

  const open = (next: LibraryTab): void => {
    setActive(next)
    setOverlay(next)
  }

  const label = TABS.find((item) => item.id === active)?.label ?? 'Bibliothèque'

  return (
    <div className="overlay" onMouseDown={() => setOverlay(null)}>
      <div
        ref={sheetRef}
        className="sheet library-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Bibliothèque"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="settings-head">
          <div>
            <h2>Bibliothèque</h2>
            <p>Ce que vous gardez, téléchargez et visitez — sur cet appareil.</p>
          </div>
          <div className="library-head-actions">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setOverlay(null)}
              title="Fermer"
              aria-label="Fermer"
            >
              <Icon name="close" size={17} />
            </button>
          </div>
        </header>

        <div className="library-tabs" role="tablist" aria-label="Sections de la bibliothèque">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              className="library-tab"
              aria-selected={active === item.id}
              data-active={active === item.id ? 'true' : undefined}
              onClick={() => open(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="library-body" role="tabpanel" aria-label={label}>
          {active === 'bookmarks' && <BookmarksList />}
          {active === 'downloads' && <DownloadsList />}
          {active === 'history' && <HistoryList />}
        </div>
      </div>
    </div>
  )
}
