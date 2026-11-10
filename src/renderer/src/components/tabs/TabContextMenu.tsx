import type { ReactNode } from 'react'
import type { TabView } from '@shared/types'
import { pinnedNeighbour, pinnedTitle, canSleep } from '@shared/pinnedTabMenu'
import { displayTitle, hostOf, isHomeUrl, prettyUrl } from '@shared/url'
import { shortcut } from '../../lib/format'
import { useBrowser } from '../../store/browser'
import Favicon from '../Favicon'
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
 * Ordre par fréquence : recharger, copier, vue scindée, dupliquer, agent, puis
 * l'organisation, et la fermeture en dernier. Les actions longues (copie,
 * fermeture) tiennent dans un sous-menu pour que la liste reste courte.
 *
 * Rien n'est proposé qui ne soit réellement câblé : une action sans objet dans
 * l'état courant est absente, jamais grisée pour rien.
 */
export default function TabContextMenu({
  tab,
  x,
  y,
  anchor,
  onMove,
  onClose
}: {
  tab: TabView
  x: number
  y: number
  /** Case d'origine : le menu s'ouvre à côté, jamais par-dessus. */
  anchor?: { left: number; top: number; right: number; bottom: number }
  /** Déplacement dans la rangée des épinglés, annoncé par la barre latérale. */
  onMove?: (step: -1 | 1) => void
  /** Conservé pour les appelants : la première entrée est toujours focalisée. */
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
  const selectTab = useBrowser((state) => state.selectTab)
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
  const title = displayTitle(tab.title) || prettyUrl(tab.url)
  const bookmarked = Boolean(view?.bookmarks.some((bookmark) => bookmark.url === tab.url))
  const groups = (view?.groups ?? [])
    .filter((group) => group.spaceId === tab.spaceId)
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
  const pinnedIds = (view?.tabs ?? [])
    .filter((item) => item.spaceId === tab.spaceId && item.pinned)
    .map((item) => item.id)

  // Les autres onglets du même domaine : « couper le son du site » agit sur
  // tous, pas seulement sur celui qui joue.
  const sameSite = (view?.tabs ?? []).filter(
    (item) => item.spaceId === tab.spaceId && !isHomeUrl(item.url) && hostOf(item.url) === host
  )
  const siteMuted = sameSite.length > 0 && sameSite.every((item) => item.muted)
  const siteAudible = tab.audible || tab.muted || sameSite.some((item) => item.audible)

  // Onglets ouverts après celui-ci dans la liste, hors épinglés.
  const ordered = (view?.tabs ?? [])
    .filter((item) => item.spaceId === tab.spaceId && !item.pinned && !isHomeUrl(item.url))
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
  const position = ordered.findIndex((item) => item.id === tab.id)
  const belowIds = position >= 0 ? ordered.slice(position + 1).map((item) => item.id) : []

  const copy = (text: string, message: string): void => {
    void navigator.clipboard
      .writeText(text)
      .then(() => toast(message))
      .catch(() => toast('Copie impossible.', 'error'))
  }

  /** Lien Markdown : l'adresse seule, avec le titre de la page pour l'étiquette. */
  const markdownLink = `[${(displayTitle(tab.title) || prettyUrl(tab.url)).replace(/([[\\]])/g, '\\\\$1')}](${tab.url})`

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

  const agentItems: TileMenuItem[] = [
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
    }
  ]

  const movingToFolder: TileMenuItem[] = [
    ...(tab.groupId
      ? [
          {
            id: 'ungroup',
            label: 'Sortir du dossier',
            icon: 'folder' as const,
            onSelect: () => moveTabToGroup(tab.id, null)
          }
        ]
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

  /** Trois formats sous un seul libellé : le menu garde sa longueur. */
  const copyItem: TileMenuItem = {
    id: 'copy-link',
    label: 'Copier le lien',
    icon: 'copy',
    submenu: [
      {
        id: 'copy-url',
        label: 'Adresse',
        icon: 'copy',
        keys: shortcut('⇧C'),
        onSelect: () => copy(tab.url, 'Adresse copiée.')
      },
      {
        id: 'copy-markdown',
        label: 'Lien Markdown',
        icon: 'link',
        onSelect: () => copy(markdownLink, 'Lien Markdown copié.')
      },
      {
        id: 'copy-title-url',
        label: 'Titre et adresse',
        icon: 'list',
        onSelect: () => copy(`${title} — ${tab.url}`, 'Titre et adresse copiés.')
      }
    ]
  }

  const closeItems: TileMenuItem[] = [
    {
      id: 'close-others',
      label: 'Fermer les autres onglets',
      icon: 'trash',
      onSelect: () => void closeOthers(tab.id)
    },
    ...(belowIds.length > 0
      ? [
          {
            id: 'close-below',
            label: `Fermer les ${belowIds.length} onglets en dessous`,
            icon: 'arrow-down' as const,
            onSelect: () => {
              for (const id of belowIds) closeTab(id)
            }
          }
        ]
      : [])
  ]

  const soundItems: TileMenuItem[] = siteAudible
    ? [
        {
          id: 'mute-site',
          label: siteMuted ? 'Rétablir le son du site' : 'Couper le son du site',
          icon: siteMuted ? ('volume-off' as const) : ('volume' as const),
          hint: `Tous les onglets de ${host}.`,
          onSelect: () => {
            const next = !siteMuted
            for (const item of sameSite) if (item.muted !== next) toggleMute(item.id, next)
          }
        }
      ]
    : []

  /** Le haut du menu est le même partout : on agit d'abord sur la page. */
  const leadItems: TileMenuItem[] = [
    ...(tab.asleep
      ? [
          {
            id: 'wake',
            label: 'Réveiller',
            icon: 'sun' as const,
            hint: 'La page se recharge, son état est conservé.',
            onSelect: () => selectTab(tab.id)
          }
        ]
      : [
          {
            id: 'reload',
            label: 'Recharger',
            icon: 'reload' as const,
            keys: shortcut('R'),
            onSelect: () => reload(tab.id)
          }
        ]),
    copyItem,
    {
      id: 'split',
      label: 'Ouvrir en vue scindée',
      icon: 'split',
      keys: shortcut('⇧D'),
      onSelect: () => splitWith(tab.id)
    },
    {
      id: 'duplicate',
      label: 'Dupliquer',
      icon: 'external',
      keys: shortcut('⇧K'),
      hint: 'Ouvre la même adresse dans un onglet de cet espace, sans reprendre l’historique.',
      onSelect: () => newTab(tab.url)
    },
    { id: 'agent-menu', label: 'Demander à l’Agent', icon: 'sparkles', submenu: agentItems },
    ...soundItems
  ]

  let items: TileMenuItem[]
  let header: ReactNode

  if (home) {
    // Un onglet d'accueil n'a ni adresse à copier ni place dans un dossier.
    items = [
      {
        id: 'close',
        label: 'Fermer l’onglet',
        icon: 'close',
        danger: true,
        keys: shortcut('W'),
        onSelect: () => closeTab(tab.id)
      },
      {
        id: 'close-menu',
        label: 'Fermer…',
        icon: 'trash',
        submenu: closeItems
      },
      sep('sep-home'),
      {
        id: 'new',
        label: 'Nouvel onglet',
        icon: 'plus',
        keys: shortcut('T'),
        onSelect: () => newTab()
      }
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
        <Favicon
          src={tab.favicon}
          url={tab.url}
          label={tab.title}
          size={16}
          spaceId={tab.spaceId}
        />
        <span className="tile-menu-head-copy">
          <span className="tile-menu-head-title">{pinnedTitle(tab.title, host)}</span>
          <span className="tile-menu-head-host">{host}</span>
        </span>
      </>
    )

    items = [
      ...leadItems,
      sep('sep-organise'),
      {
        id: 'unpin',
        label: 'Désépingler',
        icon: 'pin',
        keys: shortcut('⇧E'),
        onSelect: () => pin(tab.id, false)
      },
      ...(canSleep(tab)
        ? [
            {
              id: 'sleep',
              label: 'Mettre en veille',
              icon: 'moon' as const,
              keys: shortcut('⇧S'),
              hint: 'Décharge la page sans retirer l’épingle ; elle se recharge au prochain clic.',
              onSelect: () => sleep(tab.id)
            }
          ]
        : []),
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
      sep('sep-danger'),
      {
        id: 'close',
        label: 'Fermer l’onglet',
        icon: 'close',
        danger: true,
        keys: shortcut('W'),
        onSelect: () => closeWithUndo(tab.id)
      },
      { id: 'close-menu', label: 'Fermer…', icon: 'trash', submenu: closeItems }
    ]
  } else {
    header = (
      <>
        <Favicon
          src={tab.favicon}
          url={tab.url}
          label={tab.title}
          size={16}
          spaceId={tab.spaceId}
        />
        <span className="tile-menu-head-copy">
          <span className="tile-menu-head-title">{title}</span>
          <span className="tile-menu-head-host">{host}</span>
        </span>
      </>
    )

    items = [
      ...leadItems,
      sep('sep-page'),
      { id: 'pin', label: 'Épingler', icon: 'pin', onSelect: () => pin(tab.id, true) },
      {
        id: 'group',
        label: 'Ajouter à un dossier',
        icon: 'folder',
        submenu: movingToFolder
      },
      {
        id: 'bookmark',
        label: bookmarked ? 'Retirer des marque-pages' : 'Ajouter aux marque-pages',
        icon: 'star',
        keys: shortcut('D'),
        onSelect: () => void toggleBookmark(tab.id)
      },
      sep('sep-organise'),
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
        : []),
      {
        id: 'close',
        label: 'Fermer l’onglet',
        icon: 'close',
        danger: true,
        keys: shortcut('W'),
        onSelect: () => closeTab(tab.id)
      },
      { id: 'close-menu', label: 'Fermer…', icon: 'trash', submenu: closeItems }
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
      label={home ? 'Onglet Accueil' : title}
      header={header}
      items={items}
      onClose={onClose}
    />
  )
}
