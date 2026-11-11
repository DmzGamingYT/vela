import { hostOf } from '@shared/url'
import type { DownloadItem } from '@shared/types'
import { timeAgo } from '../../lib/format'
import { useModalFocus } from '../../lib/useModalFocus'
import { useBrowser } from '../../store/browser'
import { Icon } from '../Icon'

/** Taille lisible : kilo-octets jusqu'au méga, puis une décimale. */
function sizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 Ko'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} Go`
}

/** Pourcentage connu, ou null quand le serveur n'annonce pas de taille. */
function progressOf(item: DownloadItem): number | null {
  if (item.state === 'done') return 100
  if (item.state !== 'progress' || !item.total) return null
  return Math.max(0, Math.min(100, Math.round((item.received / item.total) * 100)))
}

function stateLabel(item: DownloadItem): string {
  if (item.state === 'done') return 'Terminé'
  if (item.state === 'cancelled') return 'Interrompu'
  const percent = progressOf(item)
  return percent === null ? 'En cours' : `${percent} %`
}

export default function DownloadsPanel() {
  const view = useBrowser((s) => s.view)
  const setOverlay = useBrowser((s) => s.setOverlay)
  const sheetRef = useModalFocus<HTMLDivElement>()
  const downloads = view?.downloads ?? []
  const destination = view?.settings.downloadDir
  const running = downloads.filter((item) => item.state === 'progress').length

  return (
    <div className="overlay" onMouseDown={() => setOverlay(null)}>
      <div
        ref={sheetRef}
        className="sheet downloads-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Téléchargements"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="settings-head downloads-head">
          <div>
            <span className="downloads-kicker">
              <Icon name="download" size={12} />
              Fichiers locaux
            </span>
            <h2>Téléchargements</h2>
            <p title={destination ?? undefined}>
              {destination
                ? `Enregistrés dans ${destination}.`
                : 'Enregistrés dans le dossier Téléchargements du système.'}
            </p>
          </div>
          <div className="downloads-head-actions">
            {downloads.length > 0 && (
              <span className="downloads-count">
                {running > 0
                  ? `${running} en cours`
                  : `${downloads.length} fichier${downloads.length > 1 ? 's' : ''}`}
              </span>
            )}
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

        <div className="settings-scroll downloads-scroll">
          {downloads.length === 0 ? (
            <div className="downloads-empty">
              <span className="downloads-empty-mark" aria-hidden="true">
                <Icon name="download" size={20} />
              </span>
              <strong>Rien pour le moment.</strong>
              <p>
                Les fichiers téléchargés depuis Vela apparaîtront ici, avec leur progression et leur
                destination.
              </p>
              <span className="downloads-empty-hint">
                <Icon name="lock" size={12} />
                Rien n’est envoyé ailleurs.
              </span>
            </div>
          ) : (
            <>
              <ul className="downloads-list">
                {downloads.map((item) => {
                  const percent = progressOf(item)
                  const host = hostOf(item.url)
                  const size = sizeLabel(item.total || item.received)
                  return (
                    <li key={item.id} className="downloads-row" data-state={item.state}>
                      <span className="downloads-mark" aria-hidden="true">
                        <Icon
                          name={
                            item.state === 'done'
                              ? 'check'
                              : item.state === 'progress'
                                ? 'download'
                                : 'warning'
                          }
                          size={15}
                        />
                      </span>
                      <div className="downloads-copy">
                        <div className="downloads-line">
                          <span className="downloads-name" title={item.name}>
                            {item.name}
                          </span>
                          <span className="downloads-state" data-state={item.state}>
                            {stateLabel(item)}
                          </span>
                        </div>
                        <span className="downloads-meta" title={item.url}>
                          {host || 'Fichier local'} · {size} · {timeAgo(item.startedAt)}
                        </span>
                        {item.state === 'progress' && (
                          <span className="downloads-track" aria-hidden="true">
                            <span
                              data-known={percent !== null}
                              style={percent !== null ? { width: `${percent}%` } : undefined}
                            />
                          </span>
                        )}
                      </div>
                      <div className="downloads-actions">
                        <button
                          type="button"
                          className="ghost-btn"
                          disabled={item.state !== 'done'}
                          onClick={() =>
                            void window.vela.downloads.preview(item.id).then((opened) => {
                              if (!opened) void window.vela.downloads.open(item.id)
                            })
                          }
                        >
                          Ouvrir
                        </button>
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => void window.vela.downloads.open(item.id)}
                        >
                          Dossier
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <div className="downloads-foot">
                <span className="downloads-foot-hint">
                  {downloads.length} fichier{downloads.length > 1 ? 's' : ''} cette session
                </span>
                <button
                  type="button"
                  className="action"
                  onClick={() => void window.vela.downloads.clear()}
                >
                  <Icon name="trash" size={13} />
                  Effacer terminés
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
