import { Icon } from '../Icon'

interface SpaceFooterProps {
  existingName: string | null
  color: string
  summary: string
  saving: boolean
  letterboxdError: string | null
  discardOpen: boolean
  onKeepEditing(): void
  onDiscard(): void
  onClose(): void
}

/** Bandeau d’abandon et pied du formulaire : résumé, annulation, validation. */
export default function SpaceFooter({
  existingName,
  color,
  summary,
  saving,
  letterboxdError,
  discardOpen,
  onKeepEditing,
  onDiscard,
  onClose
}: SpaceFooterProps) {
  return (
    <div className="space-foot-wrap">
      {discardOpen ? (
        <div
          className="space-discard"
          role="alertdialog"
          aria-label="Abandonner les modifications ?"
        >
          <span>Des modifications ne sont pas enregistrées.</span>
          <div className="space-discard-actions">
            <button type="button" className="space-small-btn" onClick={onKeepEditing}>
              Continuer l’édition
            </button>
            <button
              type="button"
              className="space-small-btn space-small-danger"
              onClick={onDiscard}
            >
              Abandonner
            </button>
          </div>
        </div>
      ) : null}
      <footer className="space-foot-v2">
        <p className="space-summary" aria-label="Résumé du profil">
          <i style={{ background: color }} aria-hidden="true" />
          {summary}
        </p>
        <div className="dialog-actions">
          <button type="button" className="action" onClick={onClose}>
            Annuler
          </button>
          <button
            type="submit"
            className="action primary"
            disabled={saving || Boolean(letterboxdError)}
          >
            <Icon name={existingName ? 'check' : 'plus'} size={14} />
            {existingName ? 'Enregistrer' : 'Créer le profil'}
            <kbd className="space-kbd">⌘↵</kbd>
          </button>
        </div>
      </footer>
    </div>
  )
}
