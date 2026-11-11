import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type {
  AddressSuggestionGroup
} from '../../lib/addressSuggestions'
import Favicon from '../Favicon'
import { Icon } from '../Icon'

interface AddressSuggestionsProps {
  listId: string
  anchor: { left: number; top: number; width: number }
  groups: AddressSuggestionGroup[]
  activeIndex: number
  onActive: (index: number) => void
  onPick: (index: number, newWindow: boolean) => void
  onClose: () => void
}

/**
 * Le popover vit dans `document.body`, au même niveau que les menus, et non
 * dans la barre d'outils : la scène native ne peut pas être recouverte par un
 * enfant du formulaire. Son fond est opaque pour que la page ne traverse
 * jamais les lignes.
 */
export default function AddressSuggestions({
  listId,
  anchor,
  groups,
  activeIndex,
  onActive,
  onPick,
  onClose
}: AddressSuggestionsProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as HTMLElement | null
      if (ref.current?.contains(target) || target?.closest('.address')) return
      onClose()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [onClose])

  const mod = window.vela.platform === 'darwin' ? '⌘' : 'Ctrl'

  return createPortal(
    <div
      ref={ref}
      id={listId}
      className="address-suggest-popover"
      role="listbox"
      aria-label="Suggestions d’adresses"
      style={{ left: anchor.left, top: anchor.top, width: anchor.width }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="address-suggest-list">
        {groups.map((group, groupIndex) => (
          <div className="address-suggest-group" key={group.id} role="group" aria-label={group.title}>
            <div className="address-suggest-group-title" aria-hidden="true">
              {group.title}
            </div>
            {group.rows.map((row, rowPosition) => {
              const rowIndex =
                groups
                  .slice(0, groupIndex)
                  .reduce((total, entry) => total + entry.rows.length, 0) + rowPosition
              return (
                <button
                  key={row.id}
                  type="button"
                  id={`${listId}-option-${rowIndex}`}
                  role="option"
                  aria-selected={rowIndex === activeIndex}
                  className="address-suggest-option"
                  data-active={rowIndex === activeIndex ? 'true' : undefined}
                  data-kind={row.kind}
                  onMouseEnter={() => onActive(rowIndex)}
                  onClick={() => onPick(rowIndex, false)}
                  onAuxClick={(event) => {
                    if (event.button !== 1) return
                    event.preventDefault()
                    onPick(rowIndex, true)
                  }}
                >
                  <span className="address-suggest-icon" aria-hidden="true">
                    {row.kind === 'search' ? (
                      <Icon name="search" size={13} />
                    ) : row.kind === 'address' ? (
                      <Icon name="globe" size={13} />
                    ) : (
                      <Favicon
                        src={row.favicon}
                        url={row.url}
                        label={row.title}
                        size={16}
                        spaceId={row.spaceId}
                        cacheOnly
                        letter="domain"
                      />
                    )}
                  </span>
                  <span className="address-suggest-title">{row.title}</span>
                  {row.kind === 'tab' && (
                    <span className="address-suggest-action">Passer à l’onglet</span>
                  )}
                  {row.title !== row.host && (
                    <span className="address-suggest-host">{row.host}</span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <footer className="address-suggest-foot" aria-hidden="true">
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> naviguer
        </span>
        <span>
          <kbd>↵</kbd> ouvrir
        </span>
        <span>
          <kbd>{mod}</kbd>
          <kbd>↵</kbd> nouvel onglet
        </span>
        <span>
          <kbd>Tab</kbd> compléter
        </span>
        <span>
          <kbd>esc</kbd> fermer
        </span>
      </footer>
    </div>,
    document.body
  )
}
