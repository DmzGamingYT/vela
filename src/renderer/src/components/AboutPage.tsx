import { providerById, providerReady, providerState } from '@shared/providers'
import { updateActionLabel, updateDescription, updateNotice } from '@shared/update'
import { useBrowser } from '../store/browser'
import { VelaMark } from './BrandMark'
import { Icon } from './Icon'

/**
 * Page « À propos » des réglages : identité, version, mise à jour.
 * Extraite de SettingsPanel ; elle lit l'état de mise à jour dans le store,
 * comme le reste du panneau.
 */
export default function AboutPage() {
  const update = useBrowser((state) => state.update)
  const checkUpdate = useBrowser((state) => state.checkUpdate)
  const installUpdate = useBrowser((state) => state.installUpdate)
  const openReleases = useBrowser((state) => state.openReleases)
  const view = useBrowser((state) => state.view)
  const settings = view?.settings
  if (!settings) return null
  const activeDefinition = providerById(settings.agent.provider)
  const activeState = providerState(settings)
  const apiReady = providerReady(settings)
  const updateLabel = updateDescription(update, window.vela.platform)
  const notice = updateNotice(update, window.vela.platform)

  return (
    <section className="setting-block">
      <div className="about-hero">
        <VelaMark size={52} brand />
        <div>
          <strong className="about-name">
            Vela<span aria-hidden="true">.</span>
          </strong>
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
          {update?.state === 'downloaded' && notice?.action ? (
            <button type="button" className="action primary" onClick={() => void installUpdate()}>
              <Icon name={notice.action === 'install' ? 'download' : 'reload'} size={15} />
              {updateActionLabel(notice.action)}
            </button>
          ) : (
            <button
              type="button"
              className="action"
              onClick={() => void checkUpdate()}
              disabled={update?.state === 'checking' || update?.state === 'downloading'}
            >
              <Icon name="reload" size={15} />
              Vérifier
            </button>
          )}
          <button type="button" className="action ghost" onClick={() => void openReleases()}>
            <Icon name="external" size={14} />
            Releases
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
