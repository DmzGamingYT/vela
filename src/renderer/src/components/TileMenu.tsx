import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { spokenShortcut } from '../lib/format'
import { useBrowser } from '../store/browser'
import { Icon, type IconName } from './Icon'

export interface TileMenuItem {
  id: string
  label: string
  icon?: IconName
  danger?: boolean
  /** Raccourci réel de la même action, affiché à droite en touches stylisées. */
  keys?: string
  /** Explication d'une action dont l'effet n'est pas évident, en info-bulle. */
  hint?: string
  /** Trait de séparation : il ferme le groupe précédent. */
  separator?: boolean
  /** Un sous-menu remplace l'action : Entrée, → ou le survol l'ouvre. */
  submenu?: TileMenuItem[]
  onSelect?: () => void
}

const ITEM_HEIGHT = 32
const SEPARATOR_HEIGHT = 9
const HEADER_HEIGHT = 54
/** Au-delà, la saisie de recherche repart de zéro. */
const TYPEAHEAD_RESET_MS = 600

/** « ⌘⇧D » se lit touche par touche ; « Ctrl+Shift+D » se coupe sur les +. */
function keyParts(keys: string): string[] {
  return keys.includes('+') ? keys.split('+') : Array.from(keys)
}

/**
 * Menu d'une case. Clic droit, touche Menu ou ⇧F10 l'ouvrent ; les flèches
 * parcourent le niveau courant, → ouvre un sous-menu, ← le referme, Échap
 * ferme tout et rend le focus à la case. Taper du texte saute au libellé
 * correspondant.
 *
 * Les groupes sont séparés par un trait, les raccourcis s'affichent à droite :
 * un menu long reste lisible sans devenir une liste indifférenciée.
 */
export default function TileMenu({
  x,
  y,
  label,
  header,
  items,
  keyboard = true,
  onClose
}: {
  x: number
  y: number
  label: string
  /** En-tête informatif, jamais focalisable (titre d'épingle, domaine). */
  header?: ReactNode
  items: TileMenuItem[]
  /** Ouvert au clavier : la première action prend le focus et son anneau. */
  keyboard?: boolean
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const subRef = useRef<HTMLDivElement>(null)
  const [openSub, setOpenSub] = useState<string | null>(null)
  const typed = useRef('')
  const typedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const current = openSub ? items.find((item) => item.id === openSub) : null
  const submenu = current?.submenu ?? []

  useEffect(() => {
    // L'élément qui avait le focus (la tuile, la ligne) le reprend à la
    // fermeture : Échap ne doit pas renvoyer le clavier au document.
    const opener = document.activeElement as HTMLElement | null
    // À la souris, la liste prend le focus sans anneau : aucune action n'est
    // entourée d'un contour épais à l'ouverture.
    if (keyboard) rootRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    else rootRef.current?.focus()
    const onPointerDown = (event: PointerEvent): void => {
      if (ref.current?.contains(event.target as Node)) return
      onClose()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      if (opener && opener.isConnected) opener.focus()
    }
  }, [onClose, keyboard])

  useEffect(() => {
    // Le menu flotte au-dessus de la page : les vues natives quittent la scène
    // le temps qu'il est ouvert, sinon elles en recouvrent la partie droite.
    const { beginMenu, endMenu, view } = useBrowser.getState()
    beginMenu()
    // La page est une couche native posée au-dessus du HTML : elle doit
    // disparaître avant la première image du menu, sans attendre le calcul de
    // disposition du workspace (une image plus tard, le menu est déjà coupé).
    if (view) window.vela?.views?.layout({ panes: [], overlay: true })
    return () => {
      endMenu()
      if (typedTimer.current) clearTimeout(typedTimer.current)
    }
  }, [])

  // Un calque qui s'ouvre (modale de réglages, palette, notes, agent) prend le
  // dessus : le menu se retire au lieu de flotter par-dessus. Le clic hors du
  // menu ferme déjà les cas souris ; ceci couvre les raccourcis clavier.
  useEffect(() => {
    return useBrowser.subscribe((state, previous) => {
      if (!previous) return
      const openedElsewhere =
        (!previous.overlay && state.overlay !== null) ||
        (!previous.notesOpen && state.notesOpen) ||
        (!previous.agentOpen && state.agentOpen)
      if (openedElsewhere) onClose()
    })
  }, [onClose])

  // À l'ouverture d'un sous-menu, le focus passe à sa première entrée.
  useEffect(() => {
    if (!openSub) return
    subRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [openSub])

  const height = (item: TileMenuItem): number => (item.separator ? SEPARATOR_HEIGHT : ITEM_HEIGHT)
  const width = 252
  const menuHeight =
    items.reduce((total, item) => total + height(item), 12) + (header ? HEADER_HEIGHT : 0)
  const left = Math.max(8, Math.min(x, window.innerWidth - width - 8))
  const top = Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8))
  const subWidth = 216
  const side = left + width + subWidth + 8 <= window.innerWidth ? 'right' : 'left'
  const subTop = Math.max(
    0,
    items.slice(0, items.findIndex((item) => item.id === openSub)).reduce((sum, item) => sum + height(item), 6)
  )

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

  /** Saisie au clavier : saute au libellé qui commence par les lettres tapées. */
  const typeAhead = (key: string): void => {
    typed.current += key.toLowerCase()
    if (typedTimer.current) clearTimeout(typedTimer.current)
    typedTimer.current = setTimeout(() => {
      typed.current = ''
    }, TYPEAHEAD_RESET_MS)
    const scope = openSub ? submenu : items
    const match = scope.find(
      (item) => !item.separator && item.label.toLowerCase().startsWith(typed.current)
    )
    if (!match) return
    const container = openSub ? subRef.current : rootRef.current
    container
      ?.querySelector<HTMLButtonElement>(`[data-item="${CSS.escape(match.id)}"]`)
      ?.focus()
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
    if (item.separator) return
    if (item.submenu) {
      setOpenSub(item.id)
      return
    }
    onClose()
    item.onSelect?.()
  }

  const renderItem = (item: TileMenuItem, level: 0 | 1) => {
    if (item.separator) {
      return <div key={item.id} className="tile-menu-sep" role="separator" />
    }
    return (
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
        aria-keyshortcuts={item.keys ? item.keys.replace('⌘', 'Meta+').replace('⇧', 'Shift+').replace('⌥', 'Alt+') : undefined}
        title={item.hint}
        onMouseEnter={() => {
          if (level !== 0) return
          setOpenSub(item.submenu ? item.id : null)
        }}
        onClick={() => choose(item)}
      >
        {item.icon && <Icon name={item.icon} size={14} />}
        <span>{item.label}</span>
        {item.keys && (
          <span className="tile-menu-keys" aria-label={`Raccourci ${spokenShortcut(item.keys)}`}>
            {keyParts(item.keys).map((part, index) => (
              <kbd key={`${part}-${index}`} className="tile-menu-key" aria-hidden="true">
                {part}
              </kbd>
            ))}
          </span>
        )}
        {item.submenu && <Icon name="chevron-right" size={13} className="tile-menu-arrow" />}
      </button>
    )
  }

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
          return
        }
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault()
          typeAhead(event.key)
        }
      }}
    >
      {header && (
        <div className="tile-menu-head" role="presentation">
          {header}
        </div>
      )}
      <div ref={rootRef} className="tile-menu-list" tabIndex={-1}>
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
