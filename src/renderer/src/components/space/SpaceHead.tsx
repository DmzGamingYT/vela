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
          {existingName ? 'Modifier l’espace' : 'Nouvel espace'}
        </p>
        <h1>{existingName ?? 'Un espace à part'}</h1>
        <p className="sheet-lede">
          Un espace garde ses propres cookies et sessions : deux comptes sur le même site, sans
          conflit.
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
