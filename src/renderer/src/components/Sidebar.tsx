import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, DragEvent, KeyboardEvent } from 'react'
import type { TabGroup, TabView } from '@shared/types'
import { useBrowser } from '../store/browser'
import Favicon from './Favicon'
import { Icon } from './Icon'
import TabRow from './TabRow'
import TunnelSidebar from './TunnelSidebar'
import SpaceAvatar from './SpaceAvatar'

type DropTarget =
  | { kind: 'tab'; id: string; edge: 'before' | 'after' }
  | { kind: 'group'; id: string }
  | { kind: 'loose' }
  | null

/**
 * Favicon demandé au site lui-même quand l'onglet n'en a pas mémorisé :
 * aucune requête tierce, et la case n'affiche pas une initiale par défaut.
 */
function iconFrom(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return `https://${parsed.hostname}/favicon.ico`
  } catch {
    return null
  }
}

export default function Sidebar() {
  const view = useBrowser((state) => state.view)
  const setOverlay = useBrowser((state) => state.setOverlay)
  const selectTab = useBrowser((state) => state.selectTab)
  const openSpaceDialog = useBrowser((state) => state.openSpaceDialog)
  const workMode = useBrowser((state) => state.workMode)
  const newTab = useBrowser((state) => state.newTab)
  const reorderTab = useBrowser((state) => state.reorderTab)
  const moveTabToGroup = useBrowser((state) => state.moveTabToGroup)
  const createGroup = useBrowser((state) => state.createGroup)
  const updateGroup = useBrowser((state) => state.updateGroup)
  const removeGroup = useBrowser((state) => state.removeGroup)

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const draggingRef = useRef<string | null>(null)
  const [drop, setDrop] = useState<DropTarget>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmGroup, setConfirmGroup] = useState<string | null>(null)
  // Infobulle des cases compactes : positionnée en `fixed` pour ne pas être
  // rognée par la liste qui défile.
  const [tip, setTip] = useState<{ label: string; x: number; y: number } | null>(null)
  const cancelRename = useRef(false)
  // Après un déplacement au clavier, la case déplacée reprend le focus une fois
  // la nouvelle ordonnance arrivée : sans cela, Tab repartirait du début.
  const focusAfterMove = useRef<string | null>(null)

  useEffect(() => {
    const id = focusAfterMove.current
    if (!id) return
    focusAfterMove.current = null
    document.querySelector<HTMLElement>(`.mini-tile[data-tab-id="${CSS.escape(id)}"]`)?.focus()
  }, [view])

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

  const sourceTab = (): TabView | undefined =>
    draggingRef.current ? spaceTabs.find((tab) => tab.id === draggingRef.current) : undefined

  const showTip = (event: { currentTarget: HTMLElement }, label: string): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    setTip({ label, x: rect.right + 8, y: rect.top + rect.height / 2 })
  }

  const hideTip = (): void => setTip((current) => (current ? null : current))

  const beginDrag = (event: DragEvent<HTMLElement>, tab: TabView): void => {
    draggingRef.current = tab.id
    setDraggingId(tab.id)
    setDrop(null)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', tab.id)
  }

  const endDrag = (): void => {
    draggingRef.current = null
    setDraggingId(null)
    setDrop(null)
  }

  const canDropOnTab = (target: TabView): boolean => {
    const source = sourceTab()
    return Boolean(source && source.id !== target.id && source.pinned === target.pinned)
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
    const source = draggingRef.current
    if (!source) return
    const rect = event.currentTarget.getBoundingClientRect()
    reorderTab(source, tab.id, event.clientY < rect.top + rect.height / 2 ? 'before' : 'after')
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
    moveTabToGroup(source.id, group.id)
    endDrag()
  }

  const overLoose = (event: DragEvent<HTMLDivElement>): void => {
    const source = sourceTab()
    if (!source || source.pinned) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    setDrop({ kind: 'loose' })
  }

  const dropOnLoose = (event: DragEvent<HTMLDivElement>): void => {
    const source = sourceTab()
    if (!source || source.pinned) return
    event.preventDefault()
    event.stopPropagation()
    moveTabToGroup(source.id, null)
    endDrag()
  }

  const canDropOnTile = (tab: TabView): boolean => {
    const source = sourceTab()
    return Boolean(source && source.id !== tab.id && source.pinned === tab.pinned)
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
    const source = draggingRef.current
    if (!source) return
    const rect = event.currentTarget.getBoundingClientRect()
    reorderTab(source, tab.id, event.clientX < rect.left + rect.width / 2 ? 'before' : 'after')
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
    focusAfterMove.current = tab.id
    reorderTab(tab.id, target.id, step < 0 ? 'before' : 'after')
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
                  aria-label={tab.title}
                  onMouseEnter={(event) => showTip(event, tab.title)}
                  onMouseLeave={hideTip}
                  onFocus={(event) => showTip(event, tab.title)}
                  onBlur={hideTip}
                  onDragStart={(event) => {
                    hideTip()
                    beginDrag(event, tab)
                  }}
                  onDragEnd={endDrag}
                  onDragOver={(event) => overTile(event, tab)}
                  onDrop={(event) => dropOnTile(event, tab)}
                  onKeyDown={(event) => moveTile(event, tab, pinned)}
                  onClick={() => selectTab(tab.id)}
                >
                  <Favicon src={tab.favicon ?? iconFrom(tab.url)} label={tab.title} size={18} />
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
            <div className="mini-grid" role="list" aria-label="Favoris">
              {view.bookmarks.slice(0, 12).map((bookmark) => (
                <button
                  key={bookmark.id}
                  type="button"
                  role="listitem"
                  className="mini-tile"
                  data-bookmark-id={bookmark.id}
                  aria-label={bookmark.title}
                  onMouseEnter={(event) => showTip(event, bookmark.title)}
                  onMouseLeave={hideTip}
                  onFocus={(event) => showTip(event, bookmark.title)}
                  onBlur={hideTip}
                  onClick={() => newTab(bookmark.url)}
                >
                  <Favicon src={bookmark.favicon ?? iconFrom(bookmark.url)} label={bookmark.title} size={18} />
                </button>
              ))}
            </div>
          </>
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

        <div className="tabs-group tabs-loose">
          {loose.map(renderTab)}
          {loose.length === 0 && groups.length === 0 && <p className="tabs-empty">Aucun onglet ouvert.</p>}
        </div>

        {draggingId && groups.length > 0 && sourceTab()?.pinned === false && (
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

      {tip &&
        createPortal(
          <div className="side-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>
            {tip.label}
          </div>,
          document.body
        )}
    </aside>
  )
}
