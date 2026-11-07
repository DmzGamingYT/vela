import type { ReactNode } from 'react'
import type { TabView } from '@shared/types'
import { pinnedNeighbour, pinnedTitle, canSleep, canToggleSound } from '@shared/pinnedTabMenu'
import { displayTitle, hostOf, isHomeUrl, prettyUrl } from '@shared/url'
import { shortcut } from '../lib/format'
import { useBrowser } from '../store/browser'
import Favicon from './Favicon'
import TileMenu, { type TileMenuItem } from './TileMenu'

/** Trait entre deux groupes d'actions. */
const sep = (id: string): TileMenuItem => ({ id, label: '', separator: true })

/** ⌥ sur macOS, Alt ailleurs : même touche, deux écritures. */
function altArrow(arrow: string): string {
  return window.vela?.platform === 'darwin' ? `⌥${arrow}` : `Alt+${arrow}`
}

/**
 * Menu d'un onglet, partagé par la ligne de la liste et la case épinglée.
 *
 * Rien n'est proposé au clic droit qui ne soit réellement câblé : une action
 * sans objet dans l'état courant est absente du menu, jamais grisée pour rien.
 * Un onglet épinglé a son propre ordre : en-tête, page, son, Vela, rangement,
 * fermeture — et sa fermeture s'annule pendant huit secondes.
 */
