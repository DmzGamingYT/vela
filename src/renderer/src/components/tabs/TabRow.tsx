import { memo, useState } from 'react'
import type { TabView } from '@shared/types'
import { hostOf, isHomeUrl, prettyUrl } from '@shared/url'
import { initials, tintFor } from '../../lib/format'
import { useBrowser } from '../../store/browser'
import { Icon } from '../Icon'
import TabContextMenu from './TabContextMenu'
import { tabGestures } from './tabGestures'

interface TabRowProps {
  tab: TabView
  active: boolean
  secondary: boolean
  dragging: boolean
  dropEdge: 'before' | 'after' | null
}

function TabRow({ tab, active, secondary, dragging, dropEdge }: TabRowProps) {
  const selectTab = useBrowser((state) => state.selectTab)
  const closeTab = useBrowser((state) => state.closeTab)
  const pin = useBrowser((state) => state.pin)
  const splitWith = useBrowser((state) => state.splitWith)
  const toggleMute = useBrowser((state) => state.toggleMute)
  // L'adresse fautive, pas un simple drapeau : une page qui publie ensuite une
  // icône valide retrouve donc son image, au lieu de garder ses initiales.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null)
  // Menu contextuel : clic droit sur la ligne, comme dans un navigateur.
  const [menu, setMenu] = useState<{ x: number; y: number; keyboard: boolean } | null>(null)

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
      data-asleep={tab.asleep && !home ? 'true' : undefined}
      data-dragging={dragging}
      data-drop={dropEdge ?? undefined}
      role="group"
      aria-roledescription="onglet"
      aria-label={`${home ? 'Accueil' : tab.title}${active ? ', page courante' : ''}`}
      aria-current={active ? 'page' : undefined}
      title={home ? 'Accueil' : prettyUrl(tab.url)}
      tabIndex={0}
      draggable
      onClick={() => selectTab(tab.id)}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setMenu({ x: event.clientX, y: event.clientY, keyboard: false })
      }}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          selectTab(tab.id)
        }
        // Touche Menu ou ⇧F10 : même menu que le clic droit, au clavier.
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault()
          const rect = event.currentTarget.getBoundingClientRect()
          setMenu({ x: rect.left + 12, y: rect.bottom, keyboard: true })
        }
      }}
      onDragStart={(event) => tabGestures.startDrag(event, tab)}
      onDragEnd={tabGestures.endDrag}
      onDragOver={(event) => tabGestures.overTab(event, tab)}
      onDrop={(event) => tabGestures.dropOnTab(event, tab)}
    >
      <span className="tab-icon" style={{ color: tint, background: `${tint}1c` }}>
        {tab.favicon && tab.favicon !== brokenSrc ? (
          <img
            src={tab.favicon}
            alt=""
            onError={() => setBrokenSrc(tab.favicon ?? null)}
            draggable={false}
          />
        ) : (
          <span aria-hidden="true">
            {home ? <Icon name="home" size={13} /> : initials(tab.title || host)}
          </span>
        )}
      </span>

      {/* Une seule ligne par onglet : le domaine passe en infobulle, sinon
          « Accueil » et « YouTube » n'avaient pas la même hauteur. */}
      <span className="tab-copy">
        <span className="tab-title">{home ? 'Accueil' : tab.title}</span>
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
        <span
          className="tab-asleep"
          role="img"
          aria-label="En veille : mémoire libérée, la page se recharge à l’ouverture"
          title="En veille : mémoire libérée, la page se recharge à l’ouverture"
        >
          <Icon name="moon" size={12} />
        </span>
      )}
      {secondary && (
        <span className="tab-split" title="Ouvert en vue scindée">
          <Icon name="split" size={12} />
        </span>
      )}

      <span className="tab-actions">
        {!home && (
          <button
            type="button"
            className="tab-action"
            data-extra="true"
            title={tab.pinned ? 'Désépingler' : 'Épingler'}
            onClick={(event) => {
              event.stopPropagation()
              pin(tab.id, !tab.pinned)
            }}
          >
            <Icon name="pin" size={12} filled={tab.pinned} />
          </button>
        )}
        {!home && (
          <button
            type="button"
            className="tab-action"
            data-extra="true"
            title="Ouvrir en vue scindée"
            onClick={(event) => {
              event.stopPropagation()
              splitWith(tab.id)
            }}
          >
            <Icon name="split" size={12} />
          </button>
        )}
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

      {menu && (
        <TabContextMenu
          x={menu.x}
          y={menu.y}
          tab={tab}
          keyboard={menu.keyboard}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}

/** Mémoïsé : l'identité de `tab` est stable côté principal, ses gestes ici. */
export default memo(TabRow)
