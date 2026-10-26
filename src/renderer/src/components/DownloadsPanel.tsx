import { useBrowser } from '../store/browser'
import { Icon } from './Icon'

export default function DownloadsPanel() {
  const view = useBrowser((s) => s.view)
  const setOverlay = useBrowser((s) => s.setOverlay)
  const downloads = view?.downloads ?? []

  return (
    <div className="overlay" onMouseDown={() => setOverlay(null)}>
      <div className="sheet" role="dialog" aria-label="Téléchargements" onMouseDown={(e) => e.stopPropagation()}>
        <header className="settings-head">
          <div>
            <h1>Téléchargements</h1>
            <p>Enregistrés dans le dossier Téléchargements du système.</p>
          </div>
          <button type="button" className="icon-btn" onClick={() => setOverlay(null)} title="Fermer"><Icon name="close" size={17} /></button>
        </header>
        <div className="settings-scroll">
          {downloads.length === 0 && <p className="setting-hint">Rien pour le moment.</p>}
          {downloads.map((d) => (
            <div key={d.id} className="setting-row">
              <div>
                <label>{d.name}</label>
                <p className="setting-hint">
                  {d.state === 'progress'
                    ? `${(d.received / 1024).toFixed(0)} Ko reçus`
                    : d.state === 'done'
                      ? 'Terminé'
                      : 'Interrompu'} · {d.url.slice(0, 60)}
                </p>
              </div>
              <button
                type="button"
                className="ghost-btn"
                disabled={d.state !== 'done'}
                onClick={() => void window.vela.downloads.preview(d.id).then((opened) => {
                  if (!opened) void window.vela.downloads.open(d.id)
                })}
              >
                Ouvrir
              </button>
              <button type="button" className="ghost-btn" onClick={() => void window.vela.downloads.open(d.id)}>
                Dans le dossier
              </button>
            </div>
          ))}
          {downloads.length > 0 && (
            <button type="button" className="action" onClick={() => void window.vela.downloads.clear()}>
              <Icon name="trash" size={13} /> Effacer terminés
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
