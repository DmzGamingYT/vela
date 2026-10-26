import { useEffect } from 'react'
import { useTunnel } from '../store/tunnel'
import { timeAgo } from '../lib/format'
import { Icon } from './Icon'

/** Liste des cartes dans la barre latérale, quand le mode Travail est actif. */
export default function TunnelSidebar({ spaceId }: { spaceId: string }) {
  const maps = useTunnel((s) => s.maps)
  const active = useTunnel((s) => s.active)
  const refreshMaps = useTunnel((s) => s.refreshMaps)
  const loadMap = useTunnel((s) => s.loadMap)
  const setProjectsOpen = useTunnel((s) => s.setProjectsOpen)
  const newCard = useTunnel((s) => s.newCard)
  const subscribe = useTunnel((s) => s.subscribe)

  useEffect(() => {
    subscribe()
    void refreshMaps()
  }, [subscribe, refreshMaps, active?.id])

  const visible = maps.filter((map) => !map.spaceId || map.spaceId === spaceId)

  return (
    <div className="tabs-scroll work-cards">
      <div className="tabs-head">
        <span>Cartes du tunnel</span>
        <span className="tabs-count">{visible.length}</span>
        <span className="tabs-tools">
          <button
            type="button"
            className="icon-btn subtle"
            title="Nouvelle recherche"
            onClick={() => newCard()}
          >
            <Icon name="plus" size={14} />
          </button>
          <button
            type="button"
            className="icon-btn subtle"
            title="Toutes les cartes"
            onClick={() => setProjectsOpen(true)}
          >
            <Icon name="folder" size={14} />
          </button>
        </span>
      </div>

      <div className="tabs-group">
        {visible.map((map) => (
          <button
            key={map.id}
            type="button"
            className="work-card"
            data-active={active?.id === map.id}
            onClick={() => void loadMap(map.id)}
            title={map.title}
          >
            <span className="work-card-title">{map.title}</span>
            <span className="work-card-meta">
              {map.sourceCount} source{map.sourceCount > 1 ? 's' : ''} · {timeAgo(map.updatedAt)}
            </span>
          </button>
        ))}
        {visible.length === 0 && <p className="tabs-empty">Aucune carte pour l’instant.</p>}
      </div>

      <p className="work-hint">
        <Icon name="lock" size={11} /> Les cartes restent dans cet espace.
      </p>
    </div>
  )
}
