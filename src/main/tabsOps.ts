/**
 * Gestes d'onglet : création, activation, fermeture, réouverture, scission,
 * épinglage, réordonnancement.
 *
 * Troisième tranche de C2 : ce bloc vivait dans `Browser`, au milieu des
 * espaces, des réglages et de l'IPC. Le code est copié à l'identique ; seules
 * les dépendances passent par l'hôte, pour que ce module ne connaisse ni la
 * fenêtre, ni le gestionnaire de vues, ni la trace de l'agent.
 */
import type { WebContents } from 'electron'
import { createTab as createTabState } from '@shared/defaults'
import { isHomeUrl, isLoadableUrl, titleFromUrl } from '@shared/url'
import { moveTab } from '@shared/ordering'
import type { CreateTabInput, ReorderTabsInput } from '@shared/api'
import { HOME_URL, type PersistedState, type TabState } from '@shared/types'
import { asId } from './coerce'

export interface TabsHost {
  state(): PersistedState
  persist(): void
  broadcast(): void
  focusWindow(): void
  /** La fenêtre est-elle assez large pour deux vues côte à côte ? */
  splitAllowed(): boolean
  /** L'identifiant d'un onglet fermé ne doit pas rester dans la trace de l'agent. */
  forgetAgentTab(tabId: string): void
  destroyView(tabId: string): void
  captureSource(tabId: string): WebContents | null
  storeThumbnail(contents: WebContents, url: string): Promise<boolean>
}

export function createTab(host: TabsHost, input: CreateTabInput = {}): TabState {
  const state = host.state()
  const spaceId =
    typeof input.spaceId === 'string' && state.spaces.some((space) => space.id === input.spaceId)
      ? input.spaceId
      : state.activeSpaceId
  const requested = typeof input.url === 'string' ? input.url.trim() : ''
  // Seules les adresses web entrent dans une vue : une URL `file:` ou
  // `data:` venue d'une page ou d'un modèle ouvrirait le disque local.
  if (requested && !isLoadableUrl(requested)) {
    throw new Error('adresse refusée — seules les adresses http et https sont ouvertes')
  }
  const url = requested || (state.settings.newTabBlank ? 'about:blank' : HOME_URL)
  const pinned = Boolean(input.pinned)
  // Une seule page d'accueil par espace : ⌘T ramène à celle qui existe.
  // Le « + » d'un dossier la réclame ailleurs : elle le rejoint plutôt que
  // d'en créer une seconde, sinon le bouton semblerait sans effet.
  if (isHomeUrl(url) && !pinned) {
    const home = state.tabs.find(
      (tab) => tab.spaceId === spaceId && !tab.pinned && isHomeUrl(tab.url)
    )
    if (home) {
      const target =
        typeof input.groupId === 'string'
          ? state.groups.find((item) => item.id === input.groupId && item.spaceId === spaceId)
          : undefined
      if (target && home.groupId !== target.id) {
        home.groupId = target.id
        if (target.collapsed) target.collapsed = false
        host.persist()
        host.broadcast()
      }
      if (input.activate !== false) activateTab(host, home.id)
      else host.broadcast()
      return home
    }
  }
  let groupId: string | null = null
  if (!pinned && typeof input.groupId === 'string') {
    const group = state.groups.find((item) => item.id === input.groupId && item.spaceId === spaceId)
    if (group) {
      groupId = group.id
      if (group.collapsed) group.collapsed = false
    }
  }
  const tab = createTabState(spaceId, Date.now(), {
    url,
    title: isHomeUrl(url) ? 'Nouvel onglet' : titleFromUrl(url),
    pinned,
    groupId
  })
  state.tabs.push(tab)

  if (input.activate !== false) {
    const previous = state.activeTabBySpace[spaceId]
    state.activeSpaceId = spaceId
    state.activeTabBySpace[spaceId] = tab.id
    if (state.split && state.secondTabBySpace[spaceId] === tab.id)
      state.secondTabBySpace[spaceId] = previous ?? null
    tab.lastActiveAt = Date.now()
    host.focusWindow()
  }

  host.persist()
  host.broadcast()
  return tab
}

export function activateTab(host: TabsHost, id: string): void {
  const state = host.state()
  const tab = state.tabs.find((item) => item.id === id)
  if (!tab) return
  const previous = state.activeTabBySpace[tab.spaceId]
  if (state.split && state.secondTabBySpace[tab.spaceId] === tab.id) {
    state.secondTabBySpace[tab.spaceId] = previous && previous !== tab.id ? previous : null
  }
  state.activeSpaceId = tab.spaceId
  state.activeTabBySpace[tab.spaceId] = tab.id
  tab.lastActiveAt = Date.now()
  if (tab.groupId) {
    const group = state.groups.find((item) => item.id === tab.groupId)
    if (group?.collapsed) group.collapsed = false
  }
  host.persist()
  host.broadcast()
  host.focusWindow()
}

