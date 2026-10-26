/**
 * Types partagés entre le processus principal, le preload et le renderer.
 * Une seule source de vérité pour l'état persisté et l'état exposé à l'interface.
 */import type { GlassIntensity, HomeBackground, ThemeId } from './theme'

export const HOME_URL = 'vela://home'
export const APP_NAME = 'Vela'
export type Theme = 'light' | 'dark' | 'system'
export type SearchEngineId =
  | 'duckduckgo'
  | 'brave'
  | 'startpage'
  | 'google'
  | 'bing'
  | 'ecosia'
  | 'qwant'
  | 'searxng'
export type AgentMode = 'demo' | 'api'
export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'xai'
  | 'mistral'
  | 'deepseek'
  | 'groq'
  | 'cerebras'
  | 'openrouter'
  | 'local'
export type ProviderStatus = 'none' | 'stored' | 'ok' | 'error'

export interface Space {
  id: string
  name: string
  color: string
  /** Thème de couleur propre à l'espace (null → thème global). */
  theme?: ThemeId | null
  /** Partition Chromium : cookies, sessions et cache réellement isolés. */
  partition: string
  createdAt: number
}

export interface TabGroup {
  id: string
  spaceId: string
  name: string
  color: string
  collapsed: boolean
  createdAt: number
}

export interface TabState {
  id: string
  spaceId: string
  url: string
  title: string
  favicon?: string
  pinned: boolean
  groupId?: string | null
  createdAt: number
  lastActiveAt: number
}

export interface HistoryEntry {
  id: string
  url: string
  title: string
  visitedAt: number
  spaceId: string
  /** Favicon déjà chargé par la page, quand il est connu. */
  favicon?: string
}

export interface Note {
  id: string
  title: string
  body: string
  spaceId: string
  url?: string
  updatedAt: number
}

export interface NoteMeta {
  id: string
  title: string
  preview: string
  spaceId: string
  url?: string
  updatedAt: number
}

export interface ProviderSettings {
  /** Modèle demandé à ce fournisseur ; modifiable à la main. */
  model: string
  baseUrl: string
  hasKey: boolean
  status: ProviderStatus
  /** Message du dernier test de clé, succès ou échec. */
  detail?: string
}

export interface AgentSettings {
  mode: AgentMode
  /** Fournisseur utilisé quand le mode connecté est actif. */
  provider: ProviderId
  providers: Record<ProviderId, ProviderSettings>
}

export interface Settings {
  theme: Theme
  searchEngine: SearchEngineId
  /** Instance SearXNG choisie (vide → searx.be). */
  searxInstance: string
  /** Thème de couleur du châssis (indigo, rouge, custom…). */
  themeId: ThemeId
  /** Teinte utilisée quand themeId vaut « custom ». */
  customAccent: string
  /** Teinte et transparence du verre dépoli. */
  glass: GlassIntensity
  /** Arrière-plan de la page d'accueil. */
  homeBackground: HomeBackground
  /** Image locale de l'accueil (chemin disque, jamais transmis aux sites). */
  homeImage: string | null
  /** Flou appliqué à l'image d'accueil, en pixels. */
  homeBlur: number
  /** Bordures renforcées, transparences supprimées. */
  highContrast: boolean
  /** Clair le jour, sombre le soir, quel que soit le mode choisi. */
  hourTheme: boolean
  /** Chaque espace peut porter son propre thème. */
  perSpaceThemes: boolean
  blockTrackers: boolean
  sidebarCollapsed: boolean
  onboarded: boolean
  agent: AgentSettings
}

export interface Bookmark {
  id: string
  url: string
  title: string
  createdAt: number
  favicon?: string
}

/** Favoris trouvés dans un navigateur installé, prêts à être importés. */
export interface BookmarkImportSource {
  id: string
  label: string
  count: number
  urls: { title: string; url: string }[]
}

export interface ClosedTab {
  spaceId: string
  url: string
  title: string
  pinned: boolean
  groupId?: string | null
}

export interface Task {
  id: string
  title: string
  done: boolean
  createdAt: number
  dueAt: number | null
}

/**
 * Ce que l'interface reçoit pour chaque travail : tout sauf le rapport.
 * Le texte complet est demandé à l'ouverture (`works.get`) pour ne pas
 * transporter des dizaines de rapports dans chaque message d'état.
 */
export interface WorkSummary {
  id: string
  title: string
  /** Première phrase de prose du rapport, calculée côté processus principal. */
  preview: string
  mode: AgentMode
  /** Nombre de sources jointes : la liste elle-même n'est utile qu'à l'ouverture. */
  sourceCount: number
  spaceId: string
  createdAt: number
  updatedAt: number
  archived: boolean
}

