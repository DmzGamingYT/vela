import { useEffect, useState } from 'react'
import {
  EXTENSION_CATEGORIES,
  EXTENSION_SUGGESTIONS,
  storeUrl,
  type InstalledExtension
} from '@shared/extensions'
import { useBrowser } from '../../store/browser'
import { Icon } from '../Icon'

/**
 * Les extensions réellement chargées, avec leur icône et un interrupteur.
 *
 * Azimut ne télécharge pas d'extension : on décompresse celle du Chrome Web
 * Store, on choisit son dossier, et elle rejoint chaque session d'espace.
 * Désactiver la retire de Chromium — ce n'est pas une case grisée.
 */
export default function ExtensionsPage() {
  const newTab = useBrowser((state) => state.newTab)
  const setOverlay = useBrowser((state) => state.setOverlay)
  const toast = useBrowser((state) => state.toast)
  const [installed, setInstalled] = useState<InstalledExtension[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    void window.vela.extensions
      .list()
      .then(setInstalled)
      .catch(() => setInstalled([]))
  }, [])

  const open = (query: string): void => {
    newTab(storeUrl(query))
    setOverlay(null)
  }

  const install = async (): Promise<void> => {
    setBusy('install')
    try {
      const result = await window.vela.extensions.install()
      setInstalled(result.extensions)
      if (result.error) toast(result.error, 'error')
      else if (result.extensions.length) toast('Extension ajoutée')
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : 'Installation impossible', 'error')
    } finally {
      setBusy(null)
    }
  }

  const toggle = async (entry: InstalledExtension): Promise<void> => {
    setBusy(entry.id)
    try {
      const result = await window.vela.extensions.toggle(entry.id, !entry.enabled)
      setInstalled(result.extensions)
      if (result.error) toast(result.error, 'error')
      else toast(entry.enabled ? `${entry.name} désactivée` : `${entry.name} activée`)
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : 'Changement impossible', 'error')
    } finally {
      setBusy(null)
    }
  }

  const remove = async (entry: InstalledExtension): Promise<void> => {
    setBusy(entry.id)
    try {
      setInstalled(await window.vela.extensions.remove(entry.id))
      toast(`${entry.name} retirée`)
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : 'Retrait impossible', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="appearance-page extensions-page">
      <section className="appearance-section ext-intro">
        <h3 className="appearance-sub-title">Vos extensions, chargées par Azimut</h3>
        <p className="appearance-note">
          Azimut s’appuie sur Chromium et charge les extensions décompressées. Choisissez le dossier
          qui contient <code>manifest.json</code> : elle rejoint tous vos espaces, et l’interrupteur
          la retire vraiment du navigateur.
        </p>
        <div className="ext-install-line">
          <button
            type="button"
            className="action primary"
            onClick={() => void install()}
            disabled={busy === 'install'}
          >
            <Icon name="plus" size={13} />
            {busy === 'install' ? 'Lecture du dossier…' : 'Installer un dossier'}
          </button>
          <span className="ext-hint">
            Un dossier décompressé suffit ; Azimut ne télécharge rien à votre place.
          </span>
        </div>
      </section>

      <section className="appearance-section">
        <div className="ext-head">
          <h3 className="appearance-sub-title">Installées</h3>
          <span className="ext-hint">
            {installed.length === 0 ? 'Aucune pour l’instant' : `${installed.length}`}
          </span>
        </div>

        {installed.length === 0 ? (
          <p className="setting-hint">
            Rien n’est encore chargé. Une extension du Chrome Web Store se décompresse dans un
            dossier, puis s’ajoute ici — elle apparaît ensuite dans les pages, comme dans Chrome.
          </p>
        ) : (
          <ul className="ext-installed">
            {installed.map((entry) => (
              <li className="ext-row" key={entry.id} data-off={!entry.enabled}>
                <span className="ext-row-icon" aria-hidden="true">
                  {entry.icon ? <img src={entry.icon} alt="" width={28} height={28} /> : entry.name.slice(0, 1)}
                </span>
                <div className="ext-row-copy">
                  <strong>
                    {entry.name}
                    {entry.version && <span className="ext-version">{entry.version}</span>}
                  </strong>
                  <span className="ext-row-description">
                    {entry.description || entry.path}
                  </span>
                </div>
                <button
                  type="button"
                  className="switch"
                  role="switch"
                  aria-checked={entry.enabled}
                  aria-label={`${entry.enabled ? 'Désactiver' : 'Activer'} ${entry.name}`}
                  data-on={entry.enabled}
                  disabled={busy === entry.id}
                  onClick={() => void toggle(entry)}
                >
                  <span />
                </button>
                <button
                  type="button"
                  className="action ghost danger"
                  onClick={() => void remove(entry)}
                  disabled={busy === entry.id}
                  title="Retirer"
                  aria-label={`Retirer ${entry.name}`}
                >
                  <Icon name="trash" size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {EXTENSION_CATEGORIES.map((category) => {
        const items = EXTENSION_SUGGESTIONS.filter((entry) => entry.category === category.id)
        if (items.length === 0) return null
        return (
          <section className="appearance-section" key={category.id}>
            <div className="ext-head">
              <h3 className="appearance-sub-title">{category.label}</h3>
              <span className="ext-hint">{category.hint}</span>
            </div>
            <div className="ext-grid">
              {items.map((entry) => (
                <article className="ext-card" key={entry.id}>
                  <span className="ext-mark" aria-hidden="true">
                    {entry.name.slice(0, 1)}
                  </span>
                  <div className="ext-copy">
                    <strong>{entry.name}</strong>
                    <span>{entry.vendor}</span>
                    <p>{entry.blurb}</p>
                  </div>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => open(entry.query)}
                    title={`Chercher ${entry.name} sur le Chrome Web Store`}
                  >
                    Chrome Web Store
                  </button>
                </article>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
