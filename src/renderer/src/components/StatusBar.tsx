import { useState } from 'react'
import { updateActionLabel, updateNotice } from '@shared/update'
import { useBrowser } from '../store/browser'
import { Icon } from './Icon'

/** Version dont l'annonce a été masquée ; les réglages restent la porte d'entrée. */
const DISMISS_KEY = 'vela.update.dismissed'

/**
 * Barre d’état contextuelle : elle ne montre que ce qui a une valeur ou une
 * action. Le mode et la barre de commande vivent respectivement dans le rail et
 * au clavier — plus de doublon ici. Rien à signaler → la barre disparaît.
 */
export default function StatusBar() {
  const view = useBrowser((s) => s.view)
  const setOverlay = useBrowser((s) => s.setOverlay)
  const update = useBrowser((s) => s.update)
  const installUpdate = useBrowser((s) => s.installUpdate)
  const [dismissed, setDismissed] = useState<string>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) ?? ''
    } catch {
      return ''
    }
  })

  if (!view) return null

  const blocked = view.blockedTotal
  const downloads = view.downloads.length
  const isMac = window.vela.platform === 'darwin'
  const notice = updateNotice(update, isMac)
  // Une version déjà masquée ne revient pas ; l'action reste dans les réglages.
  const showUpdate = Boolean(notice && update?.version && dismissed !== update.version)

  if (blocked === 0 && downloads === 0 && !showUpdate) return null

  const dismiss = (): void => {
    if (!update?.version) return
    setDismissed(update.version)
    try {
      localStorage.setItem(DISMISS_KEY, update.version)
    } catch {
      /* stockage indisponible : l'annonce reviendra au prochain lancement */
    }
  }

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

      {showUpdate && notice && (
        <span className="status-item status-update">
          <Icon name={notice.action === 'install' ? 'download' : 'reload'} size={13} />
          <span className="status-update-label">{notice.label}</span>
          {notice.action && (
            <button type="button" className="status-action" onClick={() => void installUpdate()}>
              {updateActionLabel(notice.action)}
            </button>
          )}
          <button
            type="button"
            className="status-dismiss"
            onClick={dismiss}
            aria-label="Masquer l’annonce de mise à jour"
            title="Masquer"
          >
            <Icon name="close" size={11} />
          </button>
        </span>
      )}
    </div>
  )
}
