import { shortcut } from '../lib/format'
import { useBrowser } from '../store/browser'
import { Icon } from './Icon'

/**
 * Barre d’état contextuelle : elle ne montre que ce qui a une valeur ou une
 * action. Rien à signaler → il ne reste que le mode et le rappel ⌘K.
 */
export default function StatusBar() {
  const view = useBrowser((s) => s.view)
  const workMode = useBrowser((s) => s.workMode)
  const setWorkMode = useBrowser((s) => s.setWorkMode)
  const setOverlay = useBrowser((s) => s.setOverlay)

  if (!view) return null

  const blocked = view.blockedTotal
  const downloads = view.downloads.length

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

      <button
        type="button"
        className="status-mode"
        data-mode={workMode}
        onClick={() => setWorkMode(workMode === 'browse' ? 'work' : 'browse')}
        title={
          workMode === 'browse'
            ? `Passer en Work (${shortcut('⇧A')})`
            : `Revenir à Browse (${shortcut('⇧A')})`
        }
      >
        <Icon name={workMode === 'browse' ? 'globe' : 'sparkles'} size={12} />
        {workMode === 'browse' ? 'Browse' : 'Work'}
      </button>

      <button
        type="button"
        className="status-item as-btn status-kbd"
        onClick={() => setOverlay('command')}
        title="Barre de commande"
      >
        <Icon name="search" size={12} />
        <kbd>{shortcut('K')}</kbd>
      </button>
    </div>
  )
}
