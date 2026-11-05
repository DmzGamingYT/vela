/**
 * En-tête de la barre latérale.
 *
 * Il ne porte plus que le wordmark : la marque vit ailleurs (À propos,
 * onboarding), et cette ligne sert de zone de déplacement à la fenêtre. Le nom
 * est décoratif — le titre de la fenêtre (« Vela ») suffit aux lecteurs
 * d'écran —, donc il ne prend ni focus ni rôle interactif.
 */
export default function SidebarHeader() {
  return (
    <header className="sidebar-top drag">
      <span className="wordmark" aria-hidden="true">
        Vela<span className="wordmark-dot">.</span>
      </span>
    </header>
  )
}
