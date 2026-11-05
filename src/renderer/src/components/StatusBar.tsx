import { useEffect, useReducer, useRef } from 'react'
import {
  RELEASE_NOTES_PLACEHOLDER,
  reduceStatusBar,
  statusBarView,
  type StatusBarUi
} from '@shared/statusBar'
import { useBrowser } from '../store/browser'
import { Icon } from './Icon'

/** « Plus tard » ne vaut que pour la session : la barre revient au lancement suivant. */
const LATER_KEY = 'vela.update.later'
/** Ancienne clé persistante : elle masquait une version pour toujours. */
const LEGACY_KEY = 'vela.update.dismissed'

function readLater(): string | null {
  try {
    return sessionStorage.getItem(LATER_KEY)
  } catch {
    return null
  }
}

function rememberLater(version: string): void {
  try {
    sessionStorage.setItem(LATER_KEY, version)
  } catch {
    /* stockage indisponible : l’annonce revient simplement au prochain rendu */
  }
}

/**
 * Barre d’état : la mise à jour à droite, le zoom et les téléchargements
 * quand ils ont quelque chose à dire. Rien à signaler → aucune barre.
 *
 * Le compteur de requêtes bloquées n’est pas ici : le bouclier du volet le
 * porte déjà, page par page, et un second compteur global en bas faisait
 * doublon sans rien apprendre de plus.
 */
export default function StatusBar() {
  const view = useBrowser((s) => s.view)
  const setOverlay = useBrowser((s) => s.setOverlay)
  const update = useBrowser((s) => s.update)
  const installUpdate = useBrowser((s) => s.installUpdate)
  const downloadUpdate = useBrowser((s) => s.downloadUpdate)
  const cancelUpdate = useBrowser((s) => s.cancelUpdate)
  const openReleases = useBrowser((s) => s.openReleases)
  const zoomNotice = useBrowser((s) => s.zoomNotice)
  const zoom = useBrowser((s) => s.zoom)

  const [ui, dispatch] = useReducer(reduceStatusBar, {
    detailOpen: false,
    laterVersion: readLater()
  } satisfies StatusBarUi)
  const zoneRef = useRef<HTMLButtonElement>(null)
  const detailRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_KEY)
    } catch {
      /* stockage indisponible */
    }
  }, [])

  useEffect(() => {
    if (!ui.detailOpen) return
    detailRef.current?.focus()
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      dispatch({ type: 'close' })
      zoneRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [ui.detailOpen])

  if (!view) return null

  const model = statusBarView(update, window.vela.platform, ui)
  const downloads = view.downloads.length

  const later = (): void => {
    const version = update?.version ?? ''
    rememberLater(version)
    dispatch({ type: 'later', version })
  }

  if (!model) {
    // « Plus tard » et « Annuler » retirent toute la barre : elle revient au
    // prochain lancement.
    const deferred =
      update?.state === 'cancelled' ||
      (update?.state === 'downloaded' && ui.laterVersion === (update.version ?? ''))
    if (deferred) return null
    if (downloads === 0 && zoomNotice === null) return null
    return (
      <div className="statusbar statusbar-compact" role="status" aria-label="Barre de statut">
        {zoomNotice !== null && (
          <button
            type="button"
            className="statusbar-utility"
            onClick={() => void zoom('reset')}
            title="Zoom de la page — cliquer pour revenir à 100 %"
            aria-label={`Zoom ${zoomNotice} pour cent, revenir à 100 %`}
          >
            <Icon name="search" size={15} />
            <span>{zoomNotice} %</span>
          </button>
        )}
        {downloads > 0 && (
          <button
            type="button"
            className="statusbar-utility"
            onClick={() => setOverlay('downloads')}
            aria-label={`${downloads} téléchargement${downloads > 1 ? 's' : ''}, voir la liste`}
          >
            <Icon name="download" size={15} />
            <span>{downloads}</span>
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="statusbar" role="status" aria-label="Barre de statut">
      {(model.phase === 'ready' || model.phase === 'detail') && (
        <div className="statusbar-update">
          <button
            ref={zoneRef}
            type="button"
            className="statusbar-update-zone"
            onClick={() => dispatch({ type: ui.detailOpen ? 'close' : 'open' })}
            aria-expanded={ui.detailOpen}
            aria-controls="statusbar-update-detail"
          >
            <Icon name="download" size={18} />
            <span className="statusbar-update-label">{model.readyLabel}</span>
          </button>
          <button
            type="button"
            className="statusbar-primary"
            onClick={() => void installUpdate()}
          >
            {model.installLabel}
          </button>
          <button
            type="button"
            className="statusbar-icon-btn"
            onClick={later}
            aria-label="Plus tard"
            title="Plus tard"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      {model.phase === 'downloading' && (
        <div className="statusbar-update">
          <span className="statusbar-download-label">
            <Icon name="download" size={17} />
            <span>{model.downloadingLabel}</span>
          </span>
          <div
            className="statusbar-progress"
            role="progressbar"
            aria-label="Progression du téléchargement"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={model.progress}
            title={`${model.progress} %`}
          >
            <span style={{ width: `${model.progress}%` }} />
          </div>
          <button type="button" className="statusbar-text-btn" onClick={() => void cancelUpdate()}>
            Annuler
          </button>
        </div>
      )}

      {model.phase === 'error' && (
        <div className="statusbar-update statusbar-error" role="alert">
          <Icon name="warning" size={18} />
          <span className="statusbar-error-message" title={model.error}>
            {model.error}
          </span>
          <button type="button" className="statusbar-text-btn" onClick={() => void downloadUpdate()}>
            Réessayer
          </button>
        </div>
      )}

      {model.phase === 'detail' && (
        <div
          ref={detailRef}
          id="statusbar-update-detail"
          className="statusbar-detail"
          role="dialog"
          aria-labelledby="statusbar-detail-title"
          tabIndex={-1}
        >
          <p className="statusbar-eyebrow">MISE À JOUR</p>
          <h2 id="statusbar-detail-title">{model.detailTitle}</h2>
          <p className="statusbar-summary">{RELEASE_NOTES_PLACEHOLDER}</p>
          <button
            type="button"
            className="statusbar-primary statusbar-primary-wide"
            onClick={() => void installUpdate()}
          >
            {model.installLabel}
          </button>
          <button type="button" className="statusbar-secondary" onClick={later}>
            Plus tard
          </button>
          <a
            className="statusbar-link"
            href={update?.releaseUrl ?? ''}
            onClick={(event) => {
              event.preventDefault()
              void openReleases()
            }}
          >
            Notes de version <span aria-hidden="true">→</span>
          </a>
        </div>
      )}
    </div>
  )
}
