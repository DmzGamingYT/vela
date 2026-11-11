import { useEffect, useRef, useState } from 'react'
import { useTunnel } from '../../store/tunnel'
import { useBrowser } from '../../store/browser'
import { timeAgo } from '../../lib/format'
import { Icon } from '../Icon'

/** Liste des cartes dans la barre latérale, quand le mode Atelier est actif. */
export default function TunnelSidebar({ spaceId }: { spaceId: string }) {
  const maps = useTunnel((s) => s.maps)
  const active = useTunnel((s) => s.active)
  const running = useTunnel((s) => s.running)
  const refreshMaps = useTunnel((s) => s.refreshMaps)
  const loadMap = useTunnel((s) => s.loadMap)
  const removeMap = useTunnel((s) => s.removeMap)
  const setProjectsOpen = useTunnel((s) => s.setProjectsOpen)
  const newCard = useTunnel((s) => s.newCard)
  const subscribe = useTunnel((s) => s.subscribe)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const newRef = useRef<HTMLButtonElement>(null)
  /* Rang à réoccuper après une suppression : la liste a déjà changé quand
     l'effet s'exécute, le focus atterrit donc sur une carte qui existe. */
  const pendingFocus = useRef<number | null>(null)

  useEffect(() => {
    subscribe()
    void refreshMaps()
  }, [subscribe, refreshMaps, active?.id])

  // Une confirmation laissée de côté retombe d'elle-même : aucune suppression
  // ne peut se déclencher par surprise au retour dans la liste.
  useEffect(() => {
    if (!confirmId) return
    const timer = window.setTimeout(() => setConfirmId(null), 4000)
    return () => window.clearTimeout(timer)
  }, [confirmId])

  const visible = maps.filter((map) => !map.spaceId || map.spaceId === spaceId)
  // Une recherche en cours n'a pas encore de carte enregistrée : sans cette
  // ligne, la barre latérale restait sur « 0 · Aucune carte » pendant que la
  // carte se remplissait à l'écran.
  const live =
    running &&
    active &&
    (!active.spaceId || active.spaceId === spaceId) &&
    !visible.some((map) => map.id === active.id)
      ? active
      : null
  const total = visible.length + (live ? 1 : 0)
  const liveSources = live ? live.nodes.filter((node) => node.kind === 'site').length : 0

  useEffect(() => {
    if (pendingFocus.current === null) return
    const index = pendingFocus.current
    pendingFocus.current = null
    const rows = listRef.current?.querySelectorAll<HTMLButtonElement>('[data-card-open]')
    const next = rows?.[Math.min(index, Math.max(0, (rows?.length ?? 0) - 1))]
    if (next) next.focus()
    else newRef.current?.focus()
  }, [total])

  /** Supprime une carte, puis ramène le focus dans la liste plutôt que nulle part. */
  const remove = async (id: string, index: number): Promise<void> => {
    setConfirmId(null)
    pendingFocus.current = index
    await removeMap(id)
    useBrowser.getState().toast('Carte supprimée.')
  }

  return (
    <div className="tabs-scroll work-cards">
      <div className="tabs-head">
        <span>Cartes du tunnel</span>
        <span className="tabs-count">{total}</span>
        <span className="tabs-tools">
          <button
            ref={newRef}
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

      <div className="tabs-group" ref={listRef}>
        {live && (
          <div className="work-card-row" data-active="true" data-live="true">
            <span className="work-card">
              <span className="work-card-title">{live.query || 'Recherche en cours'}</span>
              <span className="work-card-meta">
                {liveSources} source{liveSources > 1 ? 's' : ''} · en cours…
              </span>
            </span>
          </div>
        )}
        {visible.map((map, index) => (
          <div key={map.id} className="work-card-row" data-active={active?.id === map.id}>
            <button
              type="button"
              className="work-card"
              data-card-open
              onClick={() => void loadMap(map.id)}
              title={map.title}
            >
              <span className="work-card-title">{map.title}</span>
              <span className="work-card-meta">
                {map.sourceCount} source{map.sourceCount > 1 ? 's' : ''} · {timeAgo(map.updatedAt)}
              </span>
            </button>
            <button
              type="button"
              className="work-card-remove"
              data-confirm={confirmId === map.id}
              aria-label={
                confirmId === map.id
                  ? `Confirmer la suppression de « ${map.title} »`
                  : `Supprimer la carte « ${map.title} »`
              }
              title={confirmId === map.id ? 'Confirmer la suppression' : 'Supprimer cette carte'}
              onClick={() =>
                confirmId === map.id ? void remove(map.id, index) : setConfirmId(map.id)
              }
              onKeyDown={(event) => {
                if (event.key === 'Escape') setConfirmId(null)
              }}
              onBlur={() => setConfirmId((current) => (current === map.id ? null : current))}
            >
              <Icon name={confirmId === map.id ? 'check' : 'close'} size={13} />
            </button>
          </div>
        ))}
        {visible.length === 0 && !live && (
          <p className="tabs-empty">Aucune carte pour l’instant.</p>
        )}
      </div>

      <p className="work-hint">
        <Icon name="lock" size={11} /> Les cartes restent dans ce profil.
      </p>
    </div>
  )
}
