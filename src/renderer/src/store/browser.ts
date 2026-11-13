import { create } from 'zustand'
import type { SettingsPatch } from '@shared/api'
import {
  AUTO_COLLAPSE_WIDTH,
  DRAWER_AUTO_COLLAPSE_WIDTH,
  SPLIT_MIN_WIDTH,
  panesCanSplit
} from '@shared/layout'
import type { AppView, ProviderId, ShortcutEvent } from '@shared/types'
import { updateReadyMessage } from '@shared/update'
import { createAgentSlice, type AgentSlice } from './slices/agent'
import { createNotesSlice, type NotesSlice } from './slices/notes'
import { createPrivacySlice, type PrivacySlice } from './slices/privacy'
import { createSpacesSlice, type SpacesSlice } from './slices/spaces'
import { createTabsSlice, type TabsSlice } from './slices/tabs'
import { createUpdatesSlice, type UpdatesSlice } from './slices/updates'
import { captureTrigger } from './trigger'
import type { Overlay, Toast } from './types'

export type { AgentStep, AgentUi, Overlay, Toast, WorkMode } from './types'

/**
 * Références stables entre deux diffusions d'état.
 *
 * L'état traverse l'IPC : chaque diffusion recrée tous les objets, donc un
 * composant abonné à `settings`, `bookmarks` ou `spaces` se redessinait même
 * quand rien de ce qu'il affiche n'avait changé (une page qui charge produit
 * plusieurs diffusions par seconde). On garde la référence précédente des
 * parties identiques, et React s'arrête là.
 *
 * Le même objet `view` est rendu quand **aucune** partie n'a changé : sans
 * cela, les vingt-cinq sélecteurs `state => state.view` (barre latérale,
 * espace de travail, barre d'adresse, accueil…) se redessinaient à chaque
 * diffusion — y compris celles qui ne portaient aucune différence — avec tout
 * leur sous-arbre (onglets, favoris, cartes d'historique).
 *
 * Le coût de la comparaison est borné : une partie identique par référence
 * n'est jamais sérialisée, et seules les parties qui ont réellement bougé
 * passent par `JSON.stringify`.
 */
let previousView: AppView | null = null
let previousPrints = new Map<string, string>()

function stableView(next: AppView): AppView {
  if (!previousView) {
    previousView = next
    previousPrints = new Map(
      Object.keys(next).map((key) => [key, JSON.stringify(next[key as keyof AppView])])
    )
    return next
  }
  const previous = previousView
  // La boucle reconstruit l'objet à partir des clés de `next` : une partie
  // apparue est prise telle quelle, une partie retirée disparaît d'elle-même.
  const keys = Object.keys(next) as (keyof AppView)[]
  const merged: Record<string, unknown> = {}
  const prints = new Map<string, string>()
  let changed = false
  for (const key of keys) {
    const value = next[key]
    const old = previous[key]
    // Même référence : rien à comparer, rien à sérialiser.
    if (value === old) {
      merged[key] = old
      const print = previousPrints.get(key)
      if (print !== undefined) prints.set(key, print)
      continue
    }
    // Référence différente : on ne sérialise que cette partie.
    const print = JSON.stringify(value)
    prints.set(key, print)
    if (previousPrints.get(key) === print) merged[key] = old
    else {
      merged[key] = value
      changed = true
    }
  }
  // Aucune partie n'a changé : on rend l'objet précédent, React s'arrête là.
  if (!changed) return previous
  const view = merged as unknown as AppView
  previousView = view
  previousPrints = prints
  return view
}

/** Sortie d'un toast : `--dur-2` dans la feuille, plus une image de marge. */
const TOAST_EXIT_MS = 180

function cleanError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback
  return (
    error.message
      .replace(/^Error invoking remote method '[^']+':\s*/, '')
      .replace(/^Error:\s*/, '')
      .trim() || fallback
  )
}

/**
 * Abonnements IPC de la coque. Le preload renvoie un désabonnement pour
 * chacun : les garder permet de les retirer au démontage (HMR, tests) au lieu
 * d'empiler un écouteur de plus à chaque remontage.
 */
let appDisposers: (() => void)[] = []
let subscriptionsDisposed = false

