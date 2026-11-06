import type { StateCreator } from 'zustand'
import type { TabGroup } from '@shared/types'
import { HOME_URL } from '@shared/types'
import { hostOf, isHomeUrl } from '@shared/url'
import type { BrowserState } from '../browser'

export interface TabsSlice {
  splitRatioLive: number | null
  findOpen: boolean
  findQuery: string
  findResult: { matches: number; activeMatchOrdinal: number }
  lastGrouping: { groupIds: string[]; tabIds: string[] } | null
  newTab(url?: string, groupId?: string): void
  closeTab(id: string): void
  /** Ferme et propose de rouvrir pendant huit secondes. */
  closeWithUndo(id: string): void
  /** Décharge la page sans retirer l'onglet ; il se recharge au clic. */
  sleep(id: string): void
  selectTab(id: string): void
  navigate(id: string, input: string): void
  back(id: string): void
  forward(id: string): void
  reload(id: string): void
  stop(id: string): void
  pin(id: string, pinned: boolean): void
  toggleMute(id: string, muted: boolean): void
  reorderTab(
    id: string,
    targetId: string | null,
    position: 'before' | 'after',
    pinned?: boolean
  ): void
  moveTabToGroup(id: string, groupId: string | null): void
  createGroup(tabId?: string): Promise<TabGroup | null>
  updateGroup(
    id: string,
    patch: { name?: string; color?: string; collapsed?: boolean }
  ): Promise<void>
  removeGroup(id: string): Promise<void>
  reopen(): void
  splitToggle(): void
  splitWith(id: string): void
  openSplit(url: string): void
  setSplitRatio(ratio: number): void
  commitSplitRatio(ratio: number): void
  printPage(): Promise<void>
  toggleBookmark(tabId?: string): Promise<void>
  removeBookmark(id: string): Promise<void>
  moveBookmark(id: string, position: number): Promise<boolean>
  reorderBookmarks(ids: string[]): Promise<boolean>
  removeHistory(url: string): Promise<void>
  importBookmarks(urls: string[], entries?: { title: string; url: string }[]): Promise<void>
  pinEssentials(selection?: string[]): Promise<void>
  groupTabsBySite(): Promise<void>
  undoGrouping(): Promise<void>
  closeOthers(id: string): Promise<void>
  findInPage(query: string, forward?: boolean): Promise<void>
  closeFind(): void
  zoom(direction: 'in' | 'out' | 'reset'): Promise<void>
}

/** Effacement automatique du pourcentage de zoom. */
let zoomTimer: ReturnType<typeof setTimeout> | null = null

