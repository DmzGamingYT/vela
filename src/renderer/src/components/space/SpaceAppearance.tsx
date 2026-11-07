import type { CSSProperties, RefObject } from 'react'
import { GALLERY_AVATARS } from '@shared/avatarGallery'
import { SPACE_TINTS } from '@shared/defaults'
import {
  SPACE_AVATARS,
  SPACE_BACKGROUNDS,
  type SpaceBackground
} from '@shared/space'
import GalleryAvatar from './GalleryAvatar'
import { Icon } from '../Icon'
import { rovingKeyDown, SectionTitle, type AvatarSource } from './spaceParts'

const AVATAR_SOURCES: { id: AvatarSource; label: string }[] = [
  { id: 'monogram', label: 'Initiales' },
  { id: 'icons', label: 'Formes' },
  { id: 'gallery', label: 'Galerie' },
  { id: 'photo', label: 'Photo' }
]

interface SpaceAppearanceProps {
  avatarSource: AvatarSource
  onSource(value: AvatarSource): void
  avatar: string | null
  onAvatar(value: string): void
  color: string
  monogram: string
  storedImage: string | null
  photo: string | null
  photoError: string | null
  fileRef: RefObject<HTMLInputElement | null>
  onImport(file: File | undefined): void
  onRemovePhoto(): void
  onEditPhoto(image: string): void
  tint: { label: string } | null
  tintError: string | null
  tintNotice: string | null
  customOpen: boolean
  customInput: string
  onCustomInput(value: string): void
  onToggleCustom(): void
  onCommitTint(raw: string): void
  onTint(color: string): void
  background: SpaceBackground
  onBackground(id: SpaceBackground): void
}

