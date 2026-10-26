import { useEffect, useState } from 'react'
import { useTunnel } from '../store/tunnel'
import { Icon } from './Icon'
import { timeAgo } from '../lib/format'

export default function TunnelProjects() {
  const maps = useTunnel((s) => s.maps)
  const open = useTunnel((s) => s.projectsOpen)
  const setOpen = useTunnel((s) => s.setProjectsOpen)
  const refreshMaps = useTunnel((s) => s.refreshMaps)
  const loadMap = useTunnel((s) => s.loadMap)
  const renameMap = useTunnel((s) => s.renameMap)
  const removeMap = useTunnel((s) => s.removeMap)
  const duplicateMap = useTunnel((s) => s.duplicateMap)
  const active = useTunnel((s) => s.active)
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (open) void refreshMaps()
  }, [open, refreshMaps])

  if (!open) return null

  const visible = maps.filter((map) => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return true
    return `${map.title} ${map.query}`.toLowerCase().includes(needle)
  })

  return (
    <div className="tunnel-pop" role="dialog" aria-label="Cartes enregistrées" onMouseDown={() => setOpen(false)}>
      <div className="tunnel-pop-card" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <h2>Cartes enregistrées</h2>
            <p>Chaque tunnel lancé est conservé dans cet espace.</p>
          </div>
          <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Fermer">
            <Icon name="close" size={16} />
          </button>
        </header>
        <input
          className="tunnel-pop-search"
          placeholder="Filtrer par sujet"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          aria-label="Filtrer les cartes"
        />
        <div className="tunnel-pop-list">
          {visible.length === 0 && (
            <p className="tunnel-pop-empty">
              {maps.length === 0 ? 'Aucune carte pour le moment.' : 'Aucune carte ne correspond.'}
            </p>
          )}
          {visible.map((map) => (
            <div key={map.id} className="tunnel-project" data-active={active?.id === map.id}>
              {editing === map.id ? (
                <form
                  className="tunnel-rename"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void renameMap(map.id, draft)
                    setEditing(null)
                  }}
                >
                  <input
                    autoFocus
                    value={draft}
                    aria-label="Nom de la carte"
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setEditing(null)
                    }}
                  />
                  <button type="submit" className="ghost-btn">
                    Renommer
                  </button>
                </form>
              ) : (
                <button type="button" className="tunnel-project-main" onClick={() => void loadMap(map.id)}>
                  <strong>{map.title}</strong>
                  <span>
                    {map.sourceCount} source{map.sourceCount > 1 ? 's' : ''} · {timeAgo(map.updatedAt)}
                  </span>
                </button>
              )}
              <div className="tunnel-project-actions">
                <button
                  type="button"
                  className="icon-btn"
                  title="Renommer"
                  aria-label={`Renommer ${map.title}`}
                  onClick={() => {
                    setDraft(map.title)
                    setEditing(map.id)
                  }}
                >
                  <Icon name="edit" size={13} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title="Dupliquer"
                  aria-label={`Dupliquer ${map.title}`}
                  onClick={() => void duplicateMap(map.id)}
                >
                  <Icon name="copy" size={13} />
                </button>
                <button
                  type="button"
                  className="icon-btn danger"
                  title="Supprimer la carte"
                  aria-label={`Supprimer ${map.title}`}
                  onClick={() => void removeMap(map.id)}
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
