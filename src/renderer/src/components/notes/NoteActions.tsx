import { Icon } from '../Icon'

interface NoteActionsProps {
  /** Variante affichée dans la surface de départ, quand aucune note n'existe. */
  inEmpty?: boolean
  hasPage: boolean
  generating: boolean
  busy: boolean
  onNew(): void
  onGenerate(): void
  onCapture(): void
  onSelect(): void
  onHighlight(): void
}

/** Les cinq façons de créer une note, partagées par la liste et l'état vide. */
export default function NoteActions({
  inEmpty = false,
  hasPage,
  generating,
  busy,
  onNew,
  onGenerate,
  onCapture,
  onSelect,
  onHighlight
}: NoteActionsProps) {
  return (
    <div className={inEmpty ? 'notes-actions is-empty' : 'notes-actions'}>
      <button type="button" className="action primary" onClick={onNew}>
        <Icon name="plus" size={14} />
        Nouvelle note
      </button>
      <button
        type="button"
        className="action"
        onClick={() => {
          if (!hasPage || busy) return
          onGenerate()
        }}
        // `aria-disabled` plutôt que `disabled` : un bouton réellement
        // désactivé ne montre pas son info-bulle et sort du clavier.
        aria-disabled={busy || !hasPage}
        title={
          !hasPage
            ? 'Ouvrez une page pour la synthèse'
            : busy
              ? 'Une rédaction est déjà en cours'
              : 'Lire la page et rédiger une note structurée'
        }
      >
        <Icon name="sparkles" size={13} />
        {generating ? 'Génération…' : 'Note IA'}
      </button>
      <button
        type="button"
        className="action"
        onClick={() => {
          if (!hasPage) return
          onCapture()
        }}
        aria-disabled={!hasPage}
        title={hasPage ? 'Garder le texte de la page affichée' : 'Ouvrez une page pour la capturer'}
      >
        <Icon name="globe" size={13} />
        Page
      </button>
      <button
        type="button"
        className="action"
        onClick={() => {
          if (!hasPage) return
          onSelect()
        }}
        aria-disabled={!hasPage}
        title={
          hasPage
            ? 'Garder le passage sélectionné, avec sa source et sa date'
            : 'Ouvrez une page, sélectionnez un passage'
        }
      >
        <Icon name="copy" size={13} />
        Sélection
      </button>
      <button
        type="button"
        className="action"
        onClick={() => {
          if (!hasPage) return
          onHighlight()
        }}
        aria-disabled={!hasPage}
        title={
          hasPage
            ? 'Surligner le passage sélectionné et l’ajouter à la note de la page'
            : 'Ouvrez une page, sélectionnez un passage'
        }
      >
        <Icon name="edit" size={13} />
        Surligner
      </button>
    </div>
  )
}