export default function TabContextMenu({
  tab,
  x,
  y,
  anchor,
  onMove,
  keyboard,
  onClose
}: {
  tab: TabView
  x: number
  y: number
  /** Case d'origine : le menu s'ouvre à côté, jamais par-dessus. */
  anchor?: { left: number; top: number; right: number; bottom: number }
  /** Déplacement dans la rangée des épinglés, annoncé par la barre latérale. */
  onMove?: (step: -1 | 1) => void
  /** Ouverture au clavier : la première action est focalisée. */
  keyboard?: boolean
  onClose: () => void
}) {
  const view = useBrowser((state) => state.view)
  const closeTab = useBrowser((state) => state.closeTab)
  const closeWithUndo = useBrowser((state) => state.closeWithUndo)
  const closeOthers = useBrowser((state) => state.closeOthers)
  const pin = useBrowser((state) => state.pin)
  const reload = useBrowser((state) => state.reload)
  const newTab = useBrowser((state) => state.newTab)
  const splitWith = useBrowser((state) => state.splitWith)
  const toggleMute = useBrowser((state) => state.toggleMute)
  const toggleBookmark = useBrowser((state) => state.toggleBookmark)
  const captureSelection = useBrowser((state) => state.captureSelection)
  const reopen = useBrowser((state) => state.reopen)
  const sleep = useBrowser((state) => state.sleep)
  const toggleAgent = useBrowser((state) => state.toggleAgent)
  const startAgent = useBrowser((state) => state.startAgent)
  const createGroup = useBrowser((state) => state.createGroup)
  const moveTabToGroup = useBrowser((state) => state.moveTabToGroup)
  const reorderTab = useBrowser((state) => state.reorderTab)
  const toast = useBrowser((state) => state.toast)

  const home = isHomeUrl(tab.url)
  const host = hostOf(tab.url)
  const bookmarked = Boolean(view?.bookmarks.some((bookmark) => bookmark.url === tab.url))
  const groups = (view?.groups ?? [])
    .filter((group) => group.spaceId === tab.spaceId)
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
  const pinnedIds = (view?.tabs ?? [])
    .filter((item) => item.spaceId === tab.spaceId && item.pinned)
    .map((item) => item.id)

  const copy = (text: string, message: string): void => {
    void navigator.clipboard
      .writeText(text)
      .then(() => toast(message))
      .catch(() => toast('Copie impossible.', 'error'))
  }

  /** Lien Markdown : l'adresse seule, avec le titre de la page pour l'étiquette. */
  const markdownLink = `[${(displayTitle(tab.title) || prettyUrl(tab.url)).replace(/([[\]])/g, '\\$1')}](${tab.url})`

  const joinAgent = (): void => {
    // Même chemin que « Joindre l'actuel » dans le panneau : l'onglet est
    // ajouté aux sources, puis consommé par le panneau à son ouverture.
    useBrowser.setState({ agentSourceTab: tab.id })
    toggleAgent(true)
  }

  /** Demande prête, envoyée tout de suite : la page est la seule source. */
  const askAgent = (prompt: string): void => {
    toggleAgent(true)
    void startAgent(prompt, [tab.id], 'answer')
  }

  const movingToFolder: TileMenuItem[] = [
    ...(tab.groupId
      ? [{ id: 'ungroup', label: 'Sortir du dossier', icon: 'folder' as const, onSelect: () => moveTabToGroup(tab.id, null) }]
      : []),
    ...groups
      .filter((group) => group.id !== tab.groupId)
      .map((group) => ({
        id: `group-${group.id}`,
        label: group.name,
        icon: 'folder' as const,
        onSelect: () => moveTabToGroup(tab.id, group.id)
      })),
    {
      id: 'new-group',
      label: 'Nouveau dossier…',
      icon: 'plus',
      onSelect: () => void createGroup(tab.id)
    }
  ]

  let items: TileMenuItem[]
  let header: ReactNode

  if (home) {
    // Un onglet d'accueil n'a ni adresse à copier ni place dans un dossier.
    items = [
      { id: 'close', label: 'Fermer l’onglet', icon: 'close', keys: shortcut('W'), onSelect: () => closeTab(tab.id) },
      {
        id: 'close-others',
        label: 'Fermer les autres onglets',
        icon: 'trash',
        danger: true,
        onSelect: () => void closeOthers(tab.id)
      },
      sep('sep-home'),
      { id: 'new', label: 'Nouvel onglet', icon: 'plus', keys: shortcut('T'), onSelect: () => newTab() }
    ]
  } else if (tab.pinned) {
    const left = pinnedNeighbour(pinnedIds, tab.id, -1)
    const right = pinnedNeighbour(pinnedIds, tab.id, 1)
    const move = (step: -1 | 1, targetId: string): void => {
      if (onMove) onMove(step)
      else reorderTab(tab.id, targetId, step < 0 ? 'before' : 'after', true)
    }

    header = (
      <>
        <Favicon src={tab.favicon} url={tab.url} label={tab.title} size={16} spaceId={tab.spaceId} />
        <span className="tile-menu-head-copy">
          <span className="tile-menu-head-title">{pinnedTitle(tab.title, host)}</span>
          <span className="tile-menu-head-host">{host}</span>
        </span>
      </>
    )

    items = [
      { id: 'reload', label: 'Recharger', icon: 'reload', keys: shortcut('R'), onSelect: () => reload(tab.id) },
      { id: 'copy-url', label: 'Copier l’adresse', icon: 'link', onSelect: () => copy(tab.url, 'Adresse copiée.') },
      {
        id: 'copy-markdown',
        label: 'Copier comme lien Markdown',
        icon: 'code',
        onSelect: () => copy(markdownLink, 'Lien Markdown copié.')
      },
      ...(canToggleSound(tab)
        ? [
            sep('sep-sound'),
            {
              id: 'mute',
              label: tab.muted ? 'Réactiver le son' : 'Couper le son',
              icon: tab.muted ? ('volume-off' as const) : ('volume' as const),
              onSelect: () => toggleMute(tab.id, !tab.muted)
            }
          ]
        : []),
      sep('sep-vela'),
      {
        id: 'split',
        label: 'Ouvrir en vue scindée',
        icon: 'split',
        keys: shortcut('⇧D'),
        onSelect: () => splitWith(tab.id)
      },
      {
        id: 'duplicate',
        label: 'Dupliquer dans un nouvel onglet',
        icon: 'copy',
        hint: 'Ouvre la même adresse dans un onglet de cet espace, sans reprendre l’historique.',
        onSelect: () => newTab(tab.url)
      },
      {
        id: 'agent',
        label: 'Joindre à l’agent',
        icon: 'sparkles',
        hint: 'Ajoute cette page aux onglets lus par l’agent.',
        onSelect: joinAgent
      },
      {
        id: 'summarize',
        label: 'Résumer cette page',
        icon: 'list',
        hint: 'L’agent lit la page et répond dans le fil.',
        onSelect: () =>
          askAgent('Résume cette page en cinq points clés, puis une synthèse de trois lignes.')
      },
      {
        id: 'translate',
        label: 'Traduire cette page',
        icon: 'translate',
        hint: 'En français, titres et structure conservés.',
        onSelect: () =>
          askAgent('Traduis cette page en français, en gardant les titres et la structure.')
      },
      {
        id: 'capture',
        label: 'Capturer dans les notes',
        icon: 'notes',
        hint: 'Ajoute la sélection de la page aux notes de l’espace.',
        onSelect: () => void captureSelection()
      },
      sep('sep-organise'),
      { id: 'unpin', label: 'Désépingler', icon: 'pin', onSelect: () => pin(tab.id, false) },
      ...(left
        ? [
            {
              id: 'move-left',
              label: 'Déplacer à gauche',
              icon: 'back' as const,
              keys: altArrow('←'),
              onSelect: () => move(-1, left)
            }
          ]
        : []),
      ...(right
        ? [
            {
              id: 'move-right',
              label: 'Déplacer à droite',
              icon: 'forward' as const,
              keys: altArrow('→'),
              onSelect: () => move(1, right)
            }
          ]
        : []),
      sep('sep-fermer'),
      ...(canSleep(tab)
        ? [
            {
              id: 'sleep',
              label: 'Mettre en veille',
              icon: 'moon' as const,
              hint: 'Décharge la page sans retirer l’épingle ; elle se recharge au prochain clic.',
              onSelect: () => sleep(tab.id)
            }
          ]
        : []),
      sep('sep-danger'),
      {
        id: 'close',
        label: 'Fermer',
        icon: 'close',
        danger: true,
        keys: shortcut('W'),
        onSelect: () => closeWithUndo(tab.id)
      }
    ]
  } else {
    items = [
      { id: 'reload', label: 'Recharger', icon: 'reload', keys: shortcut('R'), onSelect: () => reload(tab.id) },
      {
        id: 'duplicate',
        label: 'Dupliquer l’onglet',
        icon: 'copy',
        hint: 'Ouvre la même adresse dans un nouvel onglet, sans reprendre l’historique.',
        onSelect: () => newTab(tab.url)
      },
      { id: 'copy-url', label: 'Copier l’adresse', icon: 'link', onSelect: () => copy(tab.url, 'Adresse copiée.') },
      {
        id: 'copy-markdown',
        label: 'Copier comme lien Markdown',
        icon: 'code',
        onSelect: () => copy(markdownLink, 'Lien Markdown copié.')
      },
      sep('sep-page'),
      { id: 'pin', label: 'Épingler', icon: 'pin', onSelect: () => pin(tab.id, true) },
      { id: 'group', label: 'Mettre dans un dossier', icon: 'folder', submenu: movingToFolder },
      {
        id: 'bookmark',
        label: bookmarked ? 'Retirer des marque-pages' : 'Ajouter aux marque-pages',
        icon: 'star',
        keys: shortcut('D'),
        onSelect: () => void toggleBookmark(tab.id)
      },
      sep('sep-organise'),
      {
        id: 'split',
        label: 'Ouvrir en vue scindée',
        icon: 'split',
        keys: shortcut('⇧D'),
        onSelect: () => splitWith(tab.id)
      },
      {
        id: 'agent',
        label: 'Joindre à l’agent',
        icon: 'sparkles',
        hint: 'Ajoute cette page aux onglets lus par l’agent.',
        onSelect: joinAgent
      },
      {
        id: 'summarize',
        label: 'Résumer cette page',
        icon: 'list',
        hint: 'L’agent lit la page et répond dans le fil.',
        onSelect: () =>
          askAgent('Résume cette page en cinq points clés, puis une synthèse de trois lignes.')
      },
      {
        id: 'translate',
        label: 'Traduire cette page',
        icon: 'translate',
        hint: 'En français, titres et structure conservés.',
        onSelect: () =>
          askAgent('Traduis cette page en français, en gardant les titres et la structure.')
      },
      {
        id: 'capture',
        label: 'Capturer dans les notes',
        icon: 'notes',
        hint: 'Ajoute la sélection de la page aux notes de l’espace.',
        onSelect: () => void captureSelection()
      },
      ...(tab.audible || tab.muted
        ? [
            {
              id: 'mute',
              label: tab.muted ? 'Réactiver le son' : 'Couper le son',
              icon: tab.muted ? ('volume-off' as const) : ('volume' as const),
              onSelect: () => toggleMute(tab.id, !tab.muted)
            }
          ]
        : []),
      sep('sep-vela'),
      { id: 'close', label: 'Fermer l’onglet', icon: 'close', keys: shortcut('W'), onSelect: () => closeTab(tab.id) },
      {
        id: 'close-others',
        label: 'Fermer les autres onglets',
        icon: 'trash',
        danger: true,
        onSelect: () => void closeOthers(tab.id)
      },
      ...(view?.canReopen
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
  }

  // La case épinglée ne doit pas être recouverte : le menu s'ouvre à sa droite,
  // et se retourne à gauche quand il n'y a plus la place.
  let menuX = x
  const menuY = anchor ? Math.max(8, anchor.top) : y
  if (anchor) {
    const gap = 8
    menuX = anchor.right + gap
    if (menuX + 252 > window.innerWidth - 8) menuX = anchor.left - 252 - gap
    if (menuX < 8) menuX = Math.max(8, window.innerWidth - 252 - 8)
  }

  return (
    <TileMenu
      x={menuX}
      y={menuY}
      label={home ? 'Onglet Accueil' : displayTitle(tab.title)}
      header={header}
      items={items}
      keyboard={keyboard}
      onClose={onClose}
    />
  )
}
