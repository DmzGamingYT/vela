import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './Icon'

export interface TileMenuItem {
  id: string
  label: string
  icon: IconName
  danger?: boolean
  /** Un sous-menu remplace l'action : Entrée, → ou le survol l'ouvre. */
  submenu?: TileMenuItem[]
  onSelect?: () => void
}

/**
 * Menu d'une case. Clic droit, touche Menu ou ⇧F10 l'ouvrent ; les flèches
 * parcourent le niveau courant, → ouvre un sous-menu, ← le referme, Échap
 * ferme tout et rend le focus à la case.
 */
export default function TileMenu({
  x,
  y,
  label,
  items,
  onClose
}: {
  x: number
  y: number
  label: string
  items: TileMenuItem[]
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const subRef = useRef<HTMLDivElement>(null)
  const [openSub, setOpenSub] = useState<string | null>(null)

  const current = openSub ? items.find((item) => item.id === openSub) : null
  const submenu = current?.submenu ?? []

  useEffect(() => {
    rootRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    const onPointerDown = (event: PointerEvent): void => {
      if (ref.current?.contains(event.target as Node)) return
      onClose()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [onClose])

  // À l'ouverture d'un sous-menu, le focus passe à sa première entrée.
  useEffect(() => {
    if (!openSub) return
    subRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [openSub])

  const width = 232
  const height = items.length * 32 + 12
  const left = Math.max(8, Math.min(x, window.innerWidth - width - 8))
  const top = Math.max(8, Math.min(y, window.innerHeight - height - 8))
  const subWidth = 208
  const side = left + width + subWidth + 8 <= window.innerWidth ? 'right' : 'left'
  const subTop = Math.max(0, items.findIndex((item) => item.id === openSub)) * 32 + 6

  const entries = (container: HTMLElement | null): HTMLButtonElement[] =>
    Array.from(container?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])

  const move = (delta: number): void => {
    const list = entries(openSub ? subRef.current : rootRef.current)
    if (!list.length) return
    const index = list.indexOf(document.activeElement as HTMLButtonElement)
    list[(index + delta + list.length) % list.length]?.focus()
  }

  const edge = (which: 'first' | 'last'): void => {
    const list = entries(openSub ? subRef.current : rootRef.current)
    list[which === 'first' ? 0 : list.length - 1]?.focus()
  }

  const closeSub = (): void => {
    const parent = items.find((item) => item.id === openSub)
    setOpenSub(null)
    if (!parent) return
    requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector<HTMLButtonElement>(`[data-item="${CSS.escape(parent.id)}"]`)
        ?.focus()
    })
  }

  const choose = (item: TileMenuItem): void => {
    if (item.submenu) {
      setOpenSub(item.id)
      return
    }
    onClose()
    item.onSelect?.()
  }

  const renderItem = (item: TileMenuItem, level: 0 | 1) => (
    <button
      key={item.id}
      type="button"
      role="menuitem"
      className="tile-menu-item"
      data-item={item.id}
      data-danger={item.danger ? 'true' : undefined}
      data-open={level === 0 && openSub === item.id ? 'true' : undefined}
      aria-haspopup={item.submenu ? 'menu' : undefined}
      aria-expanded={item.submenu ? openSub === item.id : undefined}
      onMouseEnter={() => {
        if (level !== 0) return
        setOpenSub(item.submenu ? item.id : null)
      }}
      onClick={() => choose(item)}
    >
      <Icon name={item.icon} size={14} />
      <span>{item.label}</span>
      {item.submenu && <Icon name="chevron-right" size={13} className="tile-menu-arrow" />}
    </button>
  )

  return createPortal(
    <div
      ref={ref}
      className="tile-menu"
      role="menu"
      aria-label={label}
      style={{ left, top, width }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          if (openSub) closeSub()
          else onClose()
          return
        }
        if (event.key === 'Tab') {
          event.preventDefault()
          onClose()
          return
        }
        if (event.key === 'ArrowLeft') {
          if (!openSub) return
          event.preventDefault()
          closeSub()
          return
        }
        if (event.key === 'ArrowRight') {
          if (openSub) return
          const focused = document.activeElement as HTMLElement
          const item = items.find((entry) => entry.id === focused?.dataset.item)
          if (!item?.submenu) return
          event.preventDefault()
          setOpenSub(item.id)
          return
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          move(event.key === 'ArrowDown' ? 1 : -1)
          return
        }
        if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault()
          edge(event.key === 'Home' ? 'first' : 'last')
        }
      }}
    >
      <div ref={rootRef} className="tile-menu-list">
        {items.map((item) => renderItem(item, 0))}
      </div>
      {current && submenu.length > 0 && (
        <div
          ref={subRef}
          className="tile-submenu"
          role="menu"
          aria-label={current.label}
          data-side={side}
          style={{ top: subTop, width: subWidth }}
        >
          {submenu.map((item) => renderItem(item, 1))}
        </div>
      )}
    </div>,
    document.body
  )
}
