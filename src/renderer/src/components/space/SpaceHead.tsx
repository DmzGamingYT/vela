import { Icon } from '../Icon'

interface SpaceHeadProps {
  existingName: string | null
  onClose(): void
}

/** En-tête du dialogue : titre, rappel de l’isolation et croix de fermeture. */
export default function SpaceHead({ existingName, onClose }: SpaceHeadProps) {
  return (
    <header className="space-dialog-head">
      <div>
        <p className="eyebrow">
          <span className="eyebrow-dot" />
          {existingName ? 'Modifier le profil' : 'Nouveau profil'}
        </p>
        <h2>{existingName ?? 'Un profil à vous.'}</h2>
        <p className="sheet-lede">
          Ses cookies et ses sessions restent à lui : deux comptes sur le même site, sans conflit.
        </p>
      </div>
      <button
        type="button"
        className="icon-btn"
        onClick={onClose}
        title="Fermer"
        aria-label="Fermer"
      >
        <Icon name="close" size={18} />
      </button>
    </header>
  )
}