function track(unsubscribe: (() => void) | void): void {
  // Un pont de test ou une version antérieure du preload peut ne rien rendre.
  if (typeof unsubscribe !== 'function') return
  // Un démontage survenu pendant l'initialisation asynchrone : on retire tout
  // de suite, sinon l'écouteur survivrait à la surface qui l'a demandé.
  if (subscriptionsDisposed) unsubscribe()
  else appDisposers.push(unsubscribe)
}

/** Coque de l'application : chargement, pont, toasts et raccourcis. */
export interface CoreSlice {
  initialized: boolean
  ready: boolean
  view: AppView | null
  overlay: Overlay
  /**
   * Élément qui avait le focus quand le panneau s'est ouvert. Le fond passe
   * en `inert`, ce qui floute le déclencheur avant que la feuille ne monte :
   * sans cette copie, la fermeture rendait le focus au `body`.
   */
  overlayTrigger: HTMLElement | null
  /**
   * Menus flottants ouverts (clic droit, touche Menu). Les vues natives des
   * pages passent au-dessus du HTML : elles quittent la scène tant qu'un menu
   * est affiché, sinon elles en recouvrent la moitié droite.
   */
  menuOpen: number
  /** Hauteur réservée sous la page pour la pilule flottante (0 = aucune). */
  /**
   * Coup d'œil ouvert : sa carte est du DOM alors que la page est une vue
   * native, toujours au-dessus. Les onglets doivent donc quitter la scène.
   */
  peekOpen: boolean
  toasts: Toast[]
  /** Largeur de la coque, suivie au redimensionnement. */
  viewportWidth: number
  /** Largeur du conteneur des volets, mesurée (0 avant le premier rendu). */
  panesWidth: number
  /** Deux volets de 320 px tiennent-ils dans `panesWidth` ? */
  panesFit: boolean
  /** Fenêtre étroite : barre latérale repliée automatiquement. */
  compactViewport: boolean
  /** Fenêtre assez large **et** volets assez larges pour une vue scindée. */
  splitAllowed: boolean
  /** Valeur persistée avant le repli automatique, à restaurer en s'élargissant. */
  sidebarAutoValue: boolean | null
  /** L'utilisateur a repris la main sur la barre latérale en fenêtre étroite. */
  sidebarOverride: boolean
  syncViewport(width: number): void
  /** Mesure des volets : un tiroir ouvert retire de la place sans `resize`. */
  syncPanesWidth(width: number): void
  /** Repli/dépli explicite : annule la restauration automatique. */
  toggleSidebar(): void
  init(): Promise<void>
  /** Retire les abonnements IPC posés par `init` (démontage, HMR, tests). */
  disposeSubscriptions(): void
  call<T>(task: () => Promise<T>, fallback: string): Promise<T | null>
  toast(text: string, tone?: Toast['tone'], action?: Toast['action'], duration?: number): void
  dismissToast(id: string): void
  setOverlay(overlay: Overlay): void
  setPeekOpen(open: boolean): void
  beginMenu(): void
  endMenu(): void
  focusAddress(): void
  updateSettings(patch: SettingsPatch): Promise<void>
  /** Oublie le zoom mémorisé d'un domaine. */
  forgetZoom(host: string): Promise<void>
  setKey(provider: ProviderId, key: string | null): Promise<boolean>
  testKey(provider: ProviderId): Promise<{ ok: boolean; message: string }>
  completeOnboarding(): Promise<void>
  handleShortcut(event: ShortcutEvent): void
}

export interface BrowserState
  extends CoreSlice, TabsSlice, SpacesSlice, NotesSlice, PrivacySlice, AgentSlice, UpdatesSlice {}

export const useBrowser = create<BrowserState>((set, get, api) => ({
  ...createCoreSlice(set, get, api),
  ...createTabsSlice(set, get, api),
  ...createSpacesSlice(set, get, api),
  ...createNotesSlice(set, get, api),
  ...createPrivacySlice(set, get, api),
  ...createAgentSlice(set, get, api),
  ...createUpdatesSlice(set, get, api)
}))