/** Section 3 : avatar, teinte et ambiance de l’espace. */
export default function SpaceAppearance({
  avatarSource,
  onSource,
  avatar,
  onAvatar,
  color,
  monogram,
  storedImage,
  photo,
  photoError,
  fileRef,
  onImport,
  onRemovePhoto,
  onEditPhoto,
  tint,
  tintError,
  tintNotice,
  customOpen,
  customInput,
  onCustomInput,
  onToggleCustom,
  onCommitTint,
  onTint,
  background,
  onBackground
}: SpaceAppearanceProps) {
  return (
    <section className="space-section">
      <SectionTitle index={3} title="Apparence" />
      <div className="space-avatar-tabs" role="tablist" aria-label="Source de l’avatar">
        {AVATAR_SOURCES.map((source) => (
          <button
            key={source.id}
            type="button"
            role="tab"
            id={`space-avatar-tab-${source.id}`}
            aria-selected={avatarSource === source.id}
            aria-controls={`space-avatar-panel-${source.id}`}
            tabIndex={avatarSource === source.id ? 0 : -1}
            className="space-avatar-tab"
            data-active={avatarSource === source.id ? 'true' : undefined}
            onClick={() => onSource(source.id)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
              event.preventDefault()
              const index = AVATAR_SOURCES.findIndex((item) => item.id === avatarSource)
              const step = event.key === 'ArrowRight' ? 1 : -1
              const next = (index + step + AVATAR_SOURCES.length) % AVATAR_SOURCES.length
              onSource(AVATAR_SOURCES[next].id)
              document.getElementById(`space-avatar-tab-${AVATAR_SOURCES[next].id}`)?.focus()
            }}
          >
            {source.label}
          </button>
        ))}
      </div>

      <div
        className="space-avatar-panel"
        id={`space-avatar-panel-${avatarSource}`}
        role="tabpanel"
        aria-labelledby={`space-avatar-tab-${avatarSource}`}
      >
        {avatarSource === 'monogram' ? (
          <button
            type="button"
            role="radio"
            aria-checked={!avatar || avatar === 'monogram'}
            tabIndex={0}
            className="space-avatar-option space-avatar-monogram"
            data-active={!avatar || avatar === 'monogram' ? 'true' : undefined}
            onClick={() => onAvatar('monogram')}
          >
            <span className="space-monogram" style={{ background: color }}>
              {monogram}
            </span>
            <span className="space-avatar-copy">
              <strong>Initiales</strong>
              <small>La première lettre du nom, sur la teinte choisie</small>
            </span>
            <span className="space-check" aria-hidden="true">
              <Icon name="check" size={11} />
            </span>
          </button>
        ) : null}

        {avatarSource === 'icons' ? (
          <div
            className="space-avatar-grid"
            role="radiogroup"
            aria-label="Formes d’avatar"
            data-columns="8"
            onKeyDown={rovingKeyDown}
          >
            {SPACE_AVATARS.map((mark, index) => {
              const active = avatar === `icon:${mark.id}`
              return (
                <button
                  key={mark.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={mark.label}
                  title={mark.label}
                  tabIndex={active || (!avatar && index === 0) ? 0 : -1}
                  className="space-avatar-choice"
                  data-active={active ? 'true' : undefined}
                  onClick={() => onAvatar(`icon:${mark.id}`)}
                >
                  <svg viewBox="0 0 24 24" width={17} height={17} aria-hidden="true">
                    <path
                      d={mark.path}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.7}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="space-check" aria-hidden="true">
                    <Icon name="check" size={9} />
                  </span>
                </button>
              )
            })}
          </div>
        ) : null}

        {avatarSource === 'gallery' ? (
          <div
            className="space-avatar-grid space-avatar-gallery"
            role="radiogroup"
            aria-label="Avatars de la galerie"
            data-columns="8"
            onKeyDown={rovingKeyDown}
          >
            {GALLERY_AVATARS.map((entry) => {
              const active = avatar === `gallery:${entry.id}`
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={entry.label}
                  title={entry.label}
                  tabIndex={active ? 0 : -1}
                  className="space-avatar-choice"
                  data-active={active ? 'true' : undefined}
                  onClick={() => onAvatar(`gallery:${entry.id}`)}
                >
                  <GalleryAvatar id={entry.id} initial={monogram} size={28} />
                  <span className="space-check" aria-hidden="true">
                    <Icon name="check" size={9} />
                  </span>
                </button>
              )
            })}
          </div>
        ) : null}

        {avatarSource === 'photo' ? (
          <div className="space-photo">
            <div
              className="space-photo-drop"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                onImport(event.dataTransfer.files?.[0])
              }}
            >
              <span className="space-photo-preview" data-empty={storedImage ? undefined : 'true'}>
                {storedImage ? (
                  <img src={storedImage} alt="Photo de profil de l’espace" />
                ) : (
                  <Icon name="image" size={20} />
                )}
              </span>
              <span className="space-avatar-copy">
                <strong>{storedImage ? 'Photo importée' : 'Déposez une photo'}</strong>
                <small>PNG, JPEG ou WebP, 8 Mo au plus — recadrée en carré</small>
              </span>
              <button type="button" className="space-small-btn" onClick={() => fileRef.current?.click()}>
                <Icon name="image" size={12} />
                {storedImage ? 'Remplacer' : 'Importer'}
              </button>
            </div>
            {storedImage && !photo ? (
              <div className="space-photo-actions">
                <button
                  type="button"
                  className="space-inline-link"
                  onClick={() => onEditPhoto(storedImage)}
                >
                  <Icon name="edit" size={11} />
                  Recadrer
                </button>
                <button type="button" className="space-inline-link" onClick={onRemovePhoto}>
                  <Icon name="trash" size={11} />
                  Retirer la photo
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {photoError ? (
          <p className="space-error" role="alert">
            {photoError}
          </p>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-label="Choisir une photo de profil"
          onChange={(event) => {
            onImport(event.target.files?.[0])
            event.target.value = ''
          }}
        />
      </div>

      <div className="space-row">
        <span className="space-row-label" id="space-tint-label">
          Teinte
        </span>
        <div
          className="space-tints"
          role="radiogroup"
          aria-labelledby="space-tint-label"
          data-columns="11"
          onKeyDown={rovingKeyDown}
        >
          {SPACE_TINTS.map((entry, index) => {
            const active = entry.color.toLowerCase() === color.toLowerCase()
            return (
              <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={entry.label}
                title={entry.label}
                tabIndex={active ? 0 : !tint && index === 0 ? 0 : -1}
                className="space-tint"
                data-active={active ? 'true' : undefined}
                onClick={() => onTint(entry.color)}
              >
                <span
                  className="space-tint-dot"
                  style={{ background: entry.color }}
                  aria-hidden="true"
                >
                  {active ? <Icon name="check" size={11} /> : null}
                </span>
                <span className="space-tint-name">{entry.label}</span>
              </button>
            )
          })}
          <button
            type="button"
            role="radio"
            aria-checked={!tint}
            aria-label="Teinte personnalisée"
            title="Personnalisée"
            tabIndex={!tint ? 0 : -1}
            className="space-tint space-tint-custom"
            data-active={!tint ? 'true' : undefined}
            onClick={onToggleCustom}
          >
            <span className="space-tint-dot space-tint-rainbow" aria-hidden="true">
              {!tint ? <Icon name="check" size={11} /> : null}
            </span>
            <span className="space-tint-name">Personnalisée</span>
          </button>
        </div>
        {customOpen || !tint ? (
          <div className="space-custom-tint">
            <input
              type="color"
              className="space-color-input"
              value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#5b5bd6'}
              aria-label="Choisir une couleur personnalisée"
              onChange={(event) => onCommitTint(event.target.value)}
            />
            <input
              className="space-hex-input"
              value={customInput}
              spellCheck={false}
              aria-label="Couleur hexadécimale"
              onChange={(event) => onCustomInput(event.target.value)}
              onBlur={() => onCommitTint(customInput)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onCommitTint(customInput)
                }
              }}
            />
            <span className="space-help">Sélecteur ou code hexadécimal.</span>
          </div>
        ) : null}
        {tintError ? (
          <p className="space-error" role="alert">
            {tintError}
          </p>
        ) : null}
        {tintNotice ? <p className="space-help">{tintNotice}</p> : null}
      </div>

      <div className="space-row">
        <span className="space-row-label" id="space-ambience-label">
          Ambiance
        </span>
        <div
          className="space-ambiences"
          role="radiogroup"
          aria-labelledby="space-ambience-label"
          data-columns="5"
          onKeyDown={rovingKeyDown}
        >
          {SPACE_BACKGROUNDS.map((entry) => {
            const active = background === entry.id
            return (
              <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                className="space-ambience"
                data-active={active ? 'true' : undefined}
                data-bg={entry.id}
                style={{ '--space-color': color } as CSSProperties}
                onClick={() => onBackground(entry.id)}
              >
                <span className="space-ambience-swatch" aria-hidden="true" />
                <span className="space-ambience-copy">
                  <strong>{entry.label}</strong>
                  <small>{entry.detail}</small>
                </span>
                <span className="space-check" aria-hidden="true">
                  <Icon name="check" size={10} />
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
