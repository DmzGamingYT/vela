import { Icon } from '../Icon'
import { NOTE_TEMPLATES, type NoteTemplate } from './templates'

interface NoteTemplatePickerProps {
  onPick(template: NoteTemplate | null): void
  onClose(): void
}

/** Choix du point de départ : page blanche ou modèle prêt à remplir. */
export default function NoteTemplatePicker({ onPick, onClose }: NoteTemplatePickerProps) {
  return (
    <div className="notes-templates-layer">
      <button
        type="button"
        className="notes-templates-scrim"
        aria-label="Fermer le choix du modèle"
        onClick={onClose}
      />
      <div className="notes-templates" role="dialog" aria-label="Créer une note">
        <div className="notes-templates-head">
          <span className="notes-mark">
            <Icon name="plus" size={14} />
          </span>
          <div>
            <h3>Nouvelle note</h3>
            <p>Une page blanche, ou un modèle prêt à remplir.</p>
          </div>
        </div>
        <div className="note-template-list">
          <button
            type="button"
            className="note-template-option"
            autoFocus
            onClick={() => onPick(null)}
          >
            <span className="note-template-mark">
              <Icon name="plus" size={14} />
            </span>
            <span>
              <strong>Page blanche</strong>
              <small>Commencer sans structure</small>
            </span>
          </button>
          {NOTE_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              className="note-template-option"
              onClick={() => onPick(template)}
            >
              <span className="note-template-mark">
                <Icon name={template.icon} size={14} />
              </span>
              <span>
                <strong>{template.label}</strong>
                <small>{template.hint}</small>
              </span>
            </button>
          ))}
        </div>
        <button type="button" className="notes-templates-cancel" onClick={onClose}>
          Annuler
        </button>
      </div>
    </div>
  )
}
