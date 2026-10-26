import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { normalizeShortcutUrl, sanitizeSpaceShortcuts, type SpaceShortcut } from '@shared/space'
import { hostOf } from '@shared/url'
import { useBrowser } from '../store/browser'
import Favicon from './Favicon'
import { Icon } from './Icon'

/** Favicon demandé directement au site épinglé : aucun tiers dans la boucle. */
function iconUrl(url: string): string | null {
  const host = hostOf(url)
  return host ? `https://${host}/favicon.ico` : null
}

/**
 * Barre de sites épinglés de l'espace affiché sur la page d'accueil. Elle ne
 * lit que l'espace de l'onglet courant : changer d'espace change la barre.
 */
export default function SpaceShortcuts({ spaceId }: { spaceId: string }) {
  const view = useBrowser((state) => state.view)
  const newTab = useBrowser((state) => state.newTab)
  const saveSpaceShortcuts = useBrowser((state) => state.saveSpaceShortcuts)
  const openSpaceDialog = useBrowser((state) => state.openSpaceDialog)
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const draggingRef = useRef<string | null>(null)

  const space = view?.spaces.find((item) => item.id === spaceId)
  if (!space) return null
  const shortcuts = space.shortcuts ?? []

  const commit = (next: SpaceShortcut[]): void => {
    void saveSpaceShortcuts(space.id, next)
  }

  const reorder = (fromId: string, toId: string): void => {
    const from = shortcuts.findIndex((item) => item.id === fromId)
    const to = shortcuts.findIndex((item) => item.id === toId)
    if (from < 0 || to < 0 || from === to) return
    const next = [...shortcuts]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    commit(next)
  }

  /** Adresse glissée depuis la page ou la barre d'adresse. */
  const addDropped = (raw: string): void => {
    const url = normalizeShortcutUrl(raw.split('\n')[0]?.trim())
    if (!url) return
    const [entry] = sanitizeSpaceShortcuts([{ url }])
    if (!entry || shortcuts.some((item) => item.url === entry.url)) return
    commit([...shortcuts, entry])
  }

  const dropOnBar = (event: DragEvent<HTMLElement>): void => {
    event.preventDefault()
    setOver(false)
    if (draggingRef.current) {
      draggingRef.current = null
      setDragging(null)
      return
    }
    addDropped(event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain'))
  }

  return (
    <section
      className="home-pins"
      aria-label={`Sites épinglés de ${space.name}`}
      data-over={over ? 'true' : undefined}
      onDragOver={(event) => {
        event.preventDefault()
        if (!draggingRef.current) setOver(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(false)
      }}
      onDrop={dropOnBar}
    >
      <div className="home-pins-head">
        <h2>
          Sites de {space.name}
          <span className="home-pins-count">
            {shortcuts.length > 0 ? `${shortcuts.length} épinglé${shortcuts.length > 1 ? 's' : ''}` : 'aucun site'}
          </span>
        </h2>
        <button
          type="button"
          className="home-card-action"
          onClick={() => openSpaceDialog(space.id)}
          title="Choisir les sites de cet espace"
        >
          <span>Modifier</span>
          <Icon name="arrow-right" size={12} />
        </button>
      </div>

      {shortcuts.length === 0 ? (
        <button type="button" className="pins-empty" onClick={() => openSpaceDialog(space.id)}>
          <Icon name="plus" size={13} />
          Épingler des sites pour cet espace — ou glissez une adresse ici
        </button>
      ) : (
        <div className="pin-grid">
          {shortcuts.map((shortcut) => (
            <div
              key={shortcut.id}
              className="pin-card"
              draggable
              data-drag={dragging === shortcut.id ? 'true' : undefined}
              onDragStart={(event) => {
                draggingRef.current = shortcut.id
                setDragging(shortcut.id)
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/uri-list', shortcut.url)
              }}
              onDragEnd={() => {
                draggingRef.current = null
                setDragging(null)
              }}
              onDragOver={(event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = draggingRef.current ? 'move' : 'copy'
              }}
              onDrop={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (draggingRef.current) {
                  reorder(draggingRef.current, shortcut.id)
                  draggingRef.current = null
                  setDragging(null)
                  return
                }
                addDropped(event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain'))
              }}
            >
              <button
                type="button"
                className="pin-open"
                onClick={() => newTab(shortcut.url)}
                title={`${shortcut.title} — ${hostOf(shortcut.url)}`}
              >
                <span className="pin-icon">
                  <Favicon src={iconUrl(shortcut.url)} label={shortcut.title} size={20} />
                </span>
                <span className="pin-copy">
                  <strong>{shortcut.title}</strong>
                  <small>{hostOf(shortcut.url)}</small>
                </span>
              </button>
              <button
                type="button"
                className="pin-remove"
                aria-label={`Retirer ${shortcut.title}`}
                title={`Retirer ${shortcut.title}`}
                onClick={() => commit(shortcuts.filter((item) => item.id !== shortcut.id))}
              >
                <Icon name="close" size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
