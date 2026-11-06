import type { RefObject } from 'react'
import { MAX_SPACE_NAME } from '@shared/space'
import { SectionTitle } from './spaceParts'

const NAME_SUGGESTIONS = ['Travail', 'Veille', 'Études']

interface SpaceNameSectionProps {
  name: string
  onName(value: string): void
  onBlur(): void
  onSuggestion(value: string): void
  nameProblem: 'empty' | 'duplicate' | 'too-long' | null
  suggestedName: string
  inputRef: RefObject<HTMLInputElement | null>
}

/** Section 1 : le nom, son compteur et les noms suggérés. */
export default function SpaceNameSection({
  name,
  onName,
  onBlur,
  onSuggestion,
  nameProblem,
  suggestedName,
  inputRef
}: SpaceNameSectionProps) {
  return (
    <section className="space-section">
      <SectionTitle index={1} title="Nom" />
      <label className="field space-name-field">
        <span className="sr-only">Nom de l’espace</span>
        <input
          ref={inputRef}
          className="space-name-input"
          value={name}
          maxLength={MAX_SPACE_NAME}
          placeholder={suggestedName}
          aria-invalid={nameProblem ? 'true' : undefined}
          aria-describedby={nameProblem ? 'space-name-problem' : 'space-name-help'}
          onChange={(event) => onName(event.target.value.slice(0, MAX_SPACE_NAME))}
          onBlur={onBlur}
        />
        <span className="space-counter" aria-hidden="true">
          {name.length}/{MAX_SPACE_NAME}
        </span>
      </label>
      {nameProblem ? (
        <p className="space-error" id="space-name-problem" role="alert">
          {nameProblem === 'empty'
            ? 'Donnez un nom à cet espace.'
            : nameProblem === 'duplicate'
              ? 'Ce nom est déjà utilisé par un autre espace.'
              : `${MAX_SPACE_NAME} caractères au maximum.`}
          {nameProblem === 'empty' ? (
            <button
              type="button"
              className="space-inline-link"
              onClick={() => onSuggestion(suggestedName)}
            >
              Utiliser « {suggestedName} »
            </button>
          ) : null}
        </p>
      ) : (
        <p className="space-help" id="space-name-help">
          {name.length >= MAX_SPACE_NAME
            ? `Limite de ${MAX_SPACE_NAME} caractères atteinte.`
            : 'Court et reconnaissable : il apparaît dans le rail et l’aperçu.'}
        </p>
      )}
      <div className="space-suggestions" aria-label="Noms suggérés">
        {NAME_SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="space-suggestion"
            onClick={() => onSuggestion(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </section>
  )
}
