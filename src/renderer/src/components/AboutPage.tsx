import { providerById, providerReady, providerState } from '@shared/providers'
import { updateDescription } from '@shared/update'
import { useBrowser } from '../store/browser'
import { VelaMark } from './BrandMark'
import { Icon } from './Icon'

/**
 * Page « À propos » des réglages : identité, version, mise à jour.
 * Extraite de SettingsPanel ; elle lit l'état de mise à jour dans le store,
 * comme le reste du panneau. Le détail et les boutons vivent dans la page
 * « Mises à jour », pour ne pas dupliquer les actions.
 */
export default function AboutPage({ onOpenUpdates }: { onOpenUpdates: () => void }) {
  const update = useBrowser((state) => state.update)
  const view = useBrowser((state) => state.view)
  const settings = view?.settings
  if (!settings) return null
  const activeDefinition = providerById(settings.agent.provider)
  const activeState = providerState(settings)
  const apiReady = providerReady(settings)
  const updateLabel = updateDescription(update, window.vela.platform)

  return (
    <section className="setting-block">
      <div className="about-hero">
        <VelaMark size={52} brand />
        <div>
          <div className="about-title">
            <strong className="about-name">
              Vela<span aria-hidden="true">.</span>
            </strong>
            {update?.currentVersion && (
              <span className="about-version" title={`Vela ${update.currentVersion}`}>
                {update.currentVersion}
              </span>
            )}
          </div>
          <p className="about-tagline">Le web, votre atelier.</p>
          <p className="about-meta">
            Navigateur de travail · macOS, Windows, Linux
            <br />
            Gratuit · Libre (MIT) · Sans compte
          </p>
        </div>
      </div>
      <div className="setting-row">
        <div>
          <strong>Mise à jour</strong>
          <p className="setting-hint">{updateLabel}</p>
          {update?.state === 'downloading' && (
            <div
              className="update-progress"
              role="progressbar"
              aria-valuenow={update.progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${Math.min(100, Math.max(0, update.progress))}%` }} />
            </div>
          )}
        </div>
        <div className="setting-actions">
          <button type="button" className="action primary" onClick={onOpenUpdates}>
            <Icon name="reload" size={15} />
            Gérer les mises à jour
          </button>
        </div>
      </div>
      <div className="about-grid">
        <div>
          <span>Agent</span>
          <strong>
            {apiReady ? `${activeDefinition.label} · ${activeState.model}` : 'Démo locale'}
          </strong>
        </div>
        <div>
          <span>Bloqueur</span>
          <strong>
            {!settings.blockTrackers
              ? 'Désactivé'
              : settings.blockLevel === 'strict'
                ? 'Renforcé'
                : 'Traqueurs'}
          </strong>
        </div>
        <div>
          <span>Données</span>
          <strong>Sur cet appareil</strong>
        </div>
      </div>
    </section>
  )
}
