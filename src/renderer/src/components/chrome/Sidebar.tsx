import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, DragEvent, KeyboardEvent } from 'react'
import { pinnedNeighbour } from '@shared/pinnedTabMenu'
import type { Bookmark, TabGroup, TabView } from '@shared/types'
import { GROUP_COLORS, GROUP_ICONS } from '@shared/groupColors'
import { displayTitle, hostOf, isHomeUrl } from '@shared/url'
import { shortcut } from '../../lib/format'
import { saveSession, useSessionCount } from '../../lib/sessions'
import { useBrowser } from '../../store/browser'
import Favicon from '../Favicon'
import SidebarFoot from './SidebarFoot'
import SidebarHeader from './SidebarHeader'
import { Icon, type IconName } from '../Icon'
import TabContextMenu from '../tabs/TabContextMenu'
import TabRow from '../tabs/TabRow'
import PinnedTabTile from '../tabs/PinnedTabTile'
import { bindTabGestures } from '../tabs/tabGestures'
import TileMenu, { type TileMenuItem } from '../tabs/TileMenu'
import TunnelSidebar from '../tunnel/TunnelSidebar'
import SpaceAvatar from '../space/SpaceAvatar'

type DropTarget =
  | { kind: 'tab'; id: string; edge: 'before' | 'after' }
  | { kind: 'group'; id: string }
  | { kind: 'loose' }
  | { kind: 'pinned-end' }
  | null

/** Menu d'un favori ; celui d'un onglet vit dans `TabContextMenu`. */
type MenuState = { kind: 'bookmark'; bookmark: Bookmark; x: number; y: number }

/** Au-delà, une tuile « +N » ouvre la liste complète plutôt que de tronquer. */
const FAVORITE_LIMIT = 12

/**
 * ⌘Z reste actif tant que le dernier dossier supprimé est en mémoire. Le
 * raccourci vit dans son propre composant : son effet n'est ainsi jamais
 * appelé après le retour anticipé de la barre sans vue.
 */
function UndoGroupShortcut({
  hasDeleted,
  undo
}: {
  hasDeleted: () => boolean
  undo: () => Promise<void>
}) {
  const latest = useRef({ undo, hasDeleted })

  useEffect(() => {
    latest.current = { undo, hasDeleted }
  }, [undo, hasDeleted])

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (!latest.current.hasDeleted()) return
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey) return
      if (event.key.toLowerCase() !== 'z') return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"]')) return
      event.preventDefault()
      void latest.current.undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return null
}


