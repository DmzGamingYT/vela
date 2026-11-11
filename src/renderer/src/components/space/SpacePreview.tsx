import type { CSSProperties } from 'react'
import type { SpaceBackground, SpaceShortcut } from '@shared/space'
import Favicon from '../Favicon'
import { Icon } from '../Icon'
import SpaceAvatar from './SpaceAvatar'
import SpaceAvatarEditor from './SpaceAvatarEditor'
import { greeting } from '../../lib/format'

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
  /** Sites proposés quand le profil n’en a encore aucun. */
  suggestedShortcuts: SpaceShortcut[]
  iconSpaceId: string | undefined
  tintLabel: string
  ambienceLabel: string
  onAcceptPhoto(avatar: string): void
  onCancelPhoto(): void
}

/** Nom d’hôte lisible, sans www., pour les tuiles de l’aperçu. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'Site'
  }
}

/** Colonne d’aperçu : carte courte, faits sur une ligne et recadrage photo. */
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
  suggestedShortcuts,
  iconSpaceId,
  tintLabel,
  ambienceLabel,
  onAcceptPhoto,
  onCancelPhoto
}: SpacePreviewProps) {
  const pinned = shortcuts.length > 0
  const suggested = pinned ? [] : suggestedShortcuts.slice(0, 3)
  const shown = pinned ? shortcuts.slice(0, 4) : suggested
  const siteFact =
    shortcuts.length === 0
      ? 'Aucun site épinglé'
      : shortcuts.length === 1
        ? '1 site épinglé'
        : `${shortcuts.length} sites épinglés`

  return (
    <aside
      className="space-preview"
      data-mode={mode}
      data-bg={background}
      data-editing={photo ? 'true' : undefined}
      style={{ '--space-color': color } as CSSProperties}
      aria-label="Aperçu en direct du profil"
    >
      <div className="preview-card">
        <header className="preview-head">
          <span className="preview-eyebrow">Aperçu</span>
          <span className="preview-context" title={previewName}>
            {previewName}
          </span>
          <div className="preview-modes" role="radiogroup" aria-label="Aperçu clair ou sombre">
            {(['light', 'dark'] as PreviewMode[]).map((entry) => (
              <button
                key={entry}
                type="button"
                role="radio"
                aria-checked={mode === entry}
                aria-label={entry === 'light' ? 'Aperçu clair' : 'Aperçu sombre'}
                title={entry === 'light' ? 'Clair' : 'Sombre'}
                className="preview-mode"
                onClick={() => onMode(entry)}
              >
                <Icon name={entry === 'light' ? 'sun' : 'moon'} size={11} />
              </button>
            ))}
          </div>
        </header>

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
            <div className="preview-window" data-amb={background}>
              <div className="preview-rail" aria-hidden="true">
                <span className="preview-chip" data-active="true">
                  <SpaceAvatar space={{ name: previewName, color, avatar }} size={22} />
                </span>
                {otherSpaces.slice(0, 3).map((space) => (
                  <span key={space.id} className="preview-chip">
                    <SpaceAvatar space={space} size={22} />
                  </span>
                ))}
                <span className="preview-chip preview-chip-add">
                  <Icon name="plus" size={10} />
                </span>
              </div>

              <div className="preview-side" aria-hidden="true">
                <span className="preview-wordmark">
                  Vela<span>.</span>
                </span>
                <span className="preview-space">
                  <SpaceAvatar space={{ name: previewName, color, avatar }} size={17} />
                  <span>{previewName}</span>
                </span>
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
                  {shortcuts.length === 0 ? <span className="preview-empty">Aucun site</span> : null}
                </div>
              </div>

              <div className="preview-page" aria-hidden="true">
                <div className="preview-page-inner">
                  <span className="preview-hello">{greeting()}.</span>
                  <span className="preview-search">
                    <Icon name="search" size={9} />
                    Rechercher
                  </span>
                  <span className="preview-page-label">
                    Sites épinglés
                    <span className="preview-pill">
                      {pinned ? 'Épinglés' : suggested.length ? 'Suggérés' : 'Aucun'}
                    </span>
                  </span>
                  <div className="preview-tiles">
                    {shown.map((shortcut) =>
                      pinned ? (
                        <span className="preview-tile" key={shortcut.id}>
                          <Favicon
                            url={shortcut.url}
                            label={shortcut.title}
                            size={14}
                            spaceId={iconSpaceId}
                            cacheOnly
                          />
                          <span className="preview-tile-copy">
                            <strong>{shortcut.title}</strong>
                            <span>{hostOf(shortcut.url)}</span>
                          </span>
                        </span>
                      ) : (
                        <span className="preview-tile is-suggested" key={shortcut.id}>
                          <span className="preview-tile-mark">
                            <Icon name="plus" size={9} />
                          </span>
                          <span className="preview-tile-copy">
                            <strong>{shortcut.title}</strong>
                            <span>{hostOf(shortcut.url)}</span>
                          </span>
                        </span>
                      )
                    )}
                    {shown.length === 0 ? (
                      <span className="preview-tile preview-tile-add preview-tile-wide">
                        <Icon name="plus" size={10} />
                        <span>Un site suffit pour commencer</span>
                      </span>
                    ) : shown.length < 4 ? (
                      <span className="preview-tile preview-tile-add" aria-hidden="true">
                        <Icon name="plus" size={10} />
                      </span>
                    ) : null}
                  </div>
                  <span className="preview-recent">Récemment</span>
                  <span className="preview-lines">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
                <span className="preview-fade" aria-hidden="true" />
              </div>
            </div>

            <div className="preview-foot">
              <ul className="preview-facts">
                <li className="preview-fact">
                  <i aria-hidden="true" />
                  Cookies et sessions isolés
                </li>
                <li className="preview-fact">
                  <i aria-hidden="true" />
                  {siteFact}
                </li>
                <li className="preview-fact">
                  <i className="is-tint" aria-hidden="true" />
                  {tintLabel} <span>· {ambienceLabel}</span>
                </li>
              </ul>
              <p className="preview-note">
                Seul cet aperçu prend la teinte et l’ambiance : le reste de la fenêtre garde le
                papier neutre.
              </p>
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
