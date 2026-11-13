import { memo, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { TabView } from '@shared/types'
import { displayTitle, hostOf, titleBadge } from '@shared/url'
import { useBrowser } from '../../store/browser'
import Favicon from '../Favicon'
import { Icon } from '../Icon'
import { tabGestures } from './tabGestures'

export interface PinnedTabTileProps {
  tab: TabView
  active: boolean
  secondary?: boolean
  dragging?: boolean
  drop?: 'before' | 'after' | null
}

/**
 * Tuile d'un onglet épinglé. Le bouton principal et la pastille sonore sont
 * deux frères : un bouton ne peut pas en contenir un autre, et le clic sur le
 * son ne doit jamais activer l'onglet. L'infobulle est portée dans `body` pour
 * échapper au défilement de la barre latérale.
 */
function PinnedTabTile({
  tab,
  active,
  secondary = false,
  dragging = false,
  drop = null
}: PinnedTabTileProps) {
  const [tipOpen, setTipOpen] = useState(false)
  const [tipAt, setTipAt] = useState({ x: 0, y: 0 })
  const main = useRef<HTMLButtonElement>(null)
  const tipId = useId()
  // Activation et son sont des actions du store : lues ici plutôt que reçues en
  // props, elles ne cassent plus la mémoïsation de la tuile.
  const selectTab = useBrowser((state) => state.selectTab)
  const toggleMute = useBrowser((state) => state.toggleMute)

  const title = displayTitle(tab.title) || hostOf(tab.url) || 'Page'
  const host = hostOf(tab.url)
  const count = titleBadge(tab.title)
  const sounding = tab.audible && !tab.muted
  const sound = tab.muted ? 'muted' : sounding ? 'playing' : null

  const showTip = (): void => {
    const rect = main.current?.getBoundingClientRect()
    if (!rect) return
    setTipAt({ x: rect.left + rect.width / 2, y: rect.top - 8 })
    setTipOpen(true)
  }

  useEffect(() => {
    if (!tipOpen) return
    const close = (): void => setTipOpen(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [tipOpen])

  const ariaLabel = [
    title,
    host,
    active ? 'onglet actif' : '',
    sounding ? 'son en cours' : '',
    tab.muted ? 'son coupé' : ''
  ]
    .filter(Boolean)
    .join(' — ')

  return (
    <div
      className="pin-tile"
      data-tab-id={tab.id}
      data-active={active ? 'true' : undefined}
      data-secondary={secondary ? 'true' : undefined}
      data-dragging={dragging ? 'true' : undefined}
      data-drop={drop ?? undefined}
      data-sound={sound ?? undefined}
      data-asleep={tab.asleep ? 'true' : undefined}
      draggable
      onMouseEnter={showTip}
      onMouseLeave={() => setTipOpen(false)}
      onFocus={showTip}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTipOpen(false)
      }}
      onKeyDownCapture={(event) => {
        if (event.key !== 'Escape' || !tipOpen) return
        event.preventDefault()
        event.stopPropagation()
        setTipOpen(false)
      }}
      onContextMenu={(event) => {
        setTipOpen(false)
        tabGestures.openMenu(event, tab)
      }}
      onDragStart={(event) => {
        setTipOpen(false)
        tabGestures.startDrag(event, tab)
      }}
      onDragEnd={tabGestures.endDrag}
      onDragOver={(event) => tabGestures.overTile(event, tab)}
      onDrop={(event) => tabGestures.dropOnTile(event, tab)}
    >
      <button
        ref={main}
        type="button"
        className="pin-tile-main"
        data-tab-id={tab.id}
        aria-label={ariaLabel}
        aria-describedby={tipOpen ? tipId : undefined}
        onClick={() => selectTab(tab.id)}
        onKeyDown={(event) => tabGestures.keyTile(event, tab)}
      >
        <Favicon
          src={tab.favicon}
          url={tab.url}
          label={tab.title}
          size={40}
          spaceId={tab.spaceId}
          upgrade
          letter="domain"
        />
        {count !== null && (
          <span className="pin-tile-count" aria-hidden="true">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {sound && (
        <button
          type="button"
          className="pin-sound"
          data-muted={tab.muted ? 'true' : undefined}
          aria-label={tab.muted ? 'Son coupé' : 'Son en cours'}
          aria-pressed={tab.muted}
          title={tab.muted ? 'Rétablir le son' : 'Couper le son'}
          onClick={(event) => {
            event.stopPropagation()
            toggleMute(tab.id, !tab.muted)
          }}
        >
          <span className="pin-sound-dot" aria-hidden="true">
            <Icon name={tab.muted ? 'volume-off' : 'volume'} size={11} />
          </span>
        </button>
      )}

      {tipOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            id={tipId}
            role="tooltip"
            className="pin-tip"
            style={{ left: tipAt.x, top: tipAt.y }}
          >
            <span className="pin-tip-title">{title}</span>
            {host && host !== title ? <span className="pin-tip-host">{host}</span> : null}
          </div>,
          document.body
        )}
    </div>
  )
}

/** Mémoïsé : la tuile ne reçoit plus que des valeurs simples. */
export default memo(PinnedTabTile)