/** Onglets, dossiers, vue scindée, historique et favoris. */
export const createTabsSlice: StateCreator<BrowserState, [], [], TabsSlice> = (set, get) => ({
  splitRatioLive: null,
  findOpen: false,
  findQuery: '',
  findResult: { matches: 0, activeMatchOrdinal: 0 },
  lastGrouping: null,

  newTab(url = HOME_URL, groupId) {
    void get().call(
      () => window.vela.tabs.create({ url, groupId }),
      'Impossible d’ouvrir un onglet.'
    )
    if (url === HOME_URL) {
      set({ overlay: null })
      get().focusAddress()
    }
  },

  closeTab(id) {
    void get().call(() => window.vela.tabs.close(id), 'Impossible de fermer l’onglet.')
  },

  closeWithUndo(id) {
    const tab = get().view?.tabs.find((item) => item.id === id)
    if (!tab) return
    // `reopen` restaure le dernier onglet fermé : c'est celui-ci, à l'instant.
    get().toast('Onglet fermé', 'info', { label: 'Annuler', run: () => get().reopen() }, 8000)
    get().closeTab(id)
  },

  sleep(id) {
    void (async () => {
      const result = await get().call(
        () => window.vela.tabs.discard(id),
        'Mise en veille impossible.'
      )
      if (result !== null) {
        get().toast(
          'Onglet en veille : il se rechargera au prochain clic.',
          'info',
          undefined,
          4200
        )
      }
    })()
  },

  selectTab(id) {
    void get().call(() => window.vela.tabs.activate(id), 'Onglet introuvable.')
  },

  navigate(id, input) {
    void get().call(() => window.vela.tabs.navigate(id, input), 'Navigation impossible.')
  },

  back(id) {
    void get().call(() => window.vela.tabs.back(id), 'Navigation impossible.')
  },

  forward(id) {
    void get().call(() => window.vela.tabs.forward(id), 'Navigation impossible.')
  },

  reload(id) {
    void get().call(() => window.vela.tabs.reload(id), 'Rechargement impossible.')
  },

  stop(id) {
    void get().call(() => window.vela.tabs.stop(id), 'Impossible d’arrêter la page.')
  },

  pin(id, pinned) {
    void get().call(() => window.vela.tabs.pin(id, pinned), 'Impossible d’épingler l’onglet.')
  },

  toggleMute(id, muted) {
    void get().call(
      () => window.vela.tabs.mute(id, muted),
      'Impossible de changer le son de l’onglet.'
    )
  },

  reorderTab(id, targetId, position, pinned) {
    void get().call(
      () =>
        window.vela.tabs.reorder({
          id,
          targetId,
          position,
          ...(pinned === undefined ? {} : { pinned })
        }),
      'Onglet non déplacé.'
    )
  },

  moveTabToGroup(id, groupId) {
    void get().call(() => window.vela.tabs.reorder({ id, groupId }), 'Onglet non déplacé.')
  },

  async createGroup(tabId) {
    return get().call(
      () => window.vela.groups.create(tabId ? { tabId } : {}),
      'Impossible de créer le dossier.'
    )
  },

  async updateGroup(id, patch) {
    await get().call(() => window.vela.groups.update({ id, ...patch }), 'Dossier non modifié.')
  },

  async removeGroup(id) {
    const result = await get().call(() => window.vela.groups.remove(id), 'Dossier non supprimé.')
    if (result !== null) get().toast('Dossier supprimé, onglets conservés.')
  },

  reopen() {
    void get().call(() => window.vela.tabs.reopen(), 'Aucun onglet à rouvrir.')
  },

  splitToggle() {
    void get().call(() => window.vela.tabs.splitToggle(), 'Vue scindée indisponible.')
  },

  splitWith(id) {
    void get().call(() => window.vela.tabs.splitSet(id), 'Vue scindée indisponible.')
  },

  /** Ouvre une adresse dans un nouvel onglet, puis la place en vue scindée. */
  openSplit(url) {
    void (async () => {
      const created = await get().call(() => window.vela.tabs.create({ url }), 'Onglet non ouvert.')
      if (created) get().splitWith(created.id)
    })()
  },

  setSplitRatio(ratio) {
    set({ splitRatioLive: ratio })
  },

  commitSplitRatio(ratio) {
    set({ splitRatioLive: ratio })
    void get().call(
      () => window.vela.tabs.splitRatio(ratio),
      'Impossible d’enregistrer la largeur.'
    )
  },

  async printPage() {
    const view = get().view
    const active = view?.tabs.find((tab) => tab.id === view.activeTabId)
    if (!active || isHomeUrl(active.url)) {
      get().toast('Ouvrez une page à imprimer.', 'error')
      return
    }
    const ok = await get().call(() => window.vela.tabs.print(active.id), 'Impression impossible.')
    if (ok === false) get().toast('Impression impossible.', 'error')
  },

  async toggleBookmark(tabId) {
    const view = get().view
    if (!view) return
    const tab = view.tabs.find((item) => item.id === (tabId ?? view.activeTabId))
    if (!tab || isHomeUrl(tab.url)) {
      get().toast('Ouvrez une page pour la mettre en marque-page.', 'error')
      return
    }
    const added = await get().call(
      () => window.vela.bookmarks.toggle({ url: tab.url, title: tab.title, favicon: tab.favicon }),
      'Marque-page non enregistré.'
    )
    if (added === null) return
    get().toast(added ? 'Page ajoutée aux marque-pages.' : 'Page retirée des marque-pages.')
  },

  async removeBookmark(id) {
    await get().call(() => window.vela.bookmarks.remove(id), 'Marque-page non supprimé.')
  },

  async moveBookmark(id, position) {
    const moved = await get().call(
      () => window.vela.bookmarks.move(id, position),
      'Favori non déplacé.'
    )
    return moved === true
  },

  async reorderBookmarks(ids) {
    const applied = await get().call(
      () => window.vela.bookmarks.reorder(ids),
      'Favoris non réordonnés.'
    )
    return applied === true
  },

  async removeHistory(url) {
    await get().call(() => window.vela.history.remove(url), 'Entrée non supprimée.')
  },

  async importBookmarks(urls, entries) {
    const clean = Array.from(new Set(urls.filter((u) => /^https?:\/\//i.test(u)))).slice(0, 500)
    if (clean.length === 0) {
      get().toast('Aucune URL valide trouvée.', 'error')
      return
    }
    const titles = new Map((entries ?? []).map((entry) => [entry.url, entry.title]))
    const payload = clean.map((url) => ({ url, title: titles.get(url) ?? '' }))
    const added = await get().call(
      () => window.vela.bookmarks.addMany(payload),
      'Import des favoris impossible.'
    )
    if (added === null) return
    if (added === 0) get().toast('Ces favoris sont déjà enregistrés.')
    else get().toast(`${added} marque-page${added > 1 ? 's' : ''} importé${added > 1 ? 's' : ''}.`)
  },

  async pinEssentials(selection) {
    const view = get().view
    if (!view) return
    const existing = new Set(view.tabs.map((t) => t.url))
    const essentials =
      selection && selection.length > 0
        ? selection
        : ['https://github.com', 'https://www.notion.so']
    let pinned = 0
    for (const url of essentials) {
      if (existing.has(url)) continue
      const created = await get().call(
        () => window.vela.tabs.create({ url, pinned: true, activate: false }),
        'Épinglage impossible.'
      )
      if (created) pinned += 1
    }
    get().toast(
      pinned > 0
        ? `${pinned} page${pinned > 1 ? 's' : ''} épinglée${pinned > 1 ? 's' : ''}.`
        : 'Déjà épinglé.'
    )
  },

  async groupTabsBySite() {
    const view = get().view
    if (!view) return
    const candidates = view.tabs.filter(
      (tab) =>
        !tab.pinned &&
        !tab.groupId &&
        tab.spaceId === view.activeSpaceId &&
        /^https?:/i.test(tab.url)
    )
    const byHost = new Map<string, typeof candidates>()
    for (const tab of candidates) {
      const host = hostOf(tab.url)
      if (!host) continue
      const bucket = byHost.get(host)
      if (bucket) bucket.push(tab)
      else byHost.set(host, [tab])
    }
    const targets = Array.from(byHost)
      .filter(([, list]) => list.length >= 2)
      .slice(0, 6)
    if (targets.length === 0) {
      get().toast('Aucun groupe de deux onglets ou plus à ranger.')
      return
    }
    const groupIds: string[] = []
    for (const [site, list] of targets) {
      const group = await get().call(
        () => window.vela.groups.create({ name: site, tabId: list[0].id }),
        'Rangement impossible.'
      )
      if (!group) continue
      groupIds.push(group.id)
      for (const tab of list.slice(1)) {
        await get().call(
          () => window.vela.tabs.reorder({ id: tab.id, groupId: group.id }),
          'Onglet non rangé.'
        )
      }
    }
    if (groupIds.length === 0) return
    set({
      lastGrouping: { groupIds, tabIds: targets.flatMap(([, list]) => list.map((tab) => tab.id)) }
    })
    get().toast(
      `${groupIds.length} dossier${groupIds.length > 1 ? 's' : ''} créé${groupIds.length > 1 ? 's' : ''} par site.`,
      'info',
      { label: 'Annuler', run: () => void get().undoGrouping() }
    )
  },

  async undoGrouping() {
    const last = get().lastGrouping
    if (!last) {
      get().toast('Rien à annuler.')
      return
    }
    for (const id of last.groupIds) {
      await get().call(() => window.vela.groups.remove(id), 'Annulation impossible.')
    }
    set({ lastGrouping: null })
    get().toast('Rangement annulé, onglets conservés.')
  },

  /** Ferme les autres pages de l'espace ; épingles et accueil restent. */
  async closeOthers(id) {
    const view = get().view
    if (!view) return
    const targets = view.tabs.filter(
      (tab) =>
        tab.spaceId === view.activeSpaceId && tab.id !== id && !tab.pinned && !isHomeUrl(tab.url)
    )
    if (targets.length === 0) {
      get().toast('Aucun autre onglet à fermer.')
      return
    }
    for (const tab of targets) {
      await get().call(() => window.vela.tabs.close(tab.id), 'Onglet non fermé.')
    }
    get().toast(
      `${targets.length} onglet${targets.length > 1 ? 's' : ''} fermé${targets.length > 1 ? 's' : ''}.`
    )
  },

  async findInPage(query, forward = true) {
    const view = get().view
    const tabId = view?.activeTabId
    if (!tabId) return
    set({ findQuery: query })
    const result = await get().call(
      () => window.vela.tabs.find(tabId, query, forward),
      'Recherche dans la page impossible.'
    )
    if (result && get().view?.activeTabId === tabId && get().findQuery === query)
      set({ findResult: result })
  },

  closeFind() {
    const tabId = get().view?.activeTabId
    if (tabId) void window.vela.tabs.findStop(tabId)
    set({ findOpen: false, findQuery: '', findResult: { matches: 0, activeMatchOrdinal: 0 } })
  },

  /**
   * Zoom de la page active, avec un retour visuel bref : sans lui, ⌘+ et ⌘-
   * changeaient la page sans qu'aucun état ne le dise.
   */
  async zoom(direction) {
    const id = get().view?.activeTabId
    if (!id) return
    const level = await get().call(() => window.vela.tabs.zoom(id, direction), 'Zoom impossible.')
    if (level === null) return
    const percent = Math.round(1.2 ** level * 100)
    set({ zoomNotice: percent })
    if (zoomTimer) clearTimeout(zoomTimer)
    zoomTimer = setTimeout(() => set({ zoomNotice: null }), 1800)
  }
})
