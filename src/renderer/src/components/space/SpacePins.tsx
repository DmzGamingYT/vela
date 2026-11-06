import type { DragEvent, RefObject } from 'react'
import { MAX_SHORTCUTS, SPACE_SHORTCUT_SETS, type SpaceShortcut } from '@shared/space'
import { hostOf } from '@shared/url'
import Favicon from '../Favicon'
import { Icon } from '../Icon'
import { countLabel } from './spaceParts'

interface SpacePinsProps {
  pinsOpen: boolean
  onPinsOpen(value: boolean): void
  shortcuts: SpaceShortcut[]
  suggestedSet: string | null
  suggestedLabel: string | null
  existingId: string | undefined
  dragId: string | null
  dragIdRef: RefObject<string | null>
  dropTarget: string | null
  onDragId(value: string | null): void
  onDropTarget(value: string | null): void
  pinRefs: RefObject<Map<string, HTMLLIElement>>
  siteInput: string
  onSiteInput(value: string): void
  siteError: string | null
  onSiteError(value: string | null): void
  onAddSite(raw: string): void
  onSuggest(): void
  onMovePin(id: string, delta: number): void
  onDropPin(targetId: string): void
  onDropAddress(event: DragEvent<HTMLElement>): void
  onRemove(id: string): void
}

/** Section 4 : sites épinglés, réordonnables au clavier ou à la souris. */
export default function SpacePins({
  pinsOpen,
  onPinsOpen,
  shortcuts,
  suggestedSet,
  suggestedLabel,
  existingId,
  dragId,
  dragIdRef,
  dropTarget,
  onDragId,
  onDropTarget,
  pinRefs,
  siteInput,
  onSiteInput,
  siteError,
  onSiteError,
  onAddSite,
  onSuggest,
  onMovePin,
  onDropPin,
  onDropAddress,
  onRemove
}: SpacePinsProps) {
  return (
    <details
      className="space-fold"
      open={pinsOpen}
      onToggle={(event) => onPinsOpen(event.currentTarget.open)}
    >
      <summary className="space-fold-summary">
        <span className="space-section-index" aria-hidden="true">
          4
        </span>
        <span className="space-fold-title">Sites épinglés</span>
        <span className="space-fold-hint">Optionnel</span>
        <span className="space-fold-count">
          {shortcuts.length}/{MAX_SHORTCUTS}
        </span>
        <Icon name="chevron-down" size={13} />
      </summary>
      <div
        className="space-fold-body"
        onDragOver={(event) => {
          if (!dragIdRef.current) event.preventDefault()
        }}
        onDrop={onDropAddress}
      >
        {suggestedSet && suggestedLabel ? (
          <button type="button" className="space-suggest-set" onClick={onSuggest}>
            <Icon name="sparkles" size={12} />
            Ajouter les {countLabel(SPACE_SHORTCUT_SETS[suggestedSet]?.length ?? 0)} conseillés pour{' '}
            {suggestedLabel}
          </button>
        ) : null}

        {shortcuts.length > 0 ? (
          <ul className="space-pins" aria-label="Sites épinglés, réordonnables avec Alt et les flèches">
            {shortcuts.map((shortcut, index) => (
              <li
                key={shortcut.id}
                ref={(node) => {
                  if (node) pinRefs.current.set(shortcut.id, node)
                  else pinRefs.current.delete(shortcut.id)
                }}
                tabIndex={0}
                draggable
                data-pin-id={shortcut.id}
                data-drag={dragId === shortcut.id ? 'true' : undefined}
                data-over={dropTarget === shortcut.id ? 'true' : undefined}
                aria-label={`${shortcut.title}, position ${index + 1} sur ${shortcuts.length}. Alt plus flèche pour déplacer.`}
                onKeyDown={(event) => {
                  if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
                    event.preventDefault()
                    onMovePin(shortcut.id, event.key === 'ArrowUp' ? -1 : 1)
                  }
                }}
                onDragStart={(event) => {
                  dragIdRef.current = shortcut.id
                  onDragId(shortcut.id)
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/uri-list', shortcut.url)
                }}
                onDragEnd={() => {
                  dragIdRef.current = null
                  onDragId(null)
                  onDropTarget(null)
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  if (dragIdRef.current && dragIdRef.current !== shortcut.id) {
                    onDropTarget(shortcut.id)
                  }
                }}
                onDragLeave={() =>
                  onDropTarget(dropTarget === shortcut.id ? null : dropTarget)
                }
                onDrop={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onDropPin(shortcut.id)
                }}
              >
                <span className="space-pin-grip" aria-hidden="true" />
                <Favicon
                  url={shortcut.url}
                  label={shortcut.title}
                  size={16}
                  spaceId={existingId}
                  cacheOnly
                />
                <span className="space-pin-copy">
                  <strong>{shortcut.title}</strong>
                  <small>{hostOf(shortcut.url)}</small>
                </span>
                <span className="space-pin-move">
                  <button
                    type="button"
                    onClick={() => onMovePin(shortcut.id, -1)}
                    disabled={index === 0}
                    aria-label={`Monter ${shortcut.title}`}
                    title="Monter"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => onMovePin(shortcut.id, 1)}
                    disabled={index === shortcuts.length - 1}
                    aria-label={`Descendre ${shortcut.title}`}
                    title="Descendre"
                  >
                    ↓
                  </button>
                </span>
                <button
                  type="button"
                  className="space-pin-remove"
                  aria-label={`Retirer ${shortcut.title}`}
                  title={`Retirer ${shortcut.title}`}
                  onClick={() => onRemove(shortcut.id)}
                >
                  <Icon name="close" size={11} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="space-help">
            Aucun site épinglé. Ajoutez une adresse, ou déposez-la depuis la page.
          </p>
        )}

        <div className="space-pin-add">
          <input
            className="space-pin-input"
            value={siteInput}
            placeholder="notion.so, github.com…"
            aria-label="Adresse d’un site à épingler"
            spellCheck={false}
            onChange={(event) => {
              onSiteInput(event.target.value)
              onSiteError(null)
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              onAddSite(siteInput)
            }}
          />
          <button type="button" className="space-small-btn" onClick={() => onAddSite(siteInput)}>
            <Icon name="plus" size={12} />
            Épingler
          </button>
        </div>
        {siteError ? (
          <p className="space-error" role="alert">
            {siteError}
          </p>
        ) : null}
        <p className="space-help">
          Glissez une ligne pour changer l’ordre, ou une adresse depuis la page. Au clavier : Alt +
          flèches.
        </p>
      </div>
    </details>
  )
}