export async function closeTab(host: TabsHost, id: string): Promise<void> {
  const state = host.state()
  const tab = state.tabs.find((item) => item.id === id)
  if (!tab) return
  const spaceId = tab.spaceId
  const before = state.tabs.filter((item) => item.spaceId === spaceId)
  const index = before.findIndex((item) => item.id === id)

  host.forgetAgentTab(id)
  state.tabs = state.tabs.filter((item) => item.id !== id)
  state.closed = [
    { spaceId, url: tab.url, title: tab.title, pinned: tab.pinned, groupId: tab.groupId ?? null },
    ...state.closed
  ].slice(0, 25)

  if (state.secondTabBySpace[spaceId] === id) state.secondTabBySpace[spaceId] = null

  if (state.activeTabBySpace[spaceId] === id) {
    const remaining = state.tabs.filter((item) => item.spaceId === spaceId)
    let next = remaining[Math.min(index, remaining.length - 1)]
    if (!next) {
      next = createTabState(spaceId)
      state.tabs.push(next)
    }
    state.activeTabBySpace[spaceId] = next.id
    next.lastActiveAt = Date.now()
    if (state.secondTabBySpace[spaceId] === next.id) state.secondTabBySpace[spaceId] = null
  }

  await captureThumbnail(host, id, tab)
  host.destroyView(id)
  host.persist()
  host.broadcast()
  host.focusWindow()
}

/**
 * Vignette de la page qui se ferme. Rien pour un espace privé, une page en
 * erreur ou une adresse interne, et rien du tout si le réglage est coupé.
 */
async function captureThumbnail(host: TabsHost, tabId: string, tab: TabState): Promise<void> {
  const state = host.state()
  if (!state.settings.thumbnails) return
  const space = state.spaces.find((item) => item.id === tab.spaceId)
  if (!space || space.private === true) return
  if (!/^https?:/i.test(tab.url)) return
  const contents = host.captureSource(tabId)
  if (!contents) return
  // La capture est attendue : la vue meurt juste après la fermeture.
  await host.storeThumbnail(contents, tab.url)
}

export function reopenTab(host: TabsHost): void {
  const state = host.state()
  const entry = state.closed.shift()
  if (!entry) return
  const spaceId = state.spaces.some((space) => space.id === entry.spaceId)
    ? entry.spaceId
    : state.activeSpaceId
  const group = entry.groupId
    ? state.groups.find((item) => item.id === entry.groupId && item.spaceId === spaceId)
    : undefined
  const tab = createTabState(spaceId, Date.now(), {
    url: entry.url || HOME_URL,
    title: entry.title || (isHomeUrl(entry.url) ? 'Nouvel onglet' : titleFromUrl(entry.url)),
    pinned: entry.pinned,
    groupId: group?.id ?? null
  })
  state.tabs.push(tab)
  state.activeSpaceId = spaceId
  state.activeTabBySpace[spaceId] = tab.id
  tab.lastActiveAt = Date.now()
  host.persist()
  host.broadcast()
  host.focusWindow()
}

export function toggleSplit(host: TabsHost): void {
  // Garde-fou : la coque prévient déjà l'utilisateur, mais un raccourci,
  // un menu ou le coup d'œil peut aussi demander le split par IPC.
  if (!host.splitAllowed()) return
  const state = host.state()
  const spaceId = state.activeSpaceId
  const activeId = state.activeTabBySpace[spaceId]
  const existing = state.secondTabBySpace[spaceId]
  if (state.split && existing) {
    state.split = false
  } else if (existing && existing !== activeId && state.tabs.some((tab) => tab.id === existing)) {
    state.split = true
  } else {
    let second = state.tabs.find((tab) => tab.spaceId === spaceId && tab.id !== activeId)
    if (!second) {
      second = createTabState(spaceId)
      state.tabs.push(second)
    }
    state.secondTabBySpace[spaceId] = second.id
    state.split = true
  }
  host.persist()
  host.broadcast()
}

export function setSplitTab(host: TabsHost, id: string): void {
  if (!host.splitAllowed()) return
  const state = host.state()
  const tab = state.tabs.find((item) => item.id === id)
  if (!tab) return
  const activeId = state.activeTabBySpace[tab.spaceId]
  if (tab.id === activeId) {
    const fallback = state.tabs.find((item) => item.spaceId === tab.spaceId && item.id !== activeId)
    state.secondTabBySpace[tab.spaceId] = fallback?.id ?? null
    state.split = Boolean(fallback)
  } else {
    state.secondTabBySpace[tab.spaceId] = tab.id
    state.activeSpaceId = tab.spaceId
    state.split = true
  }
  host.persist()
  host.broadcast()
}

export function pinTab(host: TabsHost, input: unknown): void {
  const payload = (input ?? {}) as { id?: unknown; pinned?: unknown }
  const id = asId(payload.id)
  const state = host.state()
  const tab = state.tabs.find((item) => item.id === id)
  if (!tab) return
  tab.pinned = Boolean(payload.pinned)
  if (tab.pinned) tab.groupId = null
  host.persist()
  host.broadcast()
}

export function reorderTab(host: TabsHost, input: unknown): void {
  const payload = (input ?? {}) as ReorderTabsInput
  const id = asId(payload.id)
  const state = host.state()
  const tab = state.tabs.find((item) => item.id === id)
  if (!tab) return

  let groupId: string | null | undefined
  if (payload.groupId !== undefined) {
    groupId = null
    if (typeof payload.groupId === 'string') {
      const group = state.groups.find(
        (item) => item.id === payload.groupId && item.spaceId === tab.spaceId
      )
      if (group) groupId = group.id
    }
  }

  const next = moveTab(state.tabs, {
    id,
    targetId: typeof payload.targetId === 'string' ? payload.targetId : null,
    position: payload.position === 'after' ? 'after' : 'before',
    groupId,
    ...(typeof payload.pinned === 'boolean' ? { pinned: payload.pinned } : {})
  })
  if (next === state.tabs) return
  state.tabs = next

  if (tab.groupId) {
    const group = state.groups.find((item) => item.id === tab.groupId)
    if (group?.collapsed) group.collapsed = false
  }
  host.persist()
  host.broadcast()
}