function createCoreSlice(
  set: (partial: Partial<BrowserState> | ((state: BrowserState) => Partial<BrowserState>)) => void,
  get: () => BrowserState,
  _api: unknown
): CoreSlice {
  return {
    initialized: false,
    ready: false,
    view: null,
    overlay: null,
    overlayTrigger: null,
    menuOpen: 0,
    peekOpen: false,
    toasts: [],
    viewportWidth: Number.POSITIVE_INFINITY,
    panesWidth: 0,
    panesFit: true,
    compactViewport: false,
    splitAllowed: true,
    sidebarAutoValue: null,
    sidebarOverride: false,

    syncViewport(width) {
      const previous = get()
      const drawerOpen = previous.notesOpen || previous.agentOpen
      const compact =
        width < AUTO_COLLAPSE_WIDTH ||
        (drawerOpen && width < DRAWER_AUTO_COLLAPSE_WIDTH)
      set({
        viewportWidth: width,
        compactViewport: compact,
        // La fenêtre a une largeur minimale, mais un tiroir ouvert ne la fait
        // pas bouger : la mesure des volets reste la seconde condition.
        splitAllowed: width >= SPLIT_MIN_WIDTH && panesCanSplit(previous.panesWidth)
      })
      if (!compact) {
        // La place revient : on remet la barre là où l'utilisateur l'avait
        // laissée, sauf s'il a choisi autrement pendant la phase étroite.
        if (previous.sidebarOverride) set({ sidebarOverride: false })
        if (previous.sidebarAutoValue === null) return
        set({ sidebarAutoValue: null })
        const view = get().view
        // Toujours réécrire la valeur mémorisée : le repli automatique a pu
        // partir par IPC et revenir après ce passage, auquel cas l'état local
        // dit encore « dépliée » et un test d'égalité laisserait la barre
        // repliée définitivement.
        if (view) void get().updateSettings({ sidebarCollapsed: previous.sidebarAutoValue })
        return
      }
      const view = get().view
      if (!view) return
      // Un repli automatique déjà en cours, une barre déjà repliée ou un choix
      // explicite : rien à écrire. On n'insiste donc pas à chaque pixel.
      if (
        previous.sidebarOverride ||
        previous.sidebarAutoValue !== null ||
        view.settings.sidebarCollapsed
      ) {
        return
      }
      set({ sidebarAutoValue: view.settings.sidebarCollapsed })
      void get().updateSettings({ sidebarCollapsed: true })
    },

    syncPanesWidth(width) {
      const measured = Math.round(width)
      const previous = get()
      if (Math.abs(previous.panesWidth - measured) < 1) return
      const fits = panesCanSplit(measured)
      set({
        panesWidth: measured,
        panesFit: fits,
        splitAllowed: previous.viewportWidth >= SPLIT_MIN_WIDTH && fits
      })
    },

    toggleSidebar() {
      const view = get().view
      if (!view) return
      // Un choix explicite en fenêtre étroite vaut pour toute la phase étroite :
      // on oublie l'état mémorisé, sinon le prochain élargissement le remettrait.
      if (get().compactViewport) set({ sidebarAutoValue: null, sidebarOverride: true })
      void get().updateSettings({ sidebarCollapsed: !view.settings.sidebarCollapsed })
    },

    async init() {
      if (get().initialized) return
      set({ initialized: true })
      subscriptionsDisposed = false
      if (!window.vela) {
        get().toast('Le pont Vela est indisponible.', 'error')
        return
      }
      try {
        const view = await window.vela.view()
        set({ view: stableView(view), ready: true })
      } catch (error) {
        get().toast(cleanError(error, 'Impossible de charger Vela.'), 'error')
      }
      track(
        window.vela.onState((incoming) =>
          set((state) => ({
            view: stableView(incoming),
            splitRatioLive:
              state.splitRatioLive !== null &&
              Math.abs(incoming.splitRatio - state.splitRatioLive) < 0.002
                ? null
                : state.splitRatioLive
          }))
        )
      )
      track(window.vela.onShortcut((event) => get().handleShortcut(event)))
      track(window.vela.agent.onEvent((event) => get().handleAgentEvent(event)))
      track(window.vela.selection.onSelect((payload) => get().handleSelection(payload)))
      try {
        const status = await window.vela.updates.status()
        set({ update: status })
      } catch {
        /* mises à jour indisponibles en dev */
      }
      track(
        window.vela.updates.onEvent((info) => {
          set({ update: info })
          // Silencieux pendant la préparation : la barre d'état suit la progression.
          if (info.state === 'downloaded') {
            get().toast(updateReadyMessage(info, window.vela.platform))
          } else if (info.state === 'error' && info.message) {
            get().toast(info.message, 'error')
          }
        })
      )
    },

    disposeSubscriptions() {
      subscriptionsDisposed = true
      for (const unsubscribe of appDisposers) unsubscribe()
      appDisposers = []
      // Un remontage (HMR, test) doit pouvoir réinitialiser le pont.
      set({ initialized: false })
    },

    async call(task, fallback) {
      try {
        return await task()
      } catch (error) {
        get().toast(cleanError(error, fallback), 'error')
        return null
      }
    },

    toast(text, tone = 'info', action, duration) {
      const id = crypto.randomUUID()
      set((state) => ({ toasts: [...state.toasts, { id, text, tone, action }].slice(-3) }))
      setTimeout(() => get().dismissToast(id), duration ?? (action ? 7000 : 4200))
    },

    dismissToast(id) {
      // La pastille s'efface avant de quitter la liste : sinon un toast
      // s'évanouissait entre deux images, sans qu'on sache si l'action avait
      // bien été prise en compte.
      set((state) => ({
        toasts: state.toasts.map((item) => (item.id === id ? { ...item, leaving: true } : item))
      }))
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }))
      }, TOAST_EXIT_MS)
    },

    setOverlay(overlay) {
      set({
        overlay,
        // Capturé avant que le fond ne devienne `inert` : à ce moment le bouton
        // déclencheur a encore le focus, une image plus tard il l'a perdu.
        overlayTrigger: overlay ? captureTrigger(get().overlayTrigger) : null,
        spaceEditId: overlay === 'space' ? get().spaceEditId : null
      })
    },

    setPeekOpen(open) {
      set({ peekOpen: open })
    },

    // Un compteur : un sous-menu peut s'ouvrir par-dessus le menu principal sans
    // que l'on rende la page avant la fermeture du dernier.
    beginMenu() {
      set((state) => ({ menuOpen: state.menuOpen + 1 }))
    },

    endMenu() {
      set((state) => ({ menuOpen: Math.max(0, state.menuOpen - 1) }))
    },

    focusAddress() {
      setTimeout(() => {
        // Le premier champ est celui du panneau principal ; la classe
        // `.pane-primary` n'a jamais existé, donc ⌘L ne focalisait rien.
        const input =
          document.querySelector<HTMLInputElement>(
            '.pane-head[data-primary="true"] .address-input'
          ) ?? document.querySelector<HTMLInputElement>('.address-input')
        input?.focus()
        input?.select()
      }, 20)
    },

    async updateSettings(patch) {
      await get().call(() => window.vela.settings.update(patch), 'Réglages non enregistrés.')
    },

    async forgetZoom(host) {
      const removed = await get().call(
        () => window.vela.settings.forgetZoom(host),
        'Zoom non oublié.'
      )
      if (removed) get().toast(`Zoom oublié pour ${host}.`)
    },

    async setKey(provider, key) {
      const result = await get().call(
        () => window.vela.settings.setKey({ provider, key }),
        'Clé non enregistrée.'
      )
      if (result) get().toast(key ? 'Clé chiffrée dans le trousseau système.' : 'Clé supprimée.')
      return Boolean(result)
    },

    async testKey(provider) {
      const result = await get().call(
        () => window.vela.settings.testKey(provider),
        'Test impossible pour le moment.'
      )
      return result ?? { ok: false, message: 'Test impossible pour le moment.' }
    },

    async completeOnboarding() {
      await get().call(
        () => window.vela.settings.update({ onboarded: true }),
        'Onboarding non enregistré.'
      )
    },

    handleShortcut(event) {
      const state = get()
      const view = state.view
      if (!view) return
      const active = view.tabs.find((tab) => tab.id === view.activeTabId)
      const spaceTabs = view.tabs.filter((tab) => tab.spaceId === view.activeSpaceId)

      switch (event.action) {
        case 'command':
          state.setOverlay(state.overlay === 'command' ? null : 'command')
          break
        case 'address':
          state.setOverlay(null)
          setTimeout(() => state.focusAddress(), 20)
          break
        case 'new-tab':
          state.newTab()
          break
        case 'peek':
          // Coup d'œil : une carte dans la fenêtre, sans nouvel onglet.
          void window.vela.peek.open({}).catch(() => undefined)
          break
        case 'close-tab':
          if (active) state.closeTab(active.id)
          break
        case 'reopen-tab':
          state.reopen()
          break
        case 'split':
          state.splitToggle()
          break
        case 'notes':
          state.toggleNotes()
          break
        case 'notes-search':
          state.requestNotesSearch()
          break
        case 'notes-search-next':
          // La recherche dans la page garde la priorité quand elle est ouverte.
          if (state.findOpen) {
            if (state.findQuery) void state.findInPage(state.findQuery, true)
            break
          }
          if (state.notesOpen) state.requestNotesSearch('next')
          break
        case 'agent':
          state.toggleAgent()
          break
        case 'work':
          state.setWorkMode(state.workMode === 'work' ? 'browse' : 'work')
          break
        case 'sessions':
          state.setOverlay(state.overlay === 'sessions' ? null : 'sessions')
          break
        case 'settings':
          // L'assistant de premier lancement est la seule surface tant qu'il
          // est ouvert : le menu natif ne doit pas poser les Réglages par-dessus
          // (le rail, lui, est déjà inerte). L'assistant ouvre les Réglages
          // lui-même après `completeOnboarding`, sans passer par ici.
          if (view.settings.onboarded === false) break
          state.setOverlay(state.overlay === 'settings' ? null : 'settings')
          break
        case 'sidebar':
          state.toggleSidebar()
          break
        case 'reload':
          if (active) state.reload(active.id)
          break
        case 'zoom-in':
          if (active) void state.zoom('in')
          break
        case 'zoom-out':
          if (active) void state.zoom('out')
          break
        case 'zoom-reset':
          if (active) void state.zoom('reset')
          break
        case 'back':
          if (active) state.back(active.id)
          break
        case 'forward':
          if (active) state.forward(active.id)
          break
        case 'bookmark':
          void state.toggleBookmark(active?.id)
          break
        case 'copy-address':
          if (active && /^https?:/i.test(active.url)) {
            void navigator.clipboard
              .writeText(active.url)
              .then(() => state.toast('Adresse copiée.'))
              .catch(() => state.toast('Copie impossible.', 'error'))
          }
          break
        case 'duplicate-tab':
          if (active && /^https?:/i.test(active.url)) state.newTab(active.url)
          break
        case 'sleep-tab':
          if (active && !active.asleep && /^https?:/i.test(active.url)) state.sleep(active.id)
          break
        case 'unpin-tab':
          if (active?.pinned) state.pin(active.id, false)
          break
        case 'bookmarks':
          state.setOverlay(state.overlay === 'bookmarks' ? null : 'bookmarks')
          break
        case 'shield':
          state.setOverlay(state.overlay === 'shield' ? null : 'shield')
          break
        case 'history':
          state.setOverlay(state.overlay === 'history' ? null : 'history')
          break
        case 'print':
          void state.printPage()
          break
        case 'home':
          if (active) void window.vela.tabs.home(active.id)
          break
        case 'find':
          set({ findOpen: true })
          break
        case 'find-next':
          if (state.findQuery) void state.findInPage(state.findQuery, true)
          break
        case 'find-prev':
          if (state.findQuery) void state.findInPage(state.findQuery, false)
          break
        case 'tab-select': {
          const target = spaceTabs[(event.digit ?? 1) - 1]
          if (target) state.selectTab(target.id)
          break
        }
        case 'next-tab':
        case 'prev-tab': {
          if (spaceTabs.length < 2) break
          const index = spaceTabs.findIndex((tab) => tab.id === view.activeTabId)
          const step = event.action === 'next-tab' ? 1 : -1
          const target = spaceTabs[(index + step + spaceTabs.length) % spaceTabs.length]
          if (target) state.selectTab(target.id)
          break
        }
        case 'escape':
          if (state.findOpen) state.closeFind()
          else if (state.overlay) state.setOverlay(null)
          else if (state.notesOpen) state.toggleNotes(false)
          else if (state.agentOpen) state.toggleAgent(false)
          break
        default:
          break
      }
    }
  }
}
