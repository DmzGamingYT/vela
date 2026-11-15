import { Boussole } from '../Boussole'

/**
 * En-tête de la barre latérale.
 *
 * Le wordmark, précédé de la marque de l'app : la boussole, teintée selon le
 * mode (jour / nuit) par `82-boussole.css`. Les deux sont décoratifs — le
 * titre de la fenêtre (« Azimut ») suffit aux lecteurs d'écran —, et la ligne
 * entière reste une zone de déplacement de la fenêtre.
 *
 * Le dessin est celui des maîtres d'icône (`build/boussole-light.svg` et
 * `-dark.svg`) : la marque est la vraie icône, pas un redessin.
 */
export default function SidebarHeader() {
  return (
    <header className="sidebar-top drag">
      <span className="wordmark-mark" aria-hidden="true">
        <Boussole size={18} />
      </span>
      <span className="wordmark" aria-hidden="true">
        Azimut<span className="wordmark-dot">.</span>
      </span>
    </header>
  )
}
