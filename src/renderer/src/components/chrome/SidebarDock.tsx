import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { APP_SHORTCUTS } from '@shared/shortcuts'
import { shortcut } from '../../lib/format'
import { Icon, type IconName } from '../Icon'

const TOOLTIP_DELAY = 500
const COMPACT_WIDTH = 120

type DockVariant = 'notes' | 'agent' | 'settings'

interface SidebarDockProps {
  notesOpen: boolean
  agentOpen: boolean
  settingsOpen: boolean
  onNotes(): void
  onAgent(): void
  onSettings(): void
  /** Force les icônes seules : le rail replié n’a pas la largeur du dock. */
  compact?: boolean
}

interface DockButtonProps {
  label: string
  tipLabel: string
  keys: string
  icon: IconName
  variant: DockVariant
  active: boolean
  compact: boolean
  onActivate(): void
}

/**
 * Un bouton du dock et son infobulle.
 *
 * L’infobulle visible porte le libellé complet et le raccourci ; sa partie
 * accessible ne répète pas le libellé, déjà donné par `aria-label` au bouton :
 * le lecteur d’écran annonce « Notes, Raccourci ⌘E », pas deux fois « Notes ».
 */
function DockButton({
  label,
  tipLabel,
  keys,
  icon,
  variant,
  active,
  compact,
  onActivate
}: DockButtonProps) {
  const tipId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const timer = useRef<number | null>(null)
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState({ left: 0, top: 0 })

  const clearTimer = (): void => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }

  const hide = (): void => {
    clearTimer()
    setOpen(false)
  }

  const show = (): void => {
    if (open) return
    clearTimer()
    timer.current = window.setTimeout(() => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      // En compact, le bouton touche le bord gauche : l’infobulle s’aligne sur
      // son bord au lieu de déborder hors de la fenêtre.
      setAt({ left: compact ? rect.left : rect.left + rect.width / 2, top: rect.top - 8 })
      setOpen(true)
    }, TOOLTIP_DELAY)
  }

  useEffect(() => clearTimer, [])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`dock-button dock-button--${variant}`}
        data-active={active ? 'true' : undefined}
        aria-label={label}
        aria-pressed={active}
        aria-describedby={open ? tipId : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hide()
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || !open) return
          event.preventDefault()
          event.stopPropagation()
          hide()
        }}
        onClick={() => {
          hide()
          onActivate()
        }}
      >
        <Icon name={icon} size={18} className="dock-icon" />
        {!compact && <span className="dock-label">{label}</span>}
        {!compact && variant === 'settings' && <kbd className="dock-key">{keys}</kbd>}
      </button>

      {open &&
        createPortal(
          <div
            id={tipId}
            role="tooltip"
            className={`dock-tip${compact ? ' dock-tip--compact' : ''}`}
            style={{ left: at.left, top: at.top }}
          >
            <span aria-hidden="true" className="dock-tip-text">
              {tipLabel} <kbd>{keys}</kbd>
            </span>
            <span className="sr-only">Raccourci {keys}</span>
          </div>,
          document.body
        )}
    </>
  )
}

export default function SidebarDock({
  notesOpen,
  agentOpen,
  settingsOpen,
  onNotes,
  onAgent,
  onSettings,
  compact = false
}: SidebarDockProps) {
  const dockRef = useRef<HTMLDivElement>(null)
  const [narrow, setNarrow] = useState(false)

  useEffect(() => {
    const node = dockRef.current
    if (!node || compact || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      // Largeur du dock entier, padding compris : le seuil de 120 px est celui
      // de la colonne, pas de sa seule zone de contenu.
      const width = entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width
      setNarrow(width < COMPACT_WIDTH)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [compact])

  const isCompact = compact || narrow
  const notesKeys = shortcut(APP_SHORTCUTS.notes.key)
  const agentKeys = shortcut(APP_SHORTCUTS.agent.key)
  const settingsKeys = shortcut(APP_SHORTCUTS.settings.key)

  return (
    <div
      ref={dockRef}
      className="sidebar-dock"
      data-compact={isCompact ? 'true' : undefined}
      role="group"
      aria-label="Outils"
    >
      <div className="dock-grid">
        <DockButton
          label="Notes"
          tipLabel="Notes"
          keys={notesKeys}
          icon="notes"
          variant="notes"
          active={notesOpen}
          compact={isCompact}
          onActivate={onNotes}
        />
        <DockButton
          label="Agent"
          tipLabel="Demander à l’agent"
          keys={agentKeys}
          icon="sparkles"
          variant="agent"
          active={agentOpen}
          compact={isCompact}
          onActivate={onAgent}
        />
      </div>
      <DockButton
        label="Réglages"
        tipLabel="Réglages"
        keys={settingsKeys}
        icon="settings"
        variant="settings"
        active={settingsOpen}
        compact={isCompact}
        onActivate={onSettings}
      />
    </div>
  )
}
