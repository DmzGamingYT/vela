import { useBrowser } from '../store/browser'
import { Icon } from './Icon'

/**
 * Barre d’état contextuelle : elle ne montre que ce qui a une valeur ou une
 * action. Le mode et la barre de commande vivent respectivement dans le rail et
 * au clavier — plus de doublon ici. Rien à signaler → la barre disparaît.
 */
export default function StatusBar() {
  const view = useBrowser((s) => s.view)
  const setOverlay = useBrowser((s) => s.setOverlay)

  if (!view) return null

  const blocked = view.blockedTotal
  const downloads = view.downloads.length

  if (blocked === 0 && downloads === 0) return null

  return (
    <div className="status-bar" role="status" aria-label="État">
      {blocked > 0 && (
        <span className="status-item" title="Requêtes publicitaires bloquées cette session">
          <Icon name="shield" size={13} />
          <strong>{blocked}</strong>
        </span>
      )}

      {downloads > 0 && (
        <button
          type="button"
          className="status-item as-btn"
          onClick={() => setOverlay('downloads')}
          title="Téléchargements"
        >
          <Icon name="download" size={13} />
          <strong>{downloads}</strong>
        </button>
      )}
    </div>
  )
}
