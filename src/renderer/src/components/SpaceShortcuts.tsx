import { useEffect, useRef, useState } from 'react'
import type { DragEvent, KeyboardEvent } from 'react'
import { MAX_SHORTCUTS, normalizeShortcutUrl, sanitizeSpaceShortcuts, type SpaceShortcut } from '@shared/space'
import { hostOf } from '@shared/url'
import { useBrowser } from '../store/browser'
import Favicon from './Favicon'
import { Icon } from './Icon'
import TileMenu, { type TileMenuItem } from './TileMenu'

type Editing = { id: string; field: 'title' | 'url' } | null
type Transfer = { action: 'copy' | 'move'; shortcut: SpaceShortcut; from: string; to: string; index: number } | null

/**
 * Barre de sites épinglés de l'espace affiché sur la page d'accueil. Elle ne
 * lit que l'espace de l'onglet courant : changer d'espace change la barre.
 * Le transfert vers un autre espace ne transporte que l'adresse et le nom.
 */
export default function SpaceShortcuts({ spaceId }: { spaceId: string }) {
  const view = useBrowser((state) => state.view)
  const newTab = useBrowser((state) => state.newTab)
  const openSplit = useBrowser((state) => state.openSplit)
  const saveSpaceShortcuts = useBrowser((state) => state.saveSpaceShortcuts)
  const openSpaceDialog = useBrowser((state) => state.openSpaceDialog)
  const toast = useBrowser((state) => state.toast)

  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const draggingRef = useRef<string | null>(null)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [editing, setEditing] = useState<Editing>(null)
  const [draft, setDraft] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [announce, setAnnounce] = useState('')
  const [transfer, setTransfer] = useState<Transfer>(null)
  const focusAfter = useRef<string | null>(null)

  const space = view?.spaces.find((item) => item.id === spaceId)
  const shortcuts = space?.shortcuts ?? []

  // Après un déplacement, la carte déplacée reprend le focus.
  useEffect(() => {
    const id = focusAfter.current
    if (!id) return
    focusAfter.current = null
    document
      .querySelector<HTMLElement>(`.pin-card[data-shortcut-id="${CSS.escape(id)}"] .pin-open`)
      ?.focus()
  }, [view])

  if (!space) return null

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
    focusAfter.current = fromId
    commit(next)
    setAnnounce(`Site déplacé en position ${to + 1} sur ${next.length}`)
  }

  /** Adresse glissée depuis la page ou la barre d'adresse. */
  const addDropped = (raw: string): void => {
    const url = normalizeShortcutUrl(raw.split('\n')[0]?.trim())
    if (!url) return
    const [entry] = sanitizeSpaceShortcuts([{ url }])
    if (!entry || shortcuts.some((item) => item.url === entry.url)) return
    if (shortcuts.length >= MAX_SHORTCUTS) {
      toast(`${MAX_SHORTCUTS} sites au maximum dans cet espace.`, 'error')
      return
    }
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

  /** Alt + flèches : même déplacement que le glisser, bords inertes. */
  const moveWithKeyboard = (event: KeyboardEvent<HTMLElement>, shortcut: SpaceShortcut): void => {
    if (!event.altKey) return
    const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    if (!step) return
    const index = shortcuts.findIndex((item) => item.id === shortcut.id)
    const target = index + step
    if (index < 0 || target < 0 || target >= shortcuts.length) return
    event.preventDefault()
    event.stopPropagation()
    const next = [...shortcuts]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    focusAfter.current = shortcut.id
    commit(next)
    setAnnounce(`Site déplacé en position ${target + 1} sur ${next.length}`)
  }

  const copyAddress = async (url: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url)
      setAnnounce('Adresse copiée.')
    } catch {
      toast('Copie impossible.', 'error')
    }
  }

  const startEdit = (shortcut: SpaceShortcut, field: 'title' | 'url'): void => {
    setEditing({ id: shortcut.id, field })
    setDraft(field === 'title' ? shortcut.title : shortcut.url)
    setEditError(null)
  }

  const cancelEdit = (): void => {
    const id = editing?.id
    setEditing(null)
    setEditError(null)
    setDraft('')
    if (!id) return
    // Sans cela, le focus repartirait du début après la disparition du champ.
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`.pin-card[data-shortcut-id="${CSS.escape(id)}"] .pin-open`)?.focus()
    })
  }

  const saveEdit = (): void => {
    if (!editing) return
    const value = draft.trim()
    if (editing.field === 'title') {
      if (!value) {
        setEditError('Le nom ne peut pas être vide.')
        return
      }
      const next = shortcuts.map((item) =>
        item.id === editing.id ? { ...item, title: value.slice(0, 80) } : item
      )
      cancelEdit()
      commit(next)
      setAnnounce('Site renommé.')
      return
    }

    const url = normalizeShortcutUrl(value)
    if (!url) {
      setEditError('Adresse invalide : elle doit commencer par http:// ou https://.')
      return
    }
    if (shortcuts.some((item) => item.id !== editing.id && item.url === url)) {
      setEditError('Cette adresse est déjà dans cet espace.')
      return
    }
    const next = shortcuts.map((item) => (item.id === editing.id ? { ...item, url } : item))
    cancelEdit()
    commit(next)
    setAnnounce('Adresse mise à jour.')
  }

  const transferTo = (shortcut: SpaceShortcut, targetId: string, action: 'copy' | 'move'): void => {
    const target = view?.spaces.find((item) => item.id === targetId)
    if (!target) return
    const targetList = target.shortcuts ?? []
    if (targetList.some((item) => item.url === shortcut.url)) {
      setAnnounce(`Déjà présent dans ${target.name}.`)
      toast(`Déjà présent dans ${target.name}.`, 'error')
      return
    }
    if (targetList.length >= MAX_SHORTCUTS) {
      setAnnounce(`${target.name} est plein.`)
      toast(`${MAX_SHORTCUTS} sites au maximum dans ${target.name}.`, 'error')
      return
    }
    const index = shortcuts.findIndex((item) => item.id === shortcut.id)
    void saveSpaceShortcuts(target.id, [...targetList, shortcut])
    if (action === 'move') {
      commit(shortcuts.filter((item) => item.id !== shortcut.id))
      setAnnounce(`Déplacé vers ${target.name}.`)
    } else {
      setAnnounce(`Copié vers ${target.name}.`)
    }
    setTransfer({ action, shortcut, from: space.id, to: target.id, index: Math.max(0, index) })
  }

  const undoTransfer = (): void => {
    if (!transfer) return
    const target = view?.spaces.find((item) => item.id === transfer.to)
    if (target) {
      void saveSpaceShortcuts(
        target.id,
        (target.shortcuts ?? []).filter((item) => item.id !== transfer.shortcut.id)
      )
    }
    if (transfer.action === 'move') {
      const current = space.shortcuts ?? []
      if (!current.some((item) => item.id === transfer.shortcut.id)) {
        const restored = [...current]
        restored.splice(Math.min(transfer.index, restored.length), 0, transfer.shortcut)
        commit(restored)
      }
    }
    setTransfer(null)
    setAnnounce('Transfert annulé.')
  }

  const others = (view?.spaces ?? []).filter((item) => item.id !== space.id)

  const menuItems = (shortcut: SpaceShortcut): TileMenuItem[] => {
    const targets = (action: 'copy' | 'move'): TileMenuItem[] =>
      others.map((item) => ({
        id: `${action}-${item.id}`,
        label: item.name,
        icon: 'folder',
        onSelect: () => transferTo(shortcut, item.id, action)
      }))
    const items: TileMenuItem[] = [
      { id: 'rename', label: 'Renommer', icon: 'edit', onSelect: () => startEdit(shortcut, 'title') },
      { id: 'url', label: 'Modifier l’adresse', icon: 'link', onSelect: () => startEdit(shortcut, 'url') },
      {
        id: 'copy',
        label: 'Copier l’adresse',
        icon: 'copy',
        onSelect: () => void copyAddress(shortcut.url)
      },
      {
        id: 'split',
        label: 'Ouvrir en vue scindée',
        icon: 'split',
        onSelect: () => openSplit(shortcut.url)
      }
    ]
    if (others.length > 0) {
      items.push({ id: 'copy-to', label: 'Copier vers…', icon: 'folder', submenu: targets('copy') })
      items.push({ id: 'move-to', label: 'Déplacer vers…', icon: 'arrow-right', submenu: targets('move') })
    }
    items.push({
      id: 'remove',
      label: 'Retirer',
      icon: 'trash',
      danger: true,
      onSelect: () => {
        commit(shortcuts.filter((item) => item.id !== shortcut.id))
        setAnnounce('Site retiré.')
      }
    })
    return items
  }

  const openMenu = (shortcut: SpaceShortcut, x: number, y: number): void => setMenu({ id: shortcut.id, x, y })

  const menuShortcut = menu ? shortcuts.find((item) => item.id === menu.id) : null

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
        <div className="pin-grid" role="list" aria-label={`Sites de ${space.name} — Alt + flèches pour réordonner`}>
          {shortcuts.map((shortcut) => {
            const isEditingTitle = editing?.id === shortcut.id && editing.field === 'title'
            return (
              <div
                key={shortcut.id}
                className="pin-card"
                role="listitem"
                draggable={!editing}
                data-shortcut-id={shortcut.id}
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
                {editing?.id === shortcut.id ? (
                  <form
                    className="pin-edit-form"
                    onSubmit={(event) => {
                      event.preventDefault()
                      saveEdit()
                    }}
                  >
                    <span className="pin-edit-label">{isEditingTitle ? 'Nom' : 'Adresse'}</span>
                    <input
                      className="pin-input"
                      value={draft}
                      maxLength={isEditingTitle ? 80 : 2000}
                      autoFocus
                      aria-label={isEditingTitle ? 'Nom du site' : 'Adresse du site'}
                      onChange={(event) => {
                        setDraft(event.target.value)
                        setEditError(null)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault()
                          cancelEdit()
                        }
                      }}
                    />
                    <button type="submit" className="tab-action" title="Valider (Entrée)">
                      <Icon name="check" size={12} />
                    </button>
                    <button type="button" className="tab-action" title="Annuler (Échap)" onClick={cancelEdit}>
                      <Icon name="close" size={12} />
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="pin-open"
                    onClick={() => newTab(shortcut.url)}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      openMenu(shortcut, event.clientX, event.clientY)
                    }}
                    onKeyDown={(event) => {
                      moveWithKeyboard(event, shortcut)
                      if (event.defaultPrevented) return
                      if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
                      event.preventDefault()
                      const rect = event.currentTarget.getBoundingClientRect()
                      openMenu(shortcut, rect.left, rect.bottom)
                    }}
                    title={`${shortcut.title} — ${hostOf(shortcut.url)}`}
                  >
                    <span className="pin-icon">
                      <Favicon url={shortcut.url} label={shortcut.title} size={20} spaceId={space.id} />
                    </span>
                    <span className="pin-copy">
                      <strong>{shortcut.title}</strong>
                      <small>{hostOf(shortcut.url)}</small>
                    </span>
                  </button>
                )}

                {!editing && (
                  <button
                    type="button"
                    className="pin-remove"
                    aria-label={`Retirer ${shortcut.title}`}
                    title={`Retirer ${shortcut.title}`}
                    onClick={() => {
                      commit(shortcuts.filter((item) => item.id !== shortcut.id))
                      setAnnounce('Site retiré.')
                    }}
                  >
                    <Icon name="close" size={11} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {editError && (
        <p className="pin-error" role="alert">
          <Icon name="warning" size={12} />
          {editError}
        </p>
      )}

      {transfer && transfer.from === space.id && (
        <p className="pin-transfer">
          <Icon name={transfer.action === 'copy' ? 'copy' : 'arrow-right'} size={12} />
          <span>
            {transfer.action === 'copy' ? 'Copié' : 'Déplacé'} vers{' '}
            {view?.spaces.find((item) => item.id === transfer.to)?.name ?? 'un autre espace'} —{' '}
            {transfer.shortcut.title}
          </span>
          <button type="button" className="pin-undo" onClick={undoTransfer}>
            Annuler
          </button>
        </p>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>

      {menu && menuShortcut && (
        <TileMenu
          x={menu.x}
          y={menu.y}
          label={menuShortcut.title}
          items={menuItems(menuShortcut)}
          onClose={() => {
            const id = menu.id
            setMenu(null)
            requestAnimationFrame(() => {
              document.querySelector<HTMLElement>(`.pin-card[data-shortcut-id="${CSS.escape(id)}"] .pin-open`)?.focus()
            })
          }}
        />
      )}
    </section>
  )
}
