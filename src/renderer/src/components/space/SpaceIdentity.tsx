import type { RefObject } from 'react'
import { MAX_SPACE_NAME } from '@shared/space'
import SpacePortrait from './SpacePortrait'
import type { AvatarSource } from './spaceParts'

const NAME_SUGGESTIONS = ['Travail', 'Veille', 'Études']

interface SpaceIdentityProps {
  name: string
  onName(value: string): void
  onBlur(): void
  onSuggestion(value: string): void
  nameProblem: 'empty' | 'duplicate' | 'too-long' | null
  suggestedName: string
  inputRef: RefObject<HTMLInputElement | null>
  portrait: {
    color: string
    avatar: string | null
    monogram: string
    storedImage: string | null
    photo: string | null
    photoError: string | null
    avatarSource: AvatarSource
    onSource(value: AvatarSource): void
    onAvatar(value: string): void
    fileRef: RefObject<HTMLInputElement | null>
    onImport(file: File | undefined): void
    onRemovePhoto(): void
    onEditPhoto(image: string): void
  }
}

/** Identité de l’espace : le portrait, le nom, et rien d’autre en tête. */
export default function SpaceIdentity({
  name,
  onName,
  onBlur,
  onSuggestion,
  nameProblem,
  suggestedName,
  inputRef,
  portrait
}: SpaceIdentityProps) {
  return (
    <section className="space-section space-identity">
      <SpacePortrait name={name || suggestedName} {...portrait} />

      <div className="space-identity-main">
        <label className="space-identity-label" htmlFor="space-name-input">
          Nom du profil
        </label>
        <input
          ref={inputRef}
          id="space-name-input"
          className="space-name-input"
          value={name}
          maxLength={MAX_SPACE_NAME}
          placeholder={suggestedName}
          aria-invalid={nameProblem ? 'true' : undefined}
          aria-describedby={nameProblem ? 'space-name-problem' : 'space-name-help'}
          onChange={(event) => onName(event.target.value.slice(0, MAX_SPACE_NAME))}
          onBlur={onBlur}
        />
        <div className="space-identity-meta">
          <span id="space-name-help">
            {name.length >= MAX_SPACE_NAME
              ? `Limite de ${MAX_SPACE_NAME} caractères atteinte.`
              : 'Court et reconnaissable — il vit dans le rail'}
          </span>
          <span className="space-counter" aria-hidden="true">
            {name.length}/{MAX_SPACE_NAME}
          </span>
        </div>

        {nameProblem ? (
          <p className="space-error" id="space-name-problem" role="alert">
            {nameProblem === 'empty'
              ? 'Donnez un nom à ce profil.'
              : nameProblem === 'duplicate'
                ? 'Ce nom est déjà utilisé par un autre profil.'
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
        ) : null}

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
      </div>
    </section>
  )
}
