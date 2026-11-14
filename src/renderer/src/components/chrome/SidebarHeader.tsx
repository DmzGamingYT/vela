/**
 * En-tête de la barre latérale.
 *
 * Le wordmark, précédé de la marque de l’app : la miniature de l’icône, tuile
 * papier et barque corail. Les deux sont décoratifs — le titre de la fenêtre
 * (« Vela ») suffit aux lecteurs d’écran —, et la ligne entière reste une zone
 * de déplacement de la fenêtre.
 *
 * Les tracés sont ceux du maître petites tailles (`build/icon-safari-small.svg`) :
 * la marque est la vraie icône, pas un redessin.
 */
export default function SidebarHeader() {
  return (
    <header className="sidebar-top drag">
      <span className="wordmark-mark" aria-hidden="true">
        <svg viewBox="0 0 1024 1024" width="18" height="18" focusable="false">
          <rect width="1024" height="1024" rx="235" fill="#F7F6F2" />
          <path d="M386 168 C 508 300 600 462 648 612 H386 Z" fill="#E8805A" />
          <path d="M306 636 H732 L664 736 C 606 756 392 756 334 736 Z" fill="#131512" />
          <rect x="346" y="792" width="344" height="34" rx="17" fill="#E8805A" opacity="0.8" />
        </svg>
      </span>
      <span className="wordmark" aria-hidden="true">
        Vela<span className="wordmark-dot">.</span>
      </span>
    </header>
  )
}