/** Un travail de l'atelier : une demande, ses sources et le rapport produit. */
export interface WorkItem extends Omit<WorkSummary, 'sourceCount'> {
  prompt: string
  sources: { title: string; url: string }[]
  markdown: string
}

export interface DownloadItem {
  id: string
  name: string
  url: string
  state: 'progress' | 'done' | 'cancelled'
  received: number
  total: number
  path: string | null
  startedAt: number
}

export interface ProcessInfo {
  tabId: string | null
  title: string
  url: string
  live: boolean
  blocked: number
  type: 'tab' | 'app'
}

export interface PersistedState {
  version: 1
  spaces: Space[]
  tabs: TabState[]
  groups: TabGroup[]
  activeSpaceId: string
  activeTabBySpace: Record<string, string>
  secondTabBySpace: Record<string, string | null>
  split: boolean
  splitRatio: number
  settings: Settings
  history: HistoryEntry[]
  closed: ClosedTab[]
  bookmarks: Bookmark[]
  /** Sites où le bloqueur est désactivé volontairement. */
  privacyExemptions: string[]
  tasks: Task[]
  works: WorkItem[]
  tunnelMaps: import('./tunnel').TunnelMap[]
}

export interface TabView extends TabState {
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  /** Requêtes bloquées par le filtre local pour cet onglet. */
  blocked: number
  /** La page a été envoyée au fournisseur de modèle lors de la dernière exécution. */
  agentSent: boolean
  error: string | null
  /** Vue détruite pour libérer la mémoire ; la page se recharge à l’activation. */
  asleep: boolean
  /** Hôtes effectivement bloqués sur cette page (les plus fréquents d’abord). */
  blockedHosts: { host: string; count: number }[]
}

export interface BriefItem {
  kind: 'resume' | 'finish' | 'focus' | 'start'
  label: string
  title: string
  detail: string
  url?: string
  tabId?: string
}

export interface Brief {
  items: BriefItem[]
  pages: number
  sites: number
  blocked: number
  dateLabel: string
}

export interface AppView {
  spaces: Space[]
  tabs: TabView[]
  groups: TabGroup[]
  activeSpaceId: string
  activeTabId: string
  secondTabId: string | null
  split: boolean
  splitRatio: number
  settings: Settings
  history: HistoryEntry[]
  bookmarks: Bookmark[]
  privacyExemptions: string[]
  /** Mémoire rendue par les onglets mis en veille depuis le lancement (Mo). */
  memoryFreed: number
  tunnelMaps: import('./tunnel').TunnelMapSummary[]
  notes: NoteMeta[]
  tasks: Task[]
  works: WorkSummary[]
  downloads: DownloadItem[]
  brief: Brief
  blockedTotal: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface PaneRect extends Rect {
  tabId: string
}

export interface AgentSource {
  tabId?: string
  title: string
  url: string
  /** Texte extrait de la page au moment du lancement (mode API uniquement). */
  excerpt?: string
  /** Ancre textuelle du passage précis, comme texte sélectionnable dans l’URL. */
  anchor?: string
}

export interface AgentRunRequest {
  prompt: string
  sources: AgentSource[]
  spaceId: string
}

export interface AgentCitationSource {
  title: string
  url: string
  anchor?: string
}

export type AgentEvent =
  | { runId: string; type: 'plan'; title: string; steps: string[]; mode: AgentMode; sources?: AgentCitationSource[] }
  | { runId: string; type: 'step'; index: number; state: 'active' | 'done' }
  | { runId: string; type: 'delta'; text: string }
  | { runId: string; type: 'done' }
  | { runId: string; type: 'cancelled' }
  | { runId: string; type: 'error'; message: string }

export type ShortcutAction =
  | 'command'
  | 'address'
  | 'new-tab'
  | 'close-tab'
  | 'reopen-tab'
  | 'split'
  | 'notes'
  | 'agent'
  | 'work'
  | 'brief'
  | 'settings'
  | 'sidebar'
  | 'reload'
  | 'back'
  | 'forward'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'find'
  | 'find-next'
  | 'find-prev'
  | 'bookmark'
  | 'bookmarks'
  | 'history'
  | 'print'
  | 'home'
  | 'tab-select'
  | 'escape'

export interface ShortcutEvent {
  action: ShortcutAction
  digit?: number
}

export type SelectionAction = 'summarize' | 'explain' | 'translate' | 'simplify' | 'note'

/** Sélection de texte envoyée par le menu contextuel d’une page. */
export interface SelectionPayload {
  action: SelectionAction
  text: string
  url: string
  title: string
  tabId: string
}

export interface LayoutRequest {
  panes: PaneRect[]
  overlay: boolean
}
