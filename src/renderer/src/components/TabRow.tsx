import { useState } from 'react'
import type { DragEvent } from 'react'
import type { TabView } from '@shared/types'
import { hostOf, isHomeUrl, prettyUrl } from '@shared/url'
import { initials, tintFor } from '../lib/format'
import { useBrowser } from '../store/browser'
import { Icon } from './Icon'

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
  const [broken, setBroken] = useState(false)

  const host = hostOf(tab.url)
  const tint = tintFor(host || tab.title || tab.id)
  const home = isHomeUrl(tab.url)

  return (
    <div
      className="tab-row"
      data-tab-id={tab.id}
      data-active={active}
      data-secondary={secondary}
      data-home={home}
      data-dragging={dragging}
      data-drop={dropEdge ?? undefined}
      role="tab"
      aria-selected={active}
      tabIndex={0}
      draggable
      title={home ? 'Accueil' : tab.title}
      onClick={() => selectTab(tab.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          selectTab(tab.id)
        }
      }}
      onDragStart={(event) => onDragStart(event, tab)}
      onDragEnd={onDragEnd}
      onDragOver={(event) => onDragOver(event, tab)}
      onDrop={(event) => onDrop(event, tab)}
    >
      <span className="tab-icon" style={{ color: tint, background: `${tint}1c` }}>
        {tab.favicon && !broken ? (
          <img src={tab.favicon} alt="" onError={() => setBroken(true)} draggable={false} />
        ) : (
          <span aria-hidden="true">{home ? <Icon name="circle" size={12} /> : initials(tab.title || host)}</span>
        )}
      </span>

      <span className="tab-copy">
        <span className="tab-title">{home ? 'Accueil' : tab.title}</span>
        {!home && <span className="tab-host">{prettyUrl(tab.url)}</span>}
      </span>

      {tab.loading && <span className="tab-loading" aria-label="Chargement" />}
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
    </div>
  )
}
