import { useEffect, useRef, useState } from 'react'
import type { DragEvent, MouseEvent as ReactMouseEvent } from 'react'
import type { TabView } from '@shared/types'
import { hostOf, isHomeUrl, prettyUrl } from '@shared/url'
import { initials, tintFor } from '../lib/format'
import { useBrowser } from '../store/browser'
import { Icon } from './Icon'
import TabPreviewCard from './TabPreviewCard'
import TileMenu, { type TileMenuItem } from './TileMenu'

interface TabRowProps {
  tab: TabView
  active: boolean
  secondary: boolean
  dragging: boolean
  dropEdge: 'before' | 'after' | null
  onDragStart: (event: DragEvent<HTMLDivElement>, tab: TabView) => void
  onDragEnd: () => void
  onDragOver: (event: DragEvent<HTMLDivElement>, tab: TabView) => void
  onDrop: (event: DragEvent<HTMLDivElement>, tab: TabView) => void
}

export default function TabRow({
  tab,
  active,
  secondary,
  dragging,
  dropEdge,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop
}: TabRowProps) {
  const selectTab = useBrowser((state) => state.selectTab)
  const closeTab = useBrowser((state) => state.closeTab)
  const pin = useBrowser((state) => state.pin)
  const splitWith = useBrowser((state) => state.splitWith)
  const toggleMute = useBrowser((state) => state.toggleMute)
  const newTab = useBrowser((state) => state.newTab)
  const closeOthers = useBrowser((state) => state.closeOthers)
  const [broken, setBroken] = useState(false)
  // Menu contextuel : clic droit sur la ligne, comme dans un navigateur.
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  // Aperçu flottant au survol
  const [showPreview, setShowPreview] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearHoverTimers = (): void => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    if (closeTimer.current) clearTimeout(closeTimer.current)
    hoverTimer.current = null
    closeTimer.current = null
  }

  useEffect(() => clearHoverTimers, [])

  const host = hostOf(tab.url)
  const tint = tintFor(host || tab.title || tab.id)
  const home = isHomeUrl(tab.url)

  const handleMouseEnter = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    if (showPreview || hoverTimer.current) return
    const rect = event.currentTarget.getBoundingClientRect()
    hoverTimer.current = setTimeout(() => {
      hoverTimer.current = null
      setAnchorRect(rect)
      setShowPreview(true)
    }, 280)
  }

  const handleMouseLeave = (): void => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
    if (showPreview && !closeTimer.current) {
      // La carte vit sous la liste : laisser le temps de la rejoindre.
      closeTimer.current = setTimeout(() => {
        closeTimer.current = null
        setShowPreview(false)
      }, 420)
    }
  }

  const keepPreviewOpen = (): void => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  const closePreview = (): void => {
    clearHoverTimers()
    setShowPreview(false)
  }

  const copy = (value: string): void => {
    void navigator.clipboard.writeText(value).catch(() => undefined)
  }

  const menuItems: TileMenuItem[] = [
    {
      id: 'pin',
      label: tab.pinned ? 'Désépingler' : 'Épingler',
      icon: 'pin',
      onSelect: () => pin(tab.id, !tab.pinned)
    }
  ]
  if (!home) {
    menuItems.push(
      { id: 'duplicate', label: 'Dupliquer l’onglet', icon: 'copy', onSelect: () => newTab(tab.url) },
      { id: 'split', label: 'Ouvrir en vue scindée', icon: 'split', onSelect: () => splitWith(tab.id) },
      {
        id: 'mute',
        label: tab.muted ? 'Rétablir le son' : 'Couper le son',
        icon: tab.muted ? 'volume-off' : 'volume',
        onSelect: () => toggleMute(tab.id, !tab.muted)
      },
      { id: 'copy-url', label: 'Copier l’adresse', icon: 'link', onSelect: () => copy(tab.url) },
      { id: 'copy-title', label: 'Copier le titre', icon: 'notes', onSelect: () => copy(tab.title) }
    )
  }
  menuItems.push(
    { id: 'close', label: 'Fermer l’onglet', icon: 'close', onSelect: () => closeTab(tab.id) },
    {
      id: 'close-others',
      label: 'Fermer les autres onglets',
      icon: 'trash',
      danger: true,
      onSelect: () => void closeOthers(tab.id)
    }
  )

  return (
    <div
      className="tab-row"
      data-tab-id={tab.id}
      data-active={active}
      data-secondary={secondary}
      data-home={home}
      data-asleep={tab.asleep && !home ? 'true' : undefined}
      data-dragging={dragging}
      data-drop={dropEdge ?? undefined}
      role="tab"
      aria-selected={active}
      tabIndex={0}
      draggable
      onClick={() => selectTab(tab.id)}
      onContextMenu={(event) => {
        event.preventDefault()
        closePreview()
        setMenu({ x: event.clientX, y: event.clientY })
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          selectTab(tab.id)
        }
        // Touche Menu ou ⇧F10 : même menu que le clic droit, au clavier.
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault()
          const rect = event.currentTarget.getBoundingClientRect()
          closePreview()
          setMenu({ x: rect.left + 12, y: rect.bottom })
        }
      }}
      onDragStart={(event) => {
        closePreview()
        onDragStart(event, tab)
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => onDragOver(event, tab)}
      onDrop={(event) => onDrop(event, tab)}
    >
      <span className="tab-icon" style={{ color: tint, background: `${tint}1c` }}>
        {tab.favicon && !broken ? (
          <img src={tab.favicon} alt="" onError={() => setBroken(true)} draggable={false} />
        ) : (
          <span aria-hidden="true">{home ? <Icon name="home" size={13} /> : initials(tab.title || host)}</span>
        )}
      </span>

      <span className="tab-copy">
        <span className="tab-title">{home ? 'Accueil' : tab.title}</span>
        {!home && <span className="tab-host">{prettyUrl(tab.url)}</span>}
      </span>

      {tab.loading && <span className="tab-loading" aria-label="Chargement" />}

      {/* Indicateur audio interactif */}
      {(tab.audible || tab.muted) && !home && (
        <button
          type="button"
          className="tab-sound-btn"
          data-muted={tab.muted ? 'true' : undefined}
          title={tab.muted ? 'Rétablir le son' : 'Couper le son de cet onglet'}
          aria-label={tab.muted ? 'Rétablir le son' : 'Couper le son'}
          onClick={(event) => {
            event.stopPropagation()
            toggleMute(tab.id, !tab.muted)
          }}
        >
          <Icon name={tab.muted ? 'volume-off' : 'volume'} size={12} />
        </button>
      )}

      {tab.asleep && !home && (
        <span className="tab-asleep" title="En veille : la page se recharge à l’ouverture">
          <Icon name="moon" size={11} />
        </span>
      )}
      {secondary && (
        <span className="tab-split" title="Ouvert en vue scindée">
          <Icon name="split" size={12} />
        </span>
      )}

      <span className="tab-actions">
        <button
          type="button"
          className="tab-action"
          title={tab.pinned ? 'Désépingler' : 'Épingler'}
          onClick={(event) => {
            event.stopPropagation()
            pin(tab.id, !tab.pinned)
          }}
        >
          <Icon name="pin" size={12} filled={tab.pinned} />
        </button>
        <button
          type="button"
          className="tab-action"
          title="Ouvrir en vue scindée"
          onClick={(event) => {
            event.stopPropagation()
            splitWith(tab.id)
          }}
        >
          <Icon name="split" size={12} />
        </button>
        <button
          type="button"
          className="tab-action"
          title="Fermer"
          onClick={(event) => {
            event.stopPropagation()
            closeTab(tab.id)
          }}
        >
          <Icon name="close" size={12} />
        </button>
      </span>

      {showPreview && anchorRect && (
        <TabPreviewCard
          tab={tab}
          anchorRect={anchorRect}
          onClose={closePreview}
          onMouseEnter={keepPreviewOpen}
          onMouseLeave={handleMouseLeave}
        />
      )}

      {menu && (
        <TileMenu
          x={menu.x}
          y={menu.y}
          label={home ? 'Onglet Accueil' : tab.title}
          items={menuItems}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
