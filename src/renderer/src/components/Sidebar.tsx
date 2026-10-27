import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, DragEvent, KeyboardEvent } from 'react'
import type { Bookmark, TabGroup, TabView } from '@shared/types'
import { hostOf } from '@shared/url'
import { useBrowser } from '../store/browser'
import Favicon from './Favicon'
import { Icon } from './Icon'
import TabRow from './TabRow'
import TileMenu, { type TileMenuItem } from './TileMenu'
import TunnelSidebar from './TunnelSidebar'
import SpaceAvatar from './SpaceAvatar'

type DropTarget =
  | { kind: 'tab'; id: string; edge: 'before' | 'after' }
  | { kind: 'group'; id: string }
  | { kind: 'loose' }
  | { kind: 'pinned-end' }
  | null

type MenuState =
  | { kind: 'tab'; tab: TabView; x: number; y: number }
  | { kind: 'bookmark'; bookmark: Bookmark; x: number; y: number }

/** Au-delà, une tuile « +N » ouvre la liste complète plutôt que de tronquer. */
const FAVORITE_LIMIT = 12

export default function Sidebar() {
  const view = useBrowser((state) => state.view)
  const setOverlay = useBrowser((state) => state.setOverlay)
  const selectTab = useBrowser((state) => state.selectTab)
  const openSpaceDialog = useBrowser((state) => state.openSpaceDialog)
  const workMode = useBrowser((state) => state.workMode)
  const newTab = useBrowser((state) => state.newTab)
  const closeTab = useBrowser((state) => state.closeTab)
  const pin = useBrowser((state) => state.pin)
  const splitWith = useBrowser((state) => state.splitWith)
  const removeBookmark = useBrowser((state) => state.removeBookmark)
  const moveBookmark = useBrowser((state) => state.moveBookmark)
  const toast = useBrowser((state) => state.toast)
  const reorderTab = useBrowser((state) => state.reorderTab)
  const moveTabToGroup = useBrowser((state) => state.moveTabToGroup)
  const createGroup = useBrowser((state) => state.createGroup)
  const updateGroup = useBrowser((state) => state.updateGroup)
  const removeGroup = useBrowser((state) => state.removeGroup)

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const draggingRef = useRef<string | null>(null)
  const dragCancelled = useRef(false)
  const [drop, setDrop] = useState<DropTarget>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmGroup, setConfirmGroup] = useState<string | null>(null)
  // Infobulle des cases compactes : positionnée en `fixed` pour ne pas être
  // rognée par la liste qui défile.
  const [tip, setTip] = useState<{ title: string; host: string; x: number; y: number } | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  // Message lu par le lecteur d'écran après un déplacement.
  const [announce, setAnnounce] = useState('')
  const cancelRename = useRef(false)
  // Après un déplacement, la case déplacée reprend le focus une fois la
  // nouvelle ordonnance arrivée : sans cela, Tab repartirait du début.
  const focusAfterMove = useRef<string | null>(null)
  // Annonce différée : il faut la nouvelle ordonnance pour compter les places.
  const pendingMove = useRef<{ kind: 'tab' | 'bookmark'; id: string; from: boolean } | null>(null)
  // Glisser d'un favori : distinct des onglets, avec son propre indicateur.
  const [favDragId, setFavDragId] = useState<string | null>(null)
  const favDragRef = useRef<string | null>(null)
  const [favDrop, setFavDrop] = useState<{ id: string; edge: 'before' | 'after' } | null>(null)

  useEffect(() => {
    const id = focusAfterMove.current
    if (!id) return
    focusAfterMove.current = null
    const selector = [
      `.mini-tile[data-tab-id="${CSS.escape(id)}"]`,
      `.tab-row[data-tab-id="${CSS.escape(id)}"]`,
      `.mini-tile[data-bookmark-id="${CSS.escape(id)}"]`
    ].join(', ')
    // Un favori déplacé au-delà des cases visibles laisse le focus sur « +N ».
    const node = document.querySelector<HTMLElement>(selector) ?? document.querySelector<HTMLElement>('.mini-tile-more')
    node?.focus()
  }, [view])

  useEffect(() => {
    const pending = pendingMove.current
    if (!pending || !view) return
    pendingMove.current = null

    if (pending.kind === 'bookmark') {
      const index = view.bookmarks.findIndex((entry) => entry.id === pending.id) + 1
      if (index > 0) setAnnounce(`Favori déplacé en position ${index} sur ${view.bookmarks.length}`)
      return
    }

    const tab = view.tabs.find((item) => item.id === pending.id)
    if (!tab) return
    const list = view.tabs.filter((item) => item.spaceId === tab.spaceId && item.pinned === tab.pinned)
    const index = list.findIndex((item) => item.id === tab.id) + 1
    setAnnounce(
      tab.pinned !== pending.from
        ? `${tab.pinned ? 'Onglet épinglé' : 'Onglet désépinglé'}, position ${index} sur ${list.length}`
        : `${tab.pinned ? 'Épinglé' : 'Onglet'} déplacé en position ${index} sur ${list.length}`
    )
  }, [view])

  useEffect(() => {
    if (!draggingId && !favDragId) return
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      dragCancelled.current = true
      setDrop(null)
      setFavDrop(null)
      setAnnounce('Déplacement annulé.')
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [draggingId, favDragId])

  const closeMenu = useCallback((focusId?: string) => {
    setMenu(null)
    if (!focusId) return
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(
          `.mini-tile[data-tab-id="${CSS.escape(focusId)}"], [data-bookmark-id="${CSS.escape(focusId)}"]`
        )
        ?.focus()
    })
  }, [])

  if (!view) return <aside className="sidebar" />

  const space = view.spaces.find((item) => item.id === view.activeSpaceId) ?? view.spaces[0]
  const spaceTabs = view.tabs.filter((tab) => tab.spaceId === space.id)
  const pinned = spaceTabs.filter((tab) => tab.pinned)
  const unpinned = spaceTabs.filter((tab) => !tab.pinned)
  const groups = view.groups
    .filter((group) => group.spaceId === space.id)
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
  const groupIds = new Set(groups.map((group) => group.id))
  const loose = unpinned.filter((tab) => !tab.groupId || !groupIds.has(tab.groupId))
  const pinnedCount = pinned.length
  const visibleBookmarks =
    view.bookmarks.length > FAVORITE_LIMIT ? view.bookmarks.slice(0, FAVORITE_LIMIT - 1) : view.bookmarks
  const hiddenBookmarks = view.bookmarks.length - visibleBookmarks.length

  const sourceTab = (): TabView | undefined =>
    draggingRef.current ? spaceTabs.find((tab) => tab.id === draggingRef.current) : undefined

  const showTip = (event: { currentTarget: HTMLElement }, item: { title: string; url: string }): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    setTip({
      title: item.title,
      host: hostOf(item.url),
      x: rect.right + 8,
      y: rect.top + rect.height / 2
    })
  }

  const hideTip = (): void => setTip((current) => (current ? null : current))

  const copyAddress = async (url: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url)
      setAnnounce('Adresse copiée.')
      toast('Adresse copiée.')
    } catch {
      toast('Copie impossible.', 'error')
    }
  }

  const commitMove = (id: string, from: boolean): void => {
    focusAfterMove.current = id
    pendingMove.current = { kind: 'tab', id, from }
  }

  const beginDrag = (event: DragEvent<HTMLElement>, tab: TabView): void => {
    draggingRef.current = tab.id
    dragCancelled.current = false
    setDraggingId(tab.id)
    setDrop(null)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', tab.id)
  }

  const endDrag = (): void => {
    draggingRef.current = null
    dragCancelled.current = false
    setDraggingId(null)
    setDrop(null)
  }

  const canDropOnTab = (target: TabView): boolean => {
    const source = sourceTab()
    return Boolean(source && source.id !== target.id)
  }

  const overTab = (event: DragEvent<HTMLDivElement>, tab: TabView): void => {
    if (!canDropOnTab(tab)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    const rect = event.currentTarget.getBoundingClientRect()
    setDrop({
      kind: 'tab',
      id: tab.id,
      edge: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    })
  }

  const dropOnTab = (event: DragEvent<HTMLDivElement>, tab: TabView): void => {
    if (!canDropOnTab(tab)) return
    event.preventDefault()
    event.stopPropagation()
    const source = sourceTab()
    if (!source) return
    if (dragCancelled.current) {
      endDrag()
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    reorderTab(source.id, tab.id, event.clientY < rect.top + rect.height / 2 ? 'before' : 'after', tab.pinned)
    commitMove(source.id, source.pinned)
    endDrag()
  }

  const overGroup = (event: DragEvent<HTMLDivElement>, group: TabGroup): void => {
    const source = sourceTab()
    if (!source || source.pinned) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    setDrop({ kind: 'group', id: group.id })
  }

  const dropOnGroup = (event: DragEvent<HTMLDivElement>, group: TabGroup): void => {
    const source = sourceTab()
    if (!source || source.pinned) return
    event.preventDefault()
    event.stopPropagation()
    if (dragCancelled.current) {
      endDrag()
      return
    }
    moveTabToGroup(source.id, group.id)
    endDrag()
  }

  const overLoose = (event: DragEvent<HTMLElement>): void => {
    const source = sourceTab()
    if (!source) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    setDrop({ kind: 'loose' })
  }

  const dropOnLoose = (event: DragEvent<HTMLElement>): void => {
    const source = sourceTab()
    if (!source) return
    event.preventDefault()
    event.stopPropagation()
    if (dragCancelled.current) {
      endDrag()
      return
    }
    if (source.pinned) {
      reorderTab(source.id, null, 'after', false)
      commitMove(source.id, true)
    } else {
      moveTabToGroup(source.id, null)
    }
    endDrag()
  }

  const overPinnedEnd = (event: DragEvent<HTMLElement>): void => {
    const source = sourceTab()
    if (!source || source.pinned) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    setDrop({ kind: 'pinned-end' })
  }

  const dropOnPinnedEnd = (event: DragEvent<HTMLElement>): void => {
    const source = sourceTab()
    if (!source || source.pinned) return
    event.preventDefault()
    event.stopPropagation()
    if (dragCancelled.current) {
      endDrag()
      return
    }
    reorderTab(source.id, null, 'after', true)
    commitMove(source.id, source.pinned)
    endDrag()
  }

  /** Position absolue dans la liste complète, calculée sans le favori déplacé. */
  const bookmarkTarget = (id: string, target: Bookmark, edge: 'before' | 'after'): number => {
    const without = view.bookmarks.filter((entry) => entry.id !== id)
    const index = without.findIndex((entry) => entry.id === target.id)
    return edge === 'before' ? index : index + 1
  }

  const beginFavDrag = (event: DragEvent<HTMLElement>, bookmark: Bookmark): void => {
    favDragRef.current = bookmark.id
    dragCancelled.current = false
    setFavDragId(bookmark.id)
    setFavDrop(null)
    event.dataTransfer.effectAllowed = 'move'
    // Type dédié : un onglet glissé sur la grille n'est pas pris pour un favori.
    event.dataTransfer.setData('application/x-vela-bookmark', bookmark.id)
  }

  const endFavDrag = (): void => {
    favDragRef.current = null
    setFavDragId(null)
    setFavDrop(null)
  }

  const overFav = (event: DragEvent<HTMLElement>, bookmark: Bookmark): void => {
    const id = favDragRef.current
    if (!id || id === bookmark.id) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    const rect = event.currentTarget.getBoundingClientRect()
    setFavDrop({ id: bookmark.id, edge: event.clientX < rect.left + rect.width / 2 ? 'before' : 'after' })
  }

  const dropOnFav = (event: DragEvent<HTMLElement>, bookmark: Bookmark): void => {
    const id = favDragRef.current
    if (!id || id === bookmark.id) return
    event.preventDefault()
    event.stopPropagation()
    if (dragCancelled.current) {
      endFavDrag()
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const edge = event.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
    const position = bookmarkTarget(id, bookmark, edge)
    focusAfterMove.current = id
    pendingMove.current = { kind: 'bookmark', id, from: false }
    endFavDrag()
    void moveBookmark(id, position)
  }

  /** Alt + flèches : même déplacement que le glisser, bords inertes. */
  const moveFavorite = (event: KeyboardEvent<HTMLElement>, bookmark: Bookmark): void => {
    if (!event.altKey) return
    const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    if (!step) return
    const index = view.bookmarks.findIndex((entry) => entry.id === bookmark.id)
    const position = index + step
    if (index < 0 || position < 0 || position >= view.bookmarks.length) return
    event.preventDefault()
    event.stopPropagation()
    hideTip()
    focusAfterMove.current = bookmark.id
    pendingMove.current = { kind: 'bookmark', id: bookmark.id, from: false }
    void moveBookmark(bookmark.id, position)
  }

  const canDropOnTile = (tab: TabView): boolean => {
    const source = sourceTab()
    return Boolean(source && source.id !== tab.id)
  }

  const overTile = (event: DragEvent<HTMLElement>, tab: TabView): void => {
    if (!canDropOnTile(tab)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
  }

  const dropOnTile = (event: DragEvent<HTMLElement>, tab: TabView): void => {
    if (!canDropOnTile(tab)) return
    event.preventDefault()
    event.stopPropagation()
    const source = sourceTab()
    if (!source) return
    if (dragCancelled.current) {
      endDrag()
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    reorderTab(source.id, tab.id, event.clientX < rect.left + rect.width / 2 ? 'before' : 'after', tab.pinned)
    commitMove(source.id, source.pinned)
    endDrag()
  }

  /** Alt + flèches : même déplacement que le glisser, sans quitter le clavier. */
  const moveTile = (event: KeyboardEvent<HTMLElement>, tab: TabView, list: TabView[]): void => {
    if (!event.altKey) return
    const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    if (!step) return
    const index = list.findIndex((item) => item.id === tab.id)
    const target = list[index + step]
    if (index < 0 || !target) return
    event.preventDefault()
    event.stopPropagation()
    hideTip()
    reorderTab(tab.id, target.id, step < 0 ? 'before' : 'after')
    commitMove(tab.id, tab.pinned)
  }

  const openTabMenu = (tab: TabView, x: number, y: number): void => {
    hideTip()
    setMenu({ kind: 'tab', tab, x, y })
  }

  const openBookmarkMenu = (bookmark: Bookmark, x: number, y: number): void => {
    hideTip()
    setMenu({ kind: 'bookmark', bookmark, x, y })
  }

  const menuItems = (state: MenuState): TileMenuItem[] => {
    if (!state) return []
    if (state.kind === 'tab') {
      return [
        { id: 'close', label: 'Fermer', icon: 'close', onSelect: () => closeTab(state.tab.id) },
        { id: 'unpin', label: 'Désépingler', icon: 'pin', onSelect: () => pin(state.tab.id, false) },
        { id: 'copy', label: 'Copier l’adresse', icon: 'copy', onSelect: () => void copyAddress(state.tab.url) },
        {
          id: 'split',
          label: 'Ouvrir en vue scindée',
          icon: 'split',
          onSelect: () => splitWith(state.tab.id)
        },
        {
          id: 'new',
          label: 'Ouvrir dans un nouvel onglet',
          icon: 'external',
          onSelect: () => newTab(state.tab.url)
        }
      ]
    }
    return [
      {
        id: 'remove',
        label: 'Retirer',
        icon: 'trash',
        danger: true,
        onSelect: () => void removeBookmark(state.bookmark.id)
      },
      {
        id: 'copy',
        label: 'Copier l’adresse',
        icon: 'copy',
        onSelect: () => void copyAddress(state.bookmark.url)
      },
      { id: 'open', label: 'Ouvrir', icon: 'external', onSelect: () => newTab(state.bookmark.url) }
    ]
  }

  /** Touches Menu et ⇧F10 : même menu que le clic droit, au clavier. */
  const menuKey = (event: KeyboardEvent<HTMLElement>): boolean => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return false
    event.preventDefault()
    event.stopPropagation()
    return true
  }

  const startRename = (group: TabGroup): void => {
    cancelRename.current = false
    setRenamingId(group.id)
    setRenameValue(group.name)
    setConfirmGroup(null)
  }

  const commitRename = (): void => {
    if (cancelRename.current) {
      cancelRename.current = false
      return
    }
    const id = renamingId
    if (!id) return
    void updateGroup(id, { name: renameValue.trim() || 'Dossier' })
    setRenamingId(null)
  }

  const createFolder = async (): Promise<void> => {
    const active = spaceTabs.find((tab) => tab.id === view.activeTabId)
    const tabId = active && !active.pinned && !active.groupId ? active.id : undefined
    const group = await createGroup(tabId)
    if (group) {
      cancelRename.current = false
      setRenamingId(group.id)
      setRenameValue(group.name)
    }
  }

  const requestDelete = (group: TabGroup): void => {
    if (confirmGroup === group.id) {
      setConfirmGroup(null)
      void removeGroup(group.id)
      return
    }
    setConfirmGroup(group.id)
    setTimeout(() => {
      setConfirmGroup((current) => (current === group.id ? null : current))
    }, 3500)
  }

  const renderTab = (tab: TabView) => (
    <TabRow
      key={tab.id}
      tab={tab}
      active={tab.id === view.activeTabId}
      secondary={view.split && tab.id === view.secondTabId}
      dragging={draggingId === tab.id}
      dropEdge={drop?.kind === 'tab' && drop.id === tab.id ? drop.edge : null}
      onDragStart={beginDrag}
      onDragEnd={endDrag}
      onDragOver={overTab}
      onDrop={dropOnTab}
    />
  )

  const draggingTab = sourceTab()

  return (
    <aside className="sidebar" style={{ '--space': space.color } as CSSProperties}>
      <header className="sidebar-top drag">
        <span className="wordmark">
          Vela<span className="wordmark-dot">.</span>
        </span>
      </header>

      <div className="space-head">
        <SpaceAvatar space={space} size={18} />
        <button type="button" className="space-name" onDoubleClick={() => openSpaceDialog(space.id)}>
          {space.name}
        </button>
        <button
          type="button"
          className="icon-btn subtle"
          title="Modifier l’espace"
          onClick={() => openSpaceDialog(space.id)}
        >
          <Icon name="edit" size={13} />
        </button>
      </div>

      <button type="button" className="brief-card" onClick={() => setOverlay('brief')}>
        <span className="brief-kicker">
          <Icon name="calendar" size={13} />
          Brief du jour
        </span>
        <span className="brief-date">{view.brief.dateLabel}</span>
        <span className="brief-arrow">
          <Icon name="arrow-right" size={14} />
        </span>
      </button>

      {workMode === 'work' ? (
        <TunnelSidebar spaceId={space.id} />
      ) : (
        <div className="tabs-scroll" onScroll={hideTip}>
          {pinnedCount > 0 && (
            <>
              <div className="tabs-head">
                <span>Épinglés</span>
                <span className="tabs-count">{pinnedCount}</span>
              </div>
              <div
                className="mini-grid"
                role="list"
                aria-label={`Sites épinglés de ${space.name} — Alt + flèches pour réordonner`}
                data-drop={drop?.kind === 'pinned-end'}
                onDragOver={overPinnedEnd}
                onDrop={dropOnPinnedEnd}
              >
                {pinned.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="listitem"
                    className="mini-tile"
                    data-tab-id={tab.id}
                    data-active={tab.id === view.activeTabId}
                    data-secondary={view.split && tab.id === view.secondTabId ? 'true' : undefined}
                    data-dragging={draggingId === tab.id ? 'true' : undefined}
                    draggable
                    aria-label={`${tab.title} — ${hostOf(tab.url)}`}
                    onMouseEnter={(event) => showTip(event, tab)}
                    onMouseLeave={hideTip}
                    onFocus={(event) => showTip(event, tab)}
                    onBlur={hideTip}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      openTabMenu(tab, event.clientX, event.clientY)
                    }}
                    onDragStart={(event) => {
                      hideTip()
                      beginDrag(event, tab)
                    }}
                    onDragEnd={endDrag}
                    onDragOver={(event) => overTile(event, tab)}
                    onDrop={(event) => dropOnTile(event, tab)}
                    onKeyDown={(event) => {
                      moveTile(event, tab, pinned)
                      if (event.defaultPrevented) return
                      if (!menuKey(event)) return
                      const rect = event.currentTarget.getBoundingClientRect()
                      openTabMenu(tab, rect.left, rect.bottom)
                    }}
                    onClick={() => selectTab(tab.id)}
                  >
                    <Favicon src={tab.favicon} url={tab.url} label={tab.title} size={18} spaceId={space.id} />
                  </button>
                ))}
              </div>
            </>
          )}

          {view.bookmarks.length > 0 && (
            <>
              <div className="tabs-head">
                <span>Favoris</span>
                <span className="tabs-count">{view.bookmarks.length}</span>
                <span className="tabs-tools">
                  <button
                    type="button"
                    className="icon-btn subtle"
                    title="Tous les favoris"
                    onClick={() => setOverlay('bookmarks')}
                  >
                    <Icon name="arrow-right" size={14} />
                  </button>
                </span>
              </div>
              <div
                className="mini-grid"
                role="list"
                aria-label="Favoris — Alt + flèches pour réordonner"
                data-dragging={favDragId ? 'true' : undefined}
              >
                {visibleBookmarks.map((bookmark) => (
                  <button
                    key={bookmark.id}
                    type="button"
                    role="listitem"
                    className="mini-tile"
                    data-bookmark-id={bookmark.id}
                    data-dragging={favDragId === bookmark.id ? 'true' : undefined}
                    data-drop={favDrop && favDrop.id === bookmark.id ? favDrop.edge : undefined}
                    aria-label={`${bookmark.title} — ${hostOf(bookmark.url)}`}
                    draggable
                    onMouseEnter={(event) => showTip(event, bookmark)}
                    onMouseLeave={hideTip}
                    onFocus={(event) => showTip(event, bookmark)}
                    onBlur={hideTip}
                    onDragStart={(event) => {
                      hideTip()
                      beginFavDrag(event, bookmark)
                    }}
                    onDragEnd={endFavDrag}
                    onDragOver={(event) => overFav(event, bookmark)}
                    onDragLeave={() =>
                      setFavDrop((current) => (current?.id === bookmark.id ? null : current))
                    }
                    onDrop={(event) => dropOnFav(event, bookmark)}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      openBookmarkMenu(bookmark, event.clientX, event.clientY)
                    }}
                    onKeyDown={(event) => {
                      moveFavorite(event, bookmark)
                      if (event.defaultPrevented) return
                      if (!menuKey(event)) return
                      const rect = event.currentTarget.getBoundingClientRect()
                      openBookmarkMenu(bookmark, rect.left, rect.bottom)
                    }}
                    onClick={() => newTab(bookmark.url)}
                  >
                    <Favicon
                      src={bookmark.favicon}
                      url={bookmark.url}
                      label={bookmark.title}
                      size={18}
                      spaceId={space.id}
                    />
                  </button>
                ))}
                {hiddenBookmarks > 0 && (
                  <button
                    type="button"
                    role="listitem"
                    className="mini-tile mini-tile-more"
                    aria-label={`Voir les ${hiddenBookmarks} autres favoris`}
                    title={`${hiddenBookmarks} autres favoris`}
                    onClick={() => setOverlay('bookmarks')}
                  >
                    <span aria-hidden="true">+{hiddenBookmarks}</span>
                  </button>
                )}
              </div>
            </>
          )}

          {draggingTab && (
            <div
              className="drop-zone"
              data-active={drop?.kind === (draggingTab.pinned ? 'loose' : 'pinned-end')}
              onDragOver={draggingTab.pinned ? overLoose : overPinnedEnd}
              onDrop={draggingTab.pinned ? dropOnLoose : dropOnPinnedEnd}
            >
              {draggingTab.pinned ? 'Déposer ici pour désépingler' : 'Déposer ici pour épingler'}
            </div>
          )}

          <div className="tabs-head">
            <span>Onglets</span>
            <span className="tabs-count">{unpinned.length}</span>
            {view.memoryFreed > 0 && (
              <span className="tabs-savings" title="Mémoire rendue par les onglets en veille depuis le lancement">
                {view.memoryFreed} Mo
              </span>
            )}
            <span className="tabs-tools">
              <button
                type="button"
                className="icon-btn subtle"
                title="Nouveau dossier"
                onClick={() => void createFolder()}
              >
                <Icon name="folder" size={14} />
              </button>
              <button type="button" className="icon-btn subtle" title="Nouvel onglet" onClick={() => newTab()}>
                <Icon name="plus" size={14} />
              </button>
            </span>
          </div>

          {groups.map((group) => {
            const groupTabs = unpinned.filter((tab) => tab.groupId === group.id)
            const live =
              groupTabs.some((tab) => tab.id === view.activeTabId) ||
              (view.split && groupTabs.some((tab) => tab.id === view.secondTabId))
            return (
              <div className="tab-group" key={group.id}>
                <div
                  className="group-head"
                  data-collapsed={group.collapsed}
                  data-live={live}
                  data-drop={drop?.kind === 'group' && drop.id === group.id}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest('button, input')) return
                    void updateGroup(group.id, { collapsed: !group.collapsed })
                  }}
                  onDragOver={(event) => overGroup(event, group)}
                  onDragLeave={(event) => {
                    if (event.currentTarget.contains(event.relatedTarget as Node)) return
                    setDrop((current) => (current?.kind === 'group' && current.id === group.id ? null : current))
                  }}
                  onDrop={(event) => dropOnGroup(event, group)}
                >
                  <button
                    type="button"
                    className="group-chevron"
                    title={group.collapsed ? 'Déplier le dossier' : 'Replier le dossier'}
                    onClick={() => void updateGroup(group.id, { collapsed: !group.collapsed })}
                  >
                    <Icon name="chevron-down" size={12} />
                  </button>
                  <span className="group-dot" style={{ background: group.color }} />
                  {renamingId === group.id ? (
                    <input
                      className="group-name-input"
                      value={renameValue}
                      maxLength={40}
                      autoFocus
                      onChange={(event) => setRenameValue(event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      onFocus={(event) => event.target.select()}
                      onBlur={commitRename}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          commitRename()
                        } else if (event.key === 'Escape') {
                          event.preventDefault()
                          cancelRename.current = true
                          setRenamingId(null)
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="group-name"
                      onClick={(event) => {
                        event.stopPropagation()
                        void updateGroup(group.id, { collapsed: !group.collapsed })
                      }}
                      onDoubleClick={() => startRename(group)}
                      title="Cliquer pour replier · double-clic pour renommer"
                    >
                      {group.name}
                    </button>
                  )}
                  <span className="group-count">{groupTabs.length}</span>
                  {group.collapsed && live && <span className="group-live" title="Contient l’onglet actif" />}
                  <span className="group-actions">
                    <button
                      type="button"
                      className="tab-action"
                      title="Nouvel onglet dans ce dossier"
                      onClick={(event) => {
                        event.stopPropagation()
                        newTab(undefined, group.id)
                      }}
                    >
                      <Icon name="plus" size={12} />
                    </button>
                    <button
                      type="button"
                      className="tab-action"
                      title="Renommer"
                      onClick={(event) => {
                        event.stopPropagation()
                        startRename(group)
                      }}
                    >
                      <Icon name="edit" size={12} />
                    </button>
                    <button
                      type="button"
                      className="tab-action"
                      data-confirming={confirmGroup === group.id}
                      title={
                        confirmGroup === group.id ? 'Cliquer à nouveau pour supprimer' : 'Supprimer le dossier'
                      }
                      onClick={(event) => {
                        event.stopPropagation()
                        requestDelete(group)
                      }}
                    >
                      <Icon name={confirmGroup === group.id ? 'warning' : 'trash'} size={12} />
                    </button>
                  </span>
                </div>

                {!group.collapsed && (
                  <div className="group-tabs">
                    {groupTabs.map(renderTab)}
                    {groupTabs.length === 0 && <p className="group-empty">Glissez un onglet ici.</p>}
                  </div>
                )}
              </div>
            )
          })}

          <div
            className="tabs-group tabs-loose"
            data-drop={drop?.kind === 'loose' && draggingTab?.pinned === true}
            onDragOver={overLoose}
            onDrop={dropOnLoose}
          >
            {loose.map(renderTab)}
            {loose.length === 0 && groups.length === 0 && <p className="tabs-empty">Aucun onglet ouvert.</p>}
          </div>

          {draggingId && groups.length > 0 && draggingTab && !draggingTab.pinned && (
            <div
              className="drop-tail"
              data-active={drop?.kind === 'loose'}
              onDragOver={overLoose}
              onDrop={dropOnLoose}
            >
              Déposer ici pour sortir du dossier
            </div>
          )}
        </div>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>

      {tip &&
        createPortal(
          <div className="side-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>
            <span className="side-tip-title">{tip.title}</span>
            {tip.host && <span className="side-tip-host">{tip.host}</span>}
          </div>,
          document.body
        )}

      {menu && (
        <TileMenu
          x={menu.x}
          y={menu.y}
          label={menu.kind === 'tab' ? menu.tab.title : menu.bookmark.title}
          items={menuItems(menu)}
          onClose={() => closeMenu(menu.kind === 'tab' ? menu.tab.id : menu.bookmark.id)}
        />
      )}
    </aside>
  )
}