export default function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
  const view = useBrowser((state) => state.view)
  const overlay = useBrowser((state) => state.overlay)
  const setOverlay = useBrowser((state) => state.setOverlay)
  const sessionCount = useSessionCount()
  const openSpaceDialog = useBrowser((state) => state.openSpaceDialog)
  const workMode = useBrowser((state) => state.workMode)
  const newTab = useBrowser((state) => state.newTab)
  const reopen = useBrowser((state) => state.reopen)
  const removeBookmark = useBrowser((state) => state.removeBookmark)
  const moveBookmark = useBrowser((state) => state.moveBookmark)
  const toast = useBrowser((state) => state.toast)
  const reorderTab = useBrowser((state) => state.reorderTab)
  const moveTabToGroup = useBrowser((state) => state.moveTabToGroup)
  const createGroup = useBrowser((state) => state.createGroup)
  const updateGroup = useBrowser((state) => state.updateGroup)
  const removeGroup = useBrowser((state) => state.removeGroup)
  const sleepTab = useBrowser((state) => state.sleep)
  const closeTab = useBrowser((state) => state.closeTab)

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const draggingRef = useRef<string | null>(null)
  const dragCancelled = useRef(false)
  const [drop, setDrop] = useState<DropTarget>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [colorGroup, setColorGroup] = useState<string | null>(null)
  // Menu d'un dossier : clic droit sur l'en-tête ou bouton « … ».
  const [groupMenu, setGroupMenu] = useState<{ group: TabGroup; x: number; y: number } | null>(
    null
  )
  // Dernier dossier supprimé : ⌘Z et le bouton du toast le remettent en place.
  // État et non référence : le menu d'un dossier construit ses entrées pendant
  // le rendu, et une fonction qui lit une référence y était refusée par la
  // règle `react-hooks/refs`.
  const [lastDeletedGroup, setLastDeletedGroup] = useState<{
    name: string
    color: string
    icon?: string
    tabIds: string[]
  } | null>(null)
  // Infobulle des cases compactes : positionnée en `fixed` pour ne pas être
  // rognée par la liste qui défile.
  const [tip, setTip] = useState<{
    title: string
    host: string
    note?: string
    x: number
    y: number
  } | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  // Filtre des onglets, saisi dans le pied de la colonne.
  const [query, setQuery] = useState('')
  // Onglet visé par un clic droit (ligne ou case épinglée), et fond de liste.
  const [tabMenu, setTabMenu] = useState<{
    tab: TabView
    x: number
    y: number
    keyboard: boolean
    rect?: { left: number; top: number; right: number; bottom: number }
  } | null>(null)
  const [emptyMenu, setEmptyMenu] = useState<{ x: number; y: number } | null>(null)
  // Message lu par le lecteur d'écran après un déplacement.
  const [announce, setAnnounce] = useState('')
  const cancelRename = useRef(false)
  // Après un déplacement, la case déplacée reprend le focus une fois la
  // nouvelle ordonnance arrivée : sans cela, Tab repartirait du début.
  const focusAfterMove = useRef<string | null>(null)
  // Le drapeau d'annulation appartient au début du renommage : une seule
  // écriture, dans un effet, plutôt que dans chaque fonction qui l'ouvre.
  useEffect(() => {
    if (renamingId) cancelRename.current = false
  }, [renamingId])
  // Annonce différée : il faut la nouvelle ordonnance pour compter les places.
  const pendingMove = useRef<{ kind: 'tab' | 'bookmark'; id: string; from: boolean } | null>(null)
  // Glisser d'un favori : distinct des onglets, avec son propre indicateur.
  const [favDragId, setFavDragId] = useState<string | null>(null)
  const favDragRef = useRef<string | null>(null)
  const [favDrop, setFavDrop] = useState<{ id: string; edge: 'before' | 'after' } | null>(null)
  const [favMode, setFavMode] = useState<'grid' | 'list'>('grid')
  const [favExpanded, setFavExpanded] = useState(false)

  // Une feuille ouverte (réglages, protection, palette) passe devant : une
  // infobulle ou un menu resté ouvert flotterait par-dessus. Le repli garde la
  // barre montée : ses surcouches doivent disparaître avec elle.
  useEffect(() => {
    if (!overlay && !collapsed) return
    // Hors du corps de l'effet : la microtâche s'exécute avant la peinture.
    queueMicrotask(() => {
      setTip(null)
      setMenu(null)
      setTabMenu(null)
      setEmptyMenu(null)
      setGroupMenu(null)
      setColorGroup(null)
    })
  }, [overlay, collapsed])

  useEffect(() => {
    const id = focusAfterMove.current
    if (!id) return
    focusAfterMove.current = null
    const selector = [
      `.pin-tile-main[data-tab-id="${CSS.escape(id)}"]`,
      `.mini-tile[data-tab-id="${CSS.escape(id)}"]`,
      `.tab-row[data-tab-id="${CSS.escape(id)}"]`,
      `.mini-tile[data-bookmark-id="${CSS.escape(id)}"]`
    ].join(', ')
    // Un favori déplacé au-delà des cases visibles laisse le focus sur « +N ».
    const node =
      document.querySelector<HTMLElement>(selector) ??
      document.querySelector<HTMLElement>('.mini-tile-more')
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
    const list = view.tabs.filter(
      (item) => item.spaceId === tab.spaceId && item.pinned === tab.pinned
    )
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
          `.pin-tile-main[data-tab-id="${CSS.escape(focusId)}"], .mini-tile[data-tab-id="${CSS.escape(focusId)}"], [data-bookmark-id="${CSS.escape(focusId)}"]`
        )
        ?.focus()
    })
  }, [])

  const pin = useBrowser((state) => state.pin)
  // Zone des épinglés repliée : le choix survit au redémarrage.
  const [pinsCollapsed, setPinsCollapsed] = useState(() => {
    try {
      return localStorage.getItem('vela.sidebar.pins.collapsed') === '1'
    } catch {
      return false
    }
  })

  // Gestes du rendu courant, publiés sous une identité stable : sans cela
  // chaque ligne recevait des fonctions neuves et `memo(TabRow)` ne retenait
  // jamais rien — huit rendus de ligne par diffusion d'état.
  //
  // L'ordre est volontaire : les gestes se définissent plus bas, avec la vue
  // (espace courant, onglets épinglés) ; ce pont doit rester avant le retour
  // anticipé pour être appelé à chaque rendu. Le corps ne s'exécute que si la
  // vue existe, donc après l'initialisation de tout ce qu'il lit.
  /* eslint-disable react-hooks/immutability */
  useEffect(() => {
    // Les gestes n'existent qu'avec une vue : le retour anticipé ci-dessous
    // laisse leurs définitions non initialisées.
    if (!view) return
    bindTabGestures({
      startDrag: (event, tab) => {
        hideTip()
        beginDrag(event, tab)
      },
      endDrag,
      overTab,
      dropOnTab,
      overTile,
      dropOnTile,
      openMenu: (event, tab) => {
        event.preventDefault()
        event.stopPropagation()
        const rect = event.currentTarget.getBoundingClientRect()
        openTabMenu(tab, event.clientX, event.clientY, false, rect)
      },
      keyTile: (event, tab) => {
        moveTile(event, tab, pinned)
        if (event.defaultPrevented) return
        if (!menuKey(event)) return
        const rect = event.currentTarget.getBoundingClientRect()
        openTabMenu(tab, rect.left, rect.bottom, true, rect)
      }
    })
  })
  /* eslint-enable react-hooks/immutability */

  if (!view) {
    return (
      <aside
        className="sidebar"
        data-collapsed={collapsed ? 'true' : undefined}
        aria-hidden={collapsed || undefined}
      />
    )
  }

  const togglePins = (): void => {
    setPinsCollapsed((previous) => {
      const next = !previous
      try {
        localStorage.setItem('vela.sidebar.pins.collapsed', next ? '1' : '0')
      } catch {
        /* stockage indisponible : le choix vaut pour la session */
      }
      return next
    })
  }
  const space = view.spaces.find((item) => item.id === view.activeSpaceId) ?? view.spaces[0]
  const spaceTabs = view.tabs.filter((tab) => tab.spaceId === space.id)
  const pinned = spaceTabs.filter((tab) => tab.pinned)
  // L'accueil n'est pas un onglet comme les autres : il vit dans sa propre
  // zone, en haut, et ne compte donc pas dans le compteur « Onglets ».
  const homeTabs = spaceTabs.filter((tab) => !tab.pinned && isHomeUrl(tab.url))
  const unpinned = spaceTabs.filter((tab) => !tab.pinned && !isHomeUrl(tab.url))
  const groups = view.groups
    .filter((group) => group.spaceId === space.id)
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
  const groupIds = new Set(groups.map((group) => group.id))
  // Les onglets en veille ferment la liste : ils ne se mêlent plus aux pages
  // vivantes. Le tri est stable, l'ordre voulu est conservé à l'intérieur.
  const loose = unpinned
    .filter((tab) => !tab.groupId || !groupIds.has(tab.groupId))
    .sort((a, b) => Number(a.asleep) - Number(b.asleep))
  const pinnedCount = pinned.length
  // Le compteur de la section sert de bouton : il épingle la page ouverte.
  const pinnable = spaceTabs.find(
    (tab) => tab.id === view.activeTabId && !tab.pinned && !isHomeUrl(tab.url)
  )
  // Les cases vides complètent la rangée de quatre, jamais la dernière.
  const pinSlots = Math.max(0, Math.ceil(Math.max(pinnedCount, 1) / 4) * 4 - pinnedCount)
  // Tous les onglets ouverts de l'espace, épinglés et dossiers compris.
  const openTabCount = pinnedCount + unpinned.length
  const visibleBookmarks =
    favExpanded || favMode === 'list'
      ? view.bookmarks
      : view.bookmarks.length > FAVORITE_LIMIT
        ? view.bookmarks.slice(0, FAVORITE_LIMIT - 1)
        : view.bookmarks
  const hiddenBookmarks = view.bookmarks.length - visibleBookmarks.length

  const sourceTab = (): TabView | undefined =>
    draggingId ? spaceTabs.find((tab) => tab.id === draggingId) : undefined

  const showTip = (
    event: { currentTarget: HTMLElement },
    item: { title: string; url: string } & Partial<Pick<TabView, 'audible' | 'muted'>>
  ): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    // Infobulle bornée à la fenêtre : dans une fenêtre étroite, elle restait
    // collée au bord et son titre sortait de l’écran.
    const width = Math.min(262, window.innerWidth - 24)
    const x = Math.min(rect.right + 8, window.innerWidth - width - 8)
    const y = Math.min(Math.max(rect.top + rect.height / 2, 44), window.innerHeight - 44)
    // Le compteur du site (« (12) Gmail ») part dans la pastille de la case :
    // l’infobulle affiche le nom seul, jamais « (1109) YouTube ».
    setTip({
      title: displayTitle(item.title),
      host: hostOf(item.url),
      note: item.muted ? 'Son coupé' : item.audible ? 'Page en lecture' : undefined,
      x,
      y
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

  const overTab = (event: DragEvent<HTMLElement>, tab: TabView): void => {
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

  const dropOnTab = (event: DragEvent<HTMLElement>, tab: TabView): void => {
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
    reorderTab(
      source.id,
      tab.id,
      event.clientY < rect.top + rect.height / 2 ? 'before' : 'after',
      tab.pinned
    )
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
    setFavDrop({
      id: bookmark.id,
      edge: event.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
    })
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
    reorderTab(
      source.id,
      tab.id,
      event.clientX < rect.left + rect.width / 2 ? 'before' : 'after',
      tab.pinned
    )
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

  /** Déplacement d'un épinglé depuis son menu : même chemin que Alt + flèches. */
  const movePinnedFromMenu = (tab: TabView, step: -1 | 1): void => {
    const targetId = pinnedNeighbour(
      pinned.map((item) => item.id),
      tab.id,
      step
    )
    if (!targetId) return
    reorderTab(tab.id, targetId, step < 0 ? 'before' : 'after', true)
    commitMove(tab.id, true)
  }

  const openTabMenu = (
    tab: TabView,
    x: number,
    y: number,
    keyboard: boolean,
    rect?: { left: number; top: number; right: number; bottom: number }
  ): void => {
    hideTip()
    setTabMenu({ tab, x, y, keyboard, rect })
  }

  const closeTabMenu = (id: string): void => {
    setTabMenu(null)
    const focusTile = (): void => {
      document
        .querySelector<HTMLElement>(
          `.mini-tile[data-tab-id="${CSS.escape(id)}"], .tab-row[data-tab-id="${CSS.escape(id)}"]`
        )
        ?.focus()
    }
    // Le portail se démonte au rendu suivant : on reprend le focus après lui,
    // sinon il retombe sur le document et le clavier repart du début.
    requestAnimationFrame(() => requestAnimationFrame(focusTile))
  }

  const createFolder = async (): Promise<void> => {
    const active = spaceTabs.find((tab) => tab.id === view.activeTabId)
    const tabId = active && !active.pinned && !active.groupId ? active.id : undefined
    const group = await createGroup(tabId)
    if (group) {
      setRenamingId(group.id)
      setRenameValue(group.name)
    }
  }

  /** Clic droit sur le fond de la liste : actions qui ne visent aucun onglet. */
  const emptyTabItems = (): TileMenuItem[] => [
    {
      id: 'new',
      label: 'Nouvel onglet',
      icon: 'plus',
      keys: shortcut('T'),
      onSelect: () => newTab()
    },
    {
      id: 'new-folder',
      label: 'Nouveau dossier',
      icon: 'folder',
      onSelect: () => void createFolder()
    },
    ...(view.canReopen
      ? [
          {
            id: 'reopen',
            label: 'Rouvrir l’onglet fermé',
            icon: 'history' as const,
            keys: shortcut('⇧T'),
            onSelect: () => reopen()
          }
        ]
      : [])
  ]

  const openBookmarkMenu = (bookmark: Bookmark, x: number, y: number): void => {
    hideTip()
    setMenu({ kind: 'bookmark', bookmark, x, y })
  }

  const menuItems = (state: MenuState): TileMenuItem[] => {
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
    setRenamingId(group.id)
    setRenameValue(group.name)
    setColorGroup(null)
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

  /** Onglets d'un dossier, dans l'ordre de la liste. */
  const groupTabsOf = (group: TabGroup): TabView[] =>
    unpinned.filter((tab) => tab.groupId === group.id)

  const undoGroupDelete = async (): Promise<void> => {
    const saved = lastDeletedGroup
    if (!saved) return
    setLastDeletedGroup(null)
    const group = await createGroup()
    if (!group) return
    await updateGroup(group.id, {
      name: saved.name,
      color: saved.color,
      icon: saved.icon
    } as unknown as Parameters<typeof updateGroup>[1])
    for (const id of saved.tabIds) moveTabToGroup(id, group.id)
  }

  /**
   * Suppression directe, sans demande de confirmation : le toast porte
   * l’annulation. Les onglets du dossier ne sont jamais fermés, ils
   * réintègrent simplement la liste.
   */
  const deleteGroup = (group: TabGroup): void => {
    const saved = {
      name: group.name,
      color: group.color,
      icon: group.icon,
      tabIds: groupTabsOf(group).map((tab) => tab.id)
    }
    setLastDeletedGroup(saved)
    void removeGroup(group.id)
    toast(`Dossier « ${group.name} » supprimé`, 'info', {
      label: 'Annuler',
      run: () => void undoGroupDelete()
    }, 8000)
    window.setTimeout(() => {
      setLastDeletedGroup((current) => (current === saved ? null : current))
    }, 8000)
  }

  const sleepGroup = (group: TabGroup): void => {
    const tabs = groupTabsOf(group).filter((tab) => !tab.asleep)
    if (tabs.length === 0) {
      toast('Ce dossier est déjà en veille')
      return
    }
    for (const tab of tabs) sleepTab(tab.id)
    toast(`${tabs.length} onglet${tabs.length > 1 ? 's' : ''} en veille`)
  }

  const closeGroup = (group: TabGroup): void => {
    const tabs = groupTabsOf(group)
    if (tabs.length === 0) return
    for (const tab of tabs) closeTab(tab.id)
    toast(`${tabs.length} onglet${tabs.length > 1 ? 's' : ''} fermé${tabs.length > 1 ? 's' : ''}`)
  }

  /** Le dossier part dans Sessions tel quel, pour le rouvrir plus tard. */
  const keepGroup = (group: TabGroup): void => {
    const tabs = groupTabsOf(group).filter((tab) => /^https?:/i.test(tab.url))
    if (tabs.length === 0) {
      toast('Aucune page à garder dans ce dossier', 'error')
      return
    }
    saveSession({
      name: group.name,
      spaceId: space.id,
      spaceName: space.name,
      tabs: tabs.map((tab) => ({ url: tab.url, title: tab.title }))
    })
    toast(`« ${group.name} » gardé dans Sessions`, 'info', {
      label: 'Ouvrir',
      run: () => setOverlay('sessions')
    })
  }

  const groupMenuItems = (group: TabGroup): TileMenuItem[] => [
    {
      id: 'open',
      label: 'Nouvel onglet dans ce dossier',
      icon: 'plus',
      onSelect: () => newTab(undefined, group.id)
    },
    { id: 'rename', label: 'Renommer', icon: 'edit', onSelect: () => startRename(group) },
    {
      id: 'color',
      label: 'Changer la couleur',
      icon: 'palette',
      onSelect: () => setColorGroup(group.id)
    },
    {
      id: 'sleep',
      label: 'Mettre tout en veille',
      icon: 'moon',
      hint: 'Décharge les pages du dossier sans fermer les onglets.',
      onSelect: () => sleepGroup(group)
    },
    { id: 'close', label: 'Fermer le groupe', icon: 'close', onSelect: () => closeGroup(group) },
    {
      id: 'keep',
      label: 'Garder dans Sessions',
      icon: 'clock',
      onSelect: () => keepGroup(group)
    },
    { id: 'sep', label: '', separator: true },
    {
      id: 'delete',
      label: 'Supprimer le dossier',
      icon: 'trash',
      danger: true,
      hint: 'Les onglets restent ouverts.',
      onSelect: () => deleteGroup(group)
    }
  ]

  // Une recherche vide laisse tout passer ; sinon le titre et l'adresse
  // suffisent à retrouver un onglet, sans toucher à l'ordre ni aux dossiers.
  const matches = (tab: TabView): boolean => {
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    return `${tab.title} ${tab.url}`.toLowerCase().includes(needle)
  }

  const renderTab = (tab: TabView) =>
    !matches(tab) ? null : (
    <TabRow
      key={tab.id}
      tab={tab}
      active={tab.id === view.activeTabId}
      secondary={view.split && tab.id === view.secondTabId}
      dragging={draggingId === tab.id}
      dropEdge={drop?.kind === 'tab' && drop.id === tab.id ? drop.edge : null}
    />
  )

  const draggingTab = sourceTab()

  return (
    <aside
      className="sidebar"
      aria-label="Barre latérale"
      data-collapsed={collapsed ? 'true' : undefined}
      aria-hidden={collapsed || undefined}
      // `--space-color` est éclairci en mode sombre par App.tsx : la teinte
      // d'un espace ne doit pas disparaître sur le noir.
      style={{ '--space': 'var(--space-color)' } as CSSProperties}
    >
      <UndoGroupShortcut
        hasDeleted={() => lastDeletedGroup !== null}
        undo={undoGroupDelete}
      />
      <SidebarHeader />

      {/* Le chevron annonce que ce nom est un contrôle ; le crayon séparé
          faisait trois cibles pour une seule action. Le rail de gauche change
          d'espace, ce bouton ouvre la fiche de l'espace courant. */}
      <div className="space-head">
        <SpaceAvatar space={space} size={18} />
        <button
          type="button"
          className="space-name"
          onClick={() => openSpaceDialog(space.id)}
          title={`Profil « ${space.name} » — modifier`}
          aria-haspopup="dialog"
        >
          <span className="space-name-text">{space.name}</span>
          <Icon name="chevron-down" size={13} />
        </button>
      </div>

      <button type="button" className="sessions-card" onClick={() => setOverlay('sessions')}>
        <span className="sessions-kicker">
          <Icon name="clock" size={13} />
          Sessions
          {sessionCount > 0 && (
            <span className="sessions-count">
              {sessionCount}
              <span className="sr-only"> gardée{sessionCount > 1 ? 's' : ''}</span>
            </span>
          )}
        </span>
        <span className="sessions-arrow">
          <Icon name="arrow-right" size={14} />
        </span>
      </button>

      {workMode === 'work' ? (
        <TunnelSidebar spaceId={space.id} />
      ) : (
        <div
          className="tabs-scroll"
          onScroll={hideTip}
          onContextMenu={(event) => {
            // Les lignes et les cases ont leur propre menu : ici, c'est le fond.
            const target = event.target as HTMLElement
            if (
              target.closest(
                '.tab-row, .mini-tile, .pin-tile, .fav-list-row, .group-head, button, input'
              )
            )
              return
            event.preventDefault()
            hideTip()
            setEmptyMenu({ x: event.clientX, y: event.clientY })
          }}
        >
          {homeTabs.length > 0 && (
            <div className="home-zone" role="group" aria-label="Accueil">
              {homeTabs.map(renderTab)}
            </div>
          )}

          {pinnedCount > 0 && (
            <>
              <div className="tabs-head">
                <button
                  type="button"
                  className="tabs-fold"
                  aria-expanded={!pinsCollapsed}
                  title={pinsCollapsed ? 'Déplier les épinglés' : 'Replier les épinglés'}
                  onClick={togglePins}
                >
                  <Icon name={pinsCollapsed ? 'chevron-right' : 'chevron-down'} size={11} />
                </button>
                <span>Épinglés</span>
                <button
                  type="button"
                  className="tabs-count tabs-pin-add"
                  disabled={!pinnable}
                  onClick={() => pinnable && pin(pinnable.id, true)}
                  title={
                    pinnable
                      ? 'Épingler la page ouverte'
                      : `${pinnedCount} site${pinnedCount > 1 ? 's' : ''} épinglé${
                          pinnedCount > 1 ? 's' : ''
                        }`
                  }
                  aria-label={
                    pinnable
                      ? 'Épingler la page ouverte'
                      : `${pinnedCount} site${pinnedCount > 1 ? 's' : ''} épinglé${
                          pinnedCount > 1 ? 's' : ''
                        }`
                  }
                >
                  <Icon name="pin" size={11} />
                  {pinnedCount}
                </button>
              </div>
              <div
                className="pin-tiles"
                data-collapsed={pinsCollapsed ? 'true' : undefined}
                role="group"
                aria-label={`Sites épinglés de ${space.name} — Alt + flèches pour réordonner`}
                data-drop={drop?.kind === 'pinned-end'}
                onDragOver={overPinnedEnd}
                onDrop={dropOnPinnedEnd}
              >
                {pinned.map((tab) => (
                  <PinnedTabTile
                    key={tab.id}
                    tab={tab}
                    active={tab.id === view.activeTabId}
                    secondary={Boolean(view.split && tab.id === view.secondTabId)}
                    dragging={draggingId === tab.id}
                    drop={drop?.kind === 'tab' && drop.id === tab.id ? drop.edge : null}
                  />
                ))}
                {/* Un emplacement vide reste un emplacement : au survol, un
                    « + » discret montre à quoi il sert. */}
                {Array.from({ length: pinSlots }).map((_, index) => (
                  <button
                    key={`pin-slot-${index}`}
                    type="button"
                    className="pin-slot"
                    disabled={!pinnable}
                    onClick={() => pinnable && pin(pinnable.id, true)}
                    title={pinnable ? 'Épingler la page ouverte' : 'Emplacement épinglé libre'}
                    aria-label={pinnable ? 'Épingler la page ouverte' : 'Emplacement épinglé libre'}
                  >
                    <Icon name="plus" size={13} />
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
                    title={favMode === 'grid' ? 'Afficher en liste fluide' : 'Afficher en grille'}
                    aria-label={
                      favMode === 'grid' ? 'Afficher en liste fluide' : 'Afficher en grille'
                    }
                    onClick={() => setFavMode((m) => (m === 'grid' ? 'list' : 'grid'))}
                  >
                    <Icon name={favMode === 'grid' ? 'list' : 'panel'} size={12} />
                  </button>
                  {view.bookmarks.length > FAVORITE_LIMIT && favMode === 'grid' && (
                    <button
                      type="button"
                      className="icon-btn subtle"
                      title={favExpanded ? 'Replier la grille' : 'Déplier tous les favoris'}
                      aria-label={favExpanded ? 'Replier' : 'Déplier'}
                      onClick={() => setFavExpanded((e) => !e)}
                    >
                      <Icon name={favExpanded ? 'chevron-down' : 'chevron-right'} size={12} />
                    </button>
                  )}
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
              {favMode === 'list' ? (
                <div className="fav-list" role="group" aria-label="Liste des favoris">
                  {visibleBookmarks.map((bookmark) => (
                    <div
                      key={bookmark.id}
                      className="fav-list-row"
                      role="button"
                      tabIndex={0}
                      onClick={() => newTab(bookmark.url)}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        openBookmarkMenu(bookmark, event.clientX, event.clientY)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          newTab(bookmark.url)
                        }
                      }}
                    >
                      <Favicon
                        src={bookmark.favicon}
                        url={bookmark.url}
                        label={bookmark.title}
                        size={15}
                        spaceId={space.id}
                      />
                      <span className="fav-list-copy">
                        <span className="fav-list-title">{displayTitle(bookmark.title)}</span>
                        <span className="fav-list-host">{hostOf(bookmark.url)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className="mini-grid"
                  role="group"
                  aria-label="Favoris — Alt + flèches pour réordonner"
                  data-dragging={favDragId ? 'true' : undefined}
                >
                  {visibleBookmarks.map((bookmark) => (
                    <button
                      key={bookmark.id}
                      type="button"
                      className="mini-tile"
                      data-bookmark-id={bookmark.id}
                      data-dragging={favDragId === bookmark.id ? 'true' : undefined}
                      data-drop={favDrop && favDrop.id === bookmark.id ? favDrop.edge : undefined}
                      aria-label={`${displayTitle(bookmark.title)} — ${hostOf(bookmark.url)}`}
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
                      className="mini-tile mini-tile-more"
                      aria-label={`Déplier les ${hiddenBookmarks} autres favoris`}
                      title={`Déplier les ${hiddenBookmarks} autres favoris`}
                      onClick={() => setFavExpanded(true)}
                    >
                      <span aria-hidden="true">+{hiddenBookmarks}</span>
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {draggingTab && (
            <div
              className="drop-zone"
              role="status"
              data-active={drop?.kind === (draggingTab.pinned ? 'loose' : 'pinned-end')}
              onDragOver={draggingTab.pinned ? overLoose : overPinnedEnd}
              onDrop={draggingTab.pinned ? dropOnLoose : dropOnPinnedEnd}
            >
              {draggingTab.pinned ? 'Déposer ici pour désépingler' : 'Déposer ici pour épingler'}
            </div>
          )}

          <div className="tabs-head">
            <span>Onglets</span>
            <span className="tabs-count">{openTabCount}</span>
            <span className="tabs-tools">
              <button
                type="button"
                className="icon-btn subtle"
                title="Nouveau dossier"
                onClick={() => void createFolder()}
              >
                <Icon name="folder" size={14} />
              </button>
              <button
                type="button"
                className="icon-btn subtle"
                title="Nouvel onglet"
                onClick={() => newTab()}
              >
                <Icon name="plus" size={14} />
              </button>
            </span>
            {/* Le libellé complet ne tient pas sur la ligne du titre : il
                occupe sa propre ligne, sous les actions de la section. */}
            {view.memoryFreed > 0 && (
              <span
                className="tabs-savings"
                title={`Mémoire rendue par les onglets en veille depuis le lancement : ${view.memoryFreed} Mo`}
              >
                {view.memoryFreed} Mo
                <span className="tabs-savings-unit">{' libérés'}</span>
              </span>
            )}
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
                  role="group"
                  aria-label={`Dossier ${group.name}`}
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
                    setDrop((current) =>
                      current?.kind === 'group' && current.id === group.id ? null : current
                    )
                  }}
                  onDrop={(event) => dropOnGroup(event, group)}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setGroupMenu({ group, x: event.clientX, y: event.clientY })
                  }}
                >
                  <button
                    type="button"
                    className="group-chevron"
                    title={group.collapsed ? 'Déplier le dossier' : 'Replier le dossier'}
                    onClick={() => void updateGroup(group.id, { collapsed: !group.collapsed })}
                  >
                    <Icon name="chevron-down" size={12} />
                  </button>
                  <button
                    type="button"
                    className="group-dot"
                    style={{ '--group-color': group.color } as CSSProperties}
                    title="Changer la couleur du dossier"
                    aria-label={`Changer la couleur de ${group.name}`}
                    aria-expanded={colorGroup === group.id}
                    onClick={(event) => {
                      event.stopPropagation()
                      setColorGroup((current) => (current === group.id ? null : group.id))
                    }}
                  >
                    {group.icon ? (
                      <Icon name={group.icon as IconName} size={12} className="group-dot-glyph" />
                    ) : null}
                  </button>
                  {colorGroup === group.id && (
                    <span className="group-colors" role="group" aria-label="Couleur du dossier">
                      {GROUP_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          style={{ background: color }}
                          data-active={color === group.color}
                          aria-label={`Couleur ${color}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            setColorGroup(null)
                            void updateGroup(group.id, { color })
                          }}
                        />
                      ))}
                      <span className="group-icons" role="group" aria-label="Icône du dossier">
                        {GROUP_ICONS.map((name) => (
                          <button
                            key={name}
                            type="button"
                            className="group-icon"
                            data-active={group.icon === name}
                            aria-label={`Icône ${name}`}
                            title={name}
                            onClick={(event) => {
                              event.stopPropagation()
                              setColorGroup(null)
                              void updateGroup(group.id, {
                                icon: name
                              } as unknown as Parameters<typeof updateGroup>[1])
                            }}
                          >
                            <Icon name={name} size={12} />
                          </button>
                        ))}
                      </span>
                    </span>
                  )}
                  {renamingId === group.id ? (
                    <input
                      className="group-name-input"
                      aria-label="Nom du dossier"
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
                  {groupTabs.length > 0 && (
                    <span className="group-count">{groupTabs.length}</span>
                  )}
                  {group.collapsed && groupTabs.length > 0 && (
                    <span className="group-peek" aria-hidden="true">
                      {groupTabs.slice(0, 3).map((tab) => (
                        <Favicon
                          key={tab.id}
                          src={tab.favicon}
                          url={tab.url}
                          label={tab.title}
                          size={12}
                          spaceId={space.id}
                        />
                      ))}
                      {groupTabs.length > 3 && (
                        <span className="group-peek-more">+{groupTabs.length - 3}</span>
                      )}
                    </span>
                  )}
                  {group.collapsed && live && (
                    <span className="group-live" title="Contient l’onglet actif" />
                  )}
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
                      title="Actions du dossier"
                      aria-haspopup="menu"
                      onClick={(event) => {
                        event.stopPropagation()
                        const rect = event.currentTarget.getBoundingClientRect()
                        setGroupMenu({ group, x: rect.left - 150, y: rect.bottom + 4 })
                      }}
                    >
                      <Icon name="more" size={12} />
                    </button>
                  </span>
                </div>

                {!group.collapsed && (
                  <div className="group-tabs" role="group" aria-label={`Onglets de ${group.name}`}>
                    {groupTabs.map(renderTab)}
                    <span
                      className="group-drop-line"
                      data-active={drop?.kind === 'group' && drop.id === group.id}
                      aria-hidden="true"
                    />
                    {groupTabs.length === 0 && (
                      <p className="group-empty">Glissez un onglet ici</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          <div
            className="tabs-group tabs-loose"
            role="group"
            aria-label="Onglets hors dossier"
            data-drop={drop?.kind === 'loose' && draggingTab?.pinned === true}
            onDragOver={overLoose}
            onDrop={dropOnLoose}
          >
            {loose.map(renderTab)}
            {loose.length === 0 && groups.length === 0 && homeTabs.length === 0 && (
              <p className="tabs-empty">Aucun onglet ouvert.</p>
            )}
            <button
              type="button"
              className="tab-new"
              onClick={() => newTab()}
              title={`Nouvel onglet (${shortcut('T')})`}
            >
              <span className="tab-new-icon">
                <Icon name="plus" size={13} />
              </span>
              <span className="tab-new-label">Nouvel onglet</span>
              <kbd className="tab-new-key">{shortcut('T')}</kbd>
            </button>
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

      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-label="Annonces de la barre latérale"
      >
        {announce}
      </p>

      {tip &&
        createPortal(
          <div className="side-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>
            <span className="side-tip-title">{tip.title}</span>
            {tip.host && <span className="side-tip-host">{tip.host}</span>}
            {tip.note && <span className="side-tip-note">{tip.note}</span>}
          </div>,
          document.body
        )}

      <SidebarFoot
        query={query}
        onQuery={setQuery}
        asleep={spaceTabs.filter((tab) => tab.asleep).length}
      />

      {tabMenu && (
        <TabContextMenu
          tab={tabMenu.tab}
          x={tabMenu.x}
          y={tabMenu.y}
          anchor={tabMenu.rect}
          keyboard={tabMenu.keyboard}
          onMove={(step) => movePinnedFromMenu(tabMenu.tab, step)}
          onClose={() => closeTabMenu(tabMenu.tab.id)}
        />
      )}

      {emptyMenu && (
        <TileMenu
          x={emptyMenu.x}
          y={emptyMenu.y}
          label="Liste des onglets"
          items={emptyTabItems()}
          onClose={() => setEmptyMenu(null)}
        />
      )}

      {menu && (
        <TileMenu
          x={menu.x}
          y={menu.y}
          label={displayTitle(menu.bookmark.title)}
          items={menuItems(menu)}
          onClose={() => closeMenu(menu.bookmark.id)}
        />
      )}

      {groupMenu && (
        <TileMenu
          x={groupMenu.x}
          y={groupMenu.y}
          label={`Dossier ${groupMenu.group.name}`}
          items={groupMenuItems(groupMenu.group)}
          onClose={() => setGroupMenu(null)}
        />
      )}
    </aside>
  )
}
