import { zoomPercentOfLevel } from '@shared/navigation'
import { useBrowser } from '../../store/browser'
import { Icon } from '../Icon'

/**
 * Zooms retenus par domaine. La liste est triée par nom pour rester lisible ;
 * « Oublier » retire un seul site, sans toucher aux autres.
 */
export default function ZoomSitesList() {
  const sites = useBrowser((state) => state.view?.settings.zoomByHost ?? {})
  const forgetZoom = useBrowser((state) => state.forgetZoom)
  const entries = Object.entries(sites).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="setting-row setting-row-stacked">
      <div>
        <span className="setting-label">Zooms mémorisés par site</span>
        <p className="setting-hint">
          {entries.length === 0
            ? 'Aucun site pour l’instant. Un ⌘+ ou ⌘− sur une page retient le niveau pour ce domaine.'
            : 'Le niveau choisi sur un site revient à chaque visite, même après redémarrage.'}
        </p>
      </div>

      {entries.length > 0 && (
        <ul className="zoom-sites">
          {entries.map(([site, level]) => (
            <li key={site}>
              <span className="zoom-site-name" title={site}>
                {site}
              </span>
              <span className="zoom-site-level">{zoomPercentOfLevel(level)} %</span>
              <button
                type="button"
                className="icon-btn zoom-site-forget"
                onClick={() => void forgetZoom(site)}
                aria-label={`Oublier le zoom de ${site}`}
                title="Oublier ce site"
              >
                <Icon name="close" size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
