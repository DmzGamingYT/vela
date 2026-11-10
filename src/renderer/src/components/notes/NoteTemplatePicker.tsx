import { useEffect } from 'react'
import { Icon } from '../Icon'
import { NOTE_TEMPLATES, type NoteTemplate } from './templates'

interface NoteTemplatePickerProps {
  onPick(template: NoteTemplate | null): void
  /** Garde la page ouverte comme point de départ, source comprise. */
  onCapture(): void
  /** Ouvre une note vierge puis l'enregistreur vocal. */
  onDictate(): void
  onClose(): void
}

/**
 * Le menu « Nouvelle note » : une liste, pas une fenêtre.
 *
 * Pas d'en-tête qui répète le titre du bouton, pas de bouton « Annuler » —
 * Échap et le clic extérieur ferment. Chaque ligne porte sa touche :
 * ⌘N pour la page blanche, 2 à 4 pour les modèles.
 */
export default function NoteTemplatePicker({
  onPick,
  onCapture,
  onDictate,
  onClose
}: NoteTemplatePickerProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === '1' || event.key === 'n') {
        event.preventDefault()
        onPick(null)
        return
      }
      const index = Number(event.key) - 2
      const template = NOTE_TEMPLATES[index]
      if (template) {
        event.preventDefault()
        onPick(template)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onPick, onClose])

  return (
    <div className="notes-templates-layer">
      <button
        type="button"
        className="notes-templates-scrim"
        aria-label="Fermer le choix du modèle"
        onClick={onClose}
      />
      <div className="notes-templates" role="menu" aria-label="Nouvelle note">
        <div className="note-template-list">
          <button
            type="button"
            role="menuitem"
            className="note-template-option"
            autoFocus
            onClick={() => onPick(null)}
          >
            <span className="note-template-mark">
              <Icon name="notes" size={14} />
            </span>
            <span>
              <strong>Page blanche</strong>
              <small>Commencer sans structure</small>
            </span>
            <kbd className="note-template-key">⌘N</kbd>
          </button>

          {NOTE_TEMPLATES.map((template, index) => (
            <button
              key={template.id}
              type="button"
              role="menuitem"
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
              <kbd className="note-template-key">{index + 2}</kbd>
            </button>
          ))}

          <div className="note-template-sep" role="separator" />

          <button
            type="button"
            role="menuitem"
            className="note-template-option"
            onClick={onCapture}
          >
            <span className="note-template-mark">
              <Icon name="globe" size={14} />
            </span>
            <span>
              <strong>Depuis la page ouverte</strong>
              <small>Garder la page, sa source et sa date</small>
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            className="note-template-option"
            onClick={onDictate}
          >
            <span className="note-template-mark">
              <Icon name="mic" size={14} />
            </span>
            <span>
              <strong>Dicter une note</strong>
              <small>Enregistrer la voix, puis transcrire</small>
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
