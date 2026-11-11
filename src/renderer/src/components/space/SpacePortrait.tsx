import { useState } from 'react'
import type { RefObject } from 'react'
import { GALLERY_AVATARS } from '@shared/avatarGallery'
import { SPACE_AVATARS } from '@shared/space'
import GalleryAvatar from './GalleryAvatar'
import SpaceAvatar from './SpaceAvatar'
import { Icon } from '../Icon'
import { rovingKeyDown, type AvatarSource } from './spaceParts'

const SOURCES: { id: AvatarSource; label: string }[] = [
  { id: 'monogram', label: 'Initiales' },
  { id: 'icons', label: 'Formes' },
  { id: 'gallery', label: 'Galerie' },
  { id: 'photo', label: 'Photo' }
]

interface SpacePortraitProps {
  name: string
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

/**
 * Portrait de l'espace : un bouton qui montre le résultat, et un panneau qui
 * ne s'ouvre que si l'on veut en changer. Les quatre sources restent les
 * mêmes ; elles ne pèsent plus sur la hauteur du formulaire.
 */
export default function SpacePortrait({
  name,
  color,
  avatar,
  monogram,
  storedImage,
  photo,
  photoError,
  avatarSource,
  onSource,
  onAvatar,
  fileRef,
  onImport,
  onRemovePhoto,
  onEditPhoto
}: SpacePortraitProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="space-portrait">
      <button
        type="button"
        className="space-portrait-face"
        aria-label="Changer le portrait"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <SpaceAvatar space={{ name, color, avatar }} size={62} />
      </button>
      <span className="space-portrait-plus" aria-hidden="true">
        <Icon name={open ? 'close' : 'plus'} size={10} />
      </span>

      {open ? (
        <div className="space-portrait-panel">
          <div className="space-avatar-tabs" role="tablist" aria-label="Source de l’avatar">
            {SOURCES.map((source) => (
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
                  const index = SOURCES.findIndex((item) => item.id === avatarSource)
                  const step = event.key === 'ArrowRight' ? 1 : -1
                  const next = (index + step + SOURCES.length) % SOURCES.length
                  onSource(SOURCES[next].id)
                  document.getElementById(`space-avatar-tab-${SOURCES[next].id}`)?.focus()
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
                      <img src={storedImage} alt="Photo du profil" />
                    ) : (
                      <Icon name="image" size={20} />
                    )}
                  </span>
                  <span className="space-avatar-copy">
                    <strong>{storedImage ? 'Photo importée' : 'Déposez une photo'}</strong>
                    <small>PNG, JPEG ou WebP, 8 Mo au plus — recadrée en carré</small>
                  </span>
                  <button
                    type="button"
                    className="space-small-btn"
                    onClick={() => fileRef.current?.click()}
                  >
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
        </div>
      ) : null}
    </div>
  )
}
