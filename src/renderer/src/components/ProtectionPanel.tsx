import { hostOf, isHomeUrl } from '@shared/url'
import { useBrowser } from '../store/browser'
import { Icon } from './Icon'

const LEVELS = [
  { id: 'off', label: 'Aucun', hint: 'Rien n’est filtré, sur aucun site.' },
  { id: 'trackers', label: 'Traqueurs', hint: 'Publicités et mesure d’audience, liste locale.' },
  {
    id: 'strict',
    label: 'Renforcé',
    hint: 'En plus : scripts et cadres servis par un autre site.'
  }
] as const

export default function ProtectionPanel() {
  const view = useBrowser((s) => s.view)
  const setOverlay = useBrowser((s) => s.setOverlay)
  const toggleSiteProtection = useBrowser((s) => s.toggleSiteProtection)
  const updateSettings = useBrowser((s) => s.updateSettings)

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
  const session = view.blockedTotal
  const enabled = view.settings.blockTrackers
  const level = !enabled ? 'off' : view.settings.blockLevel === 'strict' ? 'strict' : 'trackers'
  const levelHint = LEVELS.find((entry) => entry.id === level)?.hint ?? ''
  // Bilan de la session : la somme des pages encore ouvertes. Un compteur
  // global séparé obligerait à tenir deux comptabilités pour le même chiffre.
  const sessionHosts = (() => {
    const sums = new Map<string, number>()
    for (const entry of view.tabs) {
      for (const host of entry.blockedHosts) {
        sums.set(host.host, (sums.get(host.host) ?? 0) + host.count)
      }
    }
    return [...sums.entries()]
      .map(([host, count]) => ({ host, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
  })()
  const sessionDomains = new Set(view.tabs.flatMap((entry) => entry.blockedHosts.map((item) => item.host))).size

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
          <div className="protection-stats" role="group" aria-label="Statistiques de protection">
            <div>
              <span className="protection-stat-value">{session}</span>
              <span className="protection-stat-label">Cette session</span>
            </div>
            <div>
              <span className="protection-stat-value">{sessionDomains}</span>
              <span className="protection-stat-label">Domaines concernés</span>
            </div>
            <div>
              <span className="protection-stat-value">{total}</span>
              <span className="protection-stat-label">Sur cette page</span>
            </div>
          </div>

          <div className="setting-row setting-row-top">
            <div>
              <label id="panel-level-label">Niveau de blocage</label>
              <p className="setting-hint">
                {levelHint} Ce réglage vaut pour tous les espaces.
              </p>
            </div>
            <div className="segmented" role="radiogroup" aria-labelledby="panel-level-label">
              {LEVELS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="radio"
                  aria-checked={level === entry.id}
                  className="segment"
                  data-active={level === entry.id}
                  onClick={() => {
                    if (entry.id === 'off') void updateSettings({ blockTrackers: false })
                    else {
                      void updateSettings({
                        blockTrackers: true,
                        blockLevel: entry.id === 'strict' ? 'strict' : 'trackers'
                      })
                    }
                  }}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>

          <div className="setting-row">
            <div>
              <label>Bloqueur sur ce site</label>
              <p className="setting-hint">
                {!enabled
                  ? 'Le niveau est sur « Aucun » : ce réglage ne change rien tant qu’il reste ainsi.'
                  : exempt
                    ? 'Désactivé pour ce site : les requêtes passent normalement, jusqu’à réactivation.'
                    : 'Actif : publicités et traqueurs sont arrêtés localement.'}
              </p>
            </div>
            <button
              type="button"
              className="switch"
              role="switch"
              aria-checked={!exempt}
              aria-label="Bloqueur sur ce site"
              data-on={!exempt}
              disabled={!enabled}
              onClick={() => void toggleSiteProtection(host)}
            >
              <span />
            </button>
          </div>

          {hosts.length > 0 && (
            <section className="protection-list">
              <h2>Sur cette page</h2>
              {hosts.map((entry) => {
                const percent = Math.round((entry.count / Math.max(1, total)) * 100)
                return (
                  <div key={entry.host} className="protection-host">
                    <span className="protection-host-name">{entry.host}</span>
                    <span className="protection-bar" aria-hidden="true">
                      <span style={{ width: `${Math.max(6, percent)}%` }} />
                    </span>
                    <span className="protection-share">{percent} %</span>
                    <span className="protection-count">{entry.count}</span>
                  </div>
                )
              })}
            </section>
          )}

          <section className="protection-list">
            <h2>Depuis le lancement</h2>
            {sessionHosts.length === 0 ? (
              <p className="setting-hint">Aucun domaine arrêté pour l’instant. Naviguez, puis revenez ici.</p>
            ) : (
              sessionHosts.map((entry) => {
                const percent = Math.round((entry.count / Math.max(1, session)) * 100)
                return (
                  <div key={entry.host} className="protection-host">
                    <span className="protection-host-name">{entry.host}</span>
                    <span className="protection-bar" aria-hidden="true">
                      <span style={{ width: `${Math.max(6, percent)}%` }} />
                    </span>
                    <span className="protection-share">{percent} %</span>
                    <span className="protection-count">{entry.count}</span>
                  </div>
                )
              })
            )}
          </section>

          <p className="setting-hint protection-note">
            La liste de blocage est embarquée dans Vela : aucune requête n’est envoyée à un serveur de filtrage.
            Désactiver ici ne change rien pour vos autres sites. Le mode renforcé peut gêner certains sites.
          </p>
        </div>
      </div>
    </div>
  )
}
