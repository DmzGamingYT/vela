import type { UpdateChannel } from '@shared/api'
import type { UpdateChecks } from '@shared/types'
import { updateDescription } from '@shared/update'
import { useBrowser } from '../../store/browser'
import { Icon } from '../Icon'

const CHANNEL_LABEL: Record<UpdateChannel, string> = {
  mac: 'macOS · installateur',
  windows: 'Windows · installateur',
  appimage: 'AppImage Linux',
  'linux-package': 'Paquet Linux',
  other: 'Application'
}

const CHECK_LABEL: Record<UpdateChecks, string> = {
  auto: 'Démarrage · toutes les 3 h',
  weekly: 'Démarrage · chaque semaine',
  off: 'Désactivé'
}

/**
 * Page « Mises à jour » des réglages.
 *
 * Elle existe parce que le contrôle automatique est muet par nature : sur
 * Linux, une AppImage lancée hors AppImage (paquet .deb, binaire extrait,
 * dossier en lecture seule) échouait sans jamais le dire. Ici, l'état réel,
 * le mode d'installation et l'action possible sont toujours visibles.
 */
export default function UpdatesPage() {
  const update = useBrowser((state) => state.update)
  const view = useBrowser((state) => state.view)
  const updateSettings = useBrowser((state) => state.updateSettings)
  const checkUpdate = useBrowser((state) => state.checkUpdate)
  const downloadUpdate = useBrowser((state) => state.downloadUpdate)
  const installUpdate = useBrowser((state) => state.installUpdate)
  const openReleases = useBrowser((state) => state.openReleases)

  const platform = window.vela.platform
  const channel: UpdateChannel =
    update?.channel ??
    (platform === 'linux'
      ? 'linux-package'
      : platform === 'darwin'
        ? 'mac'
        : platform === 'win32'
          ? 'windows'
          : 'other')
  const isAppImage = channel === 'appimage'
  const busy = update?.state === 'checking' || update?.state === 'downloading'
  const downloaded = update?.state === 'downloaded'
  const available = update?.state === 'available'
  const progress = Math.min(100, Math.max(0, update?.progress ?? 0))
  const checks = view?.settings.updateChecks ?? 'auto'

  const actionLabel = downloaded
    ? platform === 'linux' && !isAppImage
      ? 'Afficher l’AppImage'
      : platform === 'darwin'
        ? 'Installer'
        : 'Redémarrer et installer'
    : available
      ? 'Télécharger la mise à jour'
      : 'Vérifier les mises à jour'

  const run = (): void => {
    if (busy) return
    if (downloaded) {
      installUpdate()
      return
    }
    if (available) {
      void downloadUpdate()
      return
    }
    void checkUpdate()
  }

  const status =
    update?.state === 'checking'
      ? 'Recherche de la dernière version…'
      : update?.state === 'downloading'
        ? `Téléchargement vérifié · ${progress} %`
        : (update?.message ?? updateDescription(update, platform))

  return (
    <section className="setting-block">
      <div className="setting-head">
        <h2>Version installée</h2>
        <p>{status}</p>
      </div>

      <div className="update-meta" role="group" aria-label="État de la mise à jour">
        <div>
          <span>Version</span>
          <strong>{update?.currentVersion || '—'}</strong>
        </div>
        <div>
          <span>Mode</span>
          <strong>{CHANNEL_LABEL[channel]}</strong>
        </div>
        <div>
          <span>Contrôle</span>
          <strong>{CHECK_LABEL[checks]}</strong>
        </div>
      </div>

      <div className="setting-row">
        <div>
          <label htmlFor="update-checks">Vérification automatique</label>
          <p className="setting-hint">
            Rythme du contrôle silencieux. « Toutes les 3 h » vérifie aussi au retour de veille ou
            de focus (au plus toutes les 30 min). Le bouton reste disponible dans les trois cas.
          </p>
        </div>
        <div className="setting-actions">
          <select
            id="update-checks"
            value={checks}
            onChange={(event) =>
              void updateSettings({ updateChecks: event.target.value as UpdateChecks })
            }
          >
            <option value="auto">Toutes les 3 h</option>
            <option value="weekly">Une fois par semaine</option>
            <option value="off">Jamais</option>
          </select>
        </div>
      </div>

      {(update?.state === 'downloading' || update?.state === 'downloaded') && (
        <div
          className="update-progress"
          role="progressbar"
          aria-valuenow={update.state === 'downloaded' ? 100 : progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progression du téléchargement"
        >
          <span style={{ width: `${update.state === 'downloaded' ? 100 : progress}%` }} />
        </div>
      )}

      <div className="setting-row">
        <div>
          <label>{downloaded ? 'Mise à jour prête' : 'Mettre à jour Vela'}</label>
          <p className="setting-hint">
            {downloaded
              ? updateDescription(update, platform)
              : 'Le téléchargement est vérifié par son empreinte SHA-512 publiée avec la release.'}
          </p>
        </div>
        <div className="setting-actions">
          <button type="button" className="action primary" onClick={run} disabled={busy}>
            <Icon name={downloaded ? 'download' : 'reload'} size={15} />
            {busy ? 'En cours…' : actionLabel}
          </button>
          <button type="button" className="action ghost" onClick={() => void openReleases()}>
            <Icon name="external" size={14} />
            Releases
          </button>
        </div>
      </div>

      {platform === 'linux' && (
        <div className="update-channel">
          <div className="update-channel-head">
            <Icon name={isAppImage ? 'download' : 'shield'} size={15} />
            <strong>
              {isAppImage ? 'Lancement depuis une AppImage' : 'Lancement hors AppImage'}
            </strong>
            <span className="tag">
              {isAppImage
                ? update?.appImageWritable
                  ? 'Inscriptible'
                  : 'Lecture seule'
                : 'Paquet'}
            </span>
          </div>
          {isAppImage ? (
            <p className="setting-hint">
              Fichier : <code>{update?.appImagePath}</code>
              <br />
              {update?.appImageWritable
                ? 'La nouvelle AppImage remplace ce fichier, puis Vela redémarre.'
                : 'Le dossier est protégé : Vela télécharge l’AppImage vérifiée et l’affiche pour un remplacement manuel.'}
            </p>
          ) : (
            <p className="setting-hint">
              La mise à jour automatique ne concerne que l’AppImage. Depuis un paquet .deb, Vela
              télécharge l’AppImage vérifiée et l’affiche : utilisez-la à la place du paquet, ou
              réinstallez le .deb depuis la page Releases.
            </p>
          )}
        </div>
      )}

      {platform !== 'linux' && update?.state === 'error' && (
        <div className="glass-note">
          <Icon name="shield" size={14} />
          <span>{update.message ?? 'Vérification impossible.'}</span>
        </div>
      )}
    </section>
  )
}
