import type { CSSProperties } from 'react'
import type { SpaceBackground, SpaceShortcut } from '@shared/space'
import Favicon from '../Favicon'
import { Icon } from '../Icon'
import SpaceAvatar from './SpaceAvatar'
import SpaceAvatarEditor from './SpaceAvatarEditor'
import { greeting } from '../../lib/format'
import { countLabel } from './spaceParts'

export type PreviewMode = 'light' | 'dark'

interface SpacePreviewProps {
  mode: PreviewMode
  onMode(value: PreviewMode): void
  photo: string | null
  color: string
  background: SpaceBackground
  previewName: string
  avatar: string | null
  otherSpaces: { id: string; name: string; color: string; avatar?: string | null }[]
  shortcuts: SpaceShortcut[]
  iconSpaceId: string | undefined
  tintLabel: string
  ambienceLabel: string
  onAcceptPhoto(avatar: string): void
  onCancelPhoto(): void
}

/** Colonne d’aperçu : miniature de la fenêtre, pastilles et recadrage photo. */
export default function SpacePreview({
  mode,
  onMode,
  photo,
  color,
  background,
  previewName,
  avatar,
  otherSpaces,
  shortcuts,
  iconSpaceId,
  tintLabel,
  ambienceLabel,
  onAcceptPhoto,
  onCancelPhoto
}: SpacePreviewProps) {
  return (
    <aside
      className="space-preview"
      data-mode={mode}
      data-bg={background}
      data-editing={photo ? 'true' : undefined}
      style={{ '--space-color': color } as CSSProperties}
      aria-label="Aperçu en direct de l’espace"
    >
      <div className="space-preview-top">
        <span className="space-preview-label">Aperçu en direct</span>
        <div className="space-mode" role="radiogroup" aria-label="Aperçu clair ou sombre">
          {(['light', 'dark'] as PreviewMode[]).map((entry) => (
            <button
              key={entry}
              type="button"
              role="radio"
              aria-checked={mode === entry}
              className="space-mode-btn"
              data-active={mode === entry ? 'true' : undefined}
              onClick={() => onMode(entry)}
            >
              <Icon name={entry === 'light' ? 'sun' : 'moon'} size={12} />
              {entry === 'light' ? 'Clair' : 'Sombre'}
            </button>
          ))}
        </div>
      </div>

      {photo ? (
        <div className="space-preview-editor">
          <SpaceAvatarEditor
            src={photo}
            color={color}
            onAccept={onAcceptPhoto}
            onCancel={onCancelPhoto}
          />
        </div>
      ) : (
        <>
          <div className="preview-window">
            <div className="preview-rail">
              <span className="preview-chip" data-active="true">
                <SpaceAvatar space={{ name: previewName, color, avatar }} size={24} />
              </span>
              {otherSpaces.slice(0, 3).map((space) => (
                <span key={space.id} className="preview-chip">
                  <SpaceAvatar space={space} size={24} />
                </span>
              ))}
              <span className="preview-chip preview-chip-add">
                <Icon name="plus" size={11} />
              </span>
            </div>

            <div className="preview-app">
              <div className="preview-bar">
                <span className="preview-wordmark">
                  Vela<span>.</span>
                </span>
                <span className="preview-address" />
              </div>
              <div className="preview-body">
                <div className="preview-side">
                  <div className="preview-space">
                    <SpaceAvatar space={{ name: previewName, color, avatar }} size={18} />
                    <span>{previewName}</span>
                  </div>
                  <span className="preview-brief" />
                  <span className="preview-tab" data-active="true">
                    Aujourd’hui
                  </span>
                  <span className="preview-tab">Notes</span>
                  <span className="preview-side-label">Sites épinglés</span>
                  <div className="preview-pins">
                    {shortcuts.slice(0, 5).map((shortcut) => (
                      <Favicon
                        key={shortcut.id}
                        url={shortcut.url}
                        label={shortcut.title}
                        size={13}
                        spaceId={iconSpaceId}
                        cacheOnly
                      />
                    ))}
                    {shortcuts.length > 5 ? (
                      <span className="preview-more">+{shortcuts.length - 5}</span>
                    ) : null}
                    {shortcuts.length === 0 ? (
                      <span className="preview-empty">Aucun site</span>
                    ) : null}
                  </div>
                </div>
                <div className="preview-page">
                  {/* Même salutation que l'accueil : l'aperçu n'annonce plus
                      « Bonsoir » en plein matin. */}
                  <span className="preview-hello">
                    {greeting()}<span>.</span>
                  </span>
                  <span className="preview-search">
                    <Icon name="search" size={9} />
                    Rechercher
                  </span>
                  <div className="preview-tiles">
                    {shortcuts.slice(0, 4).map((shortcut) => (
                      <span className="preview-tile" key={shortcut.id}>
                        <Favicon
                          url={shortcut.url}
                          label={shortcut.title}
                          size={14}
                          spaceId={iconSpaceId}
                          cacheOnly
                        />
                        <span>{shortcut.title}</span>
                      </span>
                    ))}
                    {shortcuts.length === 0 ? (
                      <>
                        <span className="preview-tile preview-tile-empty" />
                        <span className="preview-tile preview-tile-empty" />
                        <span className="preview-tile preview-tile-empty" />
                      </>
                    ) : null}
                  </div>
                  <span className="preview-lines">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-preview-chips">
            <span className="space-preview-chip">
              <i style={{ background: color }} aria-hidden="true" />
              {tintLabel}
            </span>
            <span className="space-preview-chip">{ambienceLabel}</span>
            <span className="space-preview-chip">{countLabel(shortcuts.length)}</span>
          </div>
          <p className="space-preview-note">
            Aperçu en direct — seule cette fenêtre prend la teinte et l’ambiance.
          </p>
        </>
      )}
    </aside>
  )
}
