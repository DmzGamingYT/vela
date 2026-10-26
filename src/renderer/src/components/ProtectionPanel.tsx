import { hostOf, isHomeUrl } from '@shared/url'
import { useBrowser } from '../store/browser'
import { Icon } from './Icon'

export default function ProtectionPanel() {
  const view = useBrowser((s) => s.view)
  const setOverlay = useBrowser((s) => s.setOverlay)
  const toggleSiteProtection = useBrowser((s) => s.toggleSiteProtection)

  if (!view) return null
  const tab = view.tabs.find((item) => item.id === view.activeTabId)
  if (!tab || isHomeUrl(tab.url)) {
    return (
      <div className="overlay" onMouseDown={() => setOverlay(null)}>
        <div className="sheet protection-sheet" role="dialog" aria-label="Protection" onMouseDown={(e) => e.stopPropagation()}>
          <header className="settings-head">
            <div>
              <h1>Protection</h1>
              <p>Ouvrez une page pour voir ce que le bloqueur y arrête.</p>
            </div>
            <button type="button" className="icon-btn" onClick={() => setOverlay(null)} title="Fermer">
              <Icon name="close" size={17} />
            </button>
          </header>
        </div>
      </div>
    )
  }

  const host = hostOf(tab.url)
  const exempt = view.privacyExemptions.some((entry) => host === entry || host.endsWith(`.${entry}`))
  const hosts = tab.blockedHosts
  const total = tab.blocked
  const enabled = view.settings.blockTrackers

  return (
    <div className="overlay" onMouseDown={() => setOverlay(null)}>
      <div className="sheet protection-sheet" role="dialog" aria-label="Protection du site" onMouseDown={(e) => e.stopPropagation()}>
        <header className="settings-head">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-dot" />
              {host}
            </p>
            <h1>Protection de ce site</h1>
            <p>
              {total > 0
                ? `${total} requête${total === 1 ? '' : 's'} arrêtée${total === 1 ? '' : 's'} sur cette page, avant de quitter votre appareil.`
                : 'Rien à bloquer pour l’instant sur cette page.'}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={() => setOverlay(null)} title="Fermer">
            <Icon name="close" size={17} />
          </button>
        </header>

        <div className="settings-scroll protection-body">
          <div className="setting-row">
            <div>
              <label>Bloqueur sur ce site</label>
              <p className="setting-hint">
                {enabled
                  ? exempt
                    ? 'Désactivé pour ce site : les requêtes passent normalement, jusqu’à réactivation.'
                    : 'Actif : publicités et traqueurs sont arrêtés localement.'
                  : 'Le bloqueur global est désactivé dans les réglages.'}
              </p>
            </div>
            <button
              type="button"
              className="switch"
              role="switch"
              aria-checked={!exempt}
              aria-label="Bloqueur sur ce site"
              data-on={!exempt}
              onClick={() => void toggleSiteProtection(host)}
            >
              <span />
            </button>
          </div>

          {hosts.length > 0 && (
            <section className="protection-list">
              <h2>Ce qui a été arrêté</h2>
              {hosts.map((entry) => {
                const share = Math.max(6, Math.round((entry.count / Math.max(1, total)) * 100))
                return (
                  <div key={entry.host} className="protection-host">
                    <span className="protection-host-name">{entry.host}</span>
                    <span className="protection-bar" aria-hidden="true">
                      <span style={{ width: `${share}%` }} />
                    </span>
                    <span className="protection-count">{entry.count}</span>
                  </div>
                )
              })}
            </section>
          )}

          <p className="setting-hint protection-note">
            La liste de blocage est embarquée dans Vela : aucune requête n’est envoyée à un serveur de filtrage.
            Désactiver ici ne change rien pour vos autres sites.
          </p>
        </div>
      </div>
    </div>
  )
}
