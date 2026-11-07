import { useBrowser } from '../store/browser'
import { Icon } from './Icon'

/**
 * Barre d’état : seulement le zoom quand il a bougé. Les mises à jour vivent
 * dans leur section de réglages — ni annonce flottante, ni téléchargement
 * rappelé ici — et les téléchargements dans la barre du haut.
 *
 * Le compteur de requêtes bloquées n’est pas ici : le bouclier du volet le
 * porte déjà, page par page, et un second compteur global en bas faisait
 * doublon sans rien apprendre de plus.
 */
export default function StatusBar() {
  const view = useBrowser((s) => s.view)
  const zoomNotice = useBrowser((s) => s.zoomNotice)
  const zoom = useBrowser((s) => s.zoom)

  if (!view || zoomNotice === null) return null

  return (
    <div className="statusbar statusbar-compact" role="status" aria-label="Barre de statut">
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
    </div>
  )
}
