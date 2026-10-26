import type { MapNode, TunnelMap, TunnelMapSummary } from './tunnel'
import type {
  AgentEvent,
  AgentMode,
  AgentRunRequest,
  AppView,
  BookmarkImportSource,
  HistoryEntry,
  LayoutRequest,
  Note,
  PageHighlight,
  ProviderId,
  SelectionPayload,
  Settings,
  ShortcutEvent,
  TabGroup,
  TabState
} from './types'

export interface CreateTabInput {
  spaceId?: string
  url?: string
  activate?: boolean
  pinned?: boolean
  groupId?: string
}

export interface ReorderTabsInput {
  id: string
  targetId?: string | null
  position?: 'before' | 'after'
  groupId?: string | null
}

export interface CreateGroupInput {
  name?: string
  color?: string
  tabId?: string
}

export interface UpdateGroupInput {
  id: string
  name?: string
  color?: string
  collapsed?: boolean
}

export interface CreateSpaceInput {
  name: string
  color: string
  avatar?: string | null
  background?: import('./space').SpaceBackground
  shortcuts?: import('./space').SpaceShortcut[]
  blockTrackers?: boolean
  theme?: string | null
}

export interface UpdateSpaceInput {
  id: string
  name?: string
  color?: string
  theme?: string | null
  avatar?: string | null
  background?: import('./space').SpaceBackground
  shortcuts?: import('./space').SpaceShortcut[]
  blockTrackers?: boolean
}

export interface SaveNoteInput {
  id?: string
  title: string
  body: string
  spaceId?: string
  url?: string
  tags?: string[]
  pinned?: boolean
}

export type NoteAiAction = 'generate' | 'reformulate' | 'summarize' | 'translate' | 'correct' | 'beautify'

export interface NoteAiInput {
  action: NoteAiAction
  body?: string
  title?: string
  url?: string
}

export interface NoteAiResult {
  text: string
  /** api = modèle configuré ; demo = repli local clairement étiqueté. */
  mode: 'api' | 'demo'
}

export interface ProviderPatch {
  model?: string
  baseUrl?: string
}

export interface SettingsPatch {
  theme?: Settings['theme']
  searchEngine?: Settings['searchEngine']
  searxInstance?: string
  themeId?: Settings['themeId']
  customAccent?: string
  glass?: Settings['glass']
  homeBackground?: Settings['homeBackground']
  homeImage?: string | null
  homeBlur?: number
  highContrast?: boolean
  hourTheme?: boolean
  perSpaceThemes?: boolean
  blockTrackers?: boolean
  sidebarCollapsed?: boolean
  onboarded?: boolean
  agent?: { mode?: AgentMode; provider?: ProviderId }
  providers?: Partial<Record<ProviderId, ProviderPatch>>
}

export interface SetKeyInput {
  provider: ProviderId
  key: string | null
}

export interface KeyTestResult {
  ok: boolean
  message: string
}

export interface TunnelRunInput {
  query: string
  spaceId?: string
  /** Relance ciblée depuis un nœud existant. */
  parentId?: string
  mapId?: string
}

export type TunnelEvent =
  | {
      runId: string
      type: 'start'
      mapId: string
      query: string
      suggestedQuery: string | null
      privacy: 'local-analysis'
    }
  | { runId: string; type: 'node'; node: MapNode }
  | { runId: string; type: 'phase'; message: string }
  | { runId: string; type: 'done'; mapId: string; summary: TunnelMapSummary; sources: number; nodes: number }
  | { runId: string; type: 'error'; message: string }

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'not-available'
  | 'error'

export interface UpdateInfo {
  state: UpdateState
  version: string | null
  currentVersion: string
  progress: number
  message: string | null
  releaseUrl: string
}

/** API exposée à la fenêtre par le preload. Aucun accès Node dans le renderer. */
export interface ComicRunResult {
  ok: boolean
  reason?: string
}

export interface VelaApi {
  platform: string
  view(): Promise<AppView>
  spaces: {
    create(input: CreateSpaceInput): Promise<void>
    update(input: UpdateSpaceInput): Promise<void>
    remove(id: string): Promise<void>
    activate(id: string): Promise<void>
  }
  tabs: {
    create(input?: CreateTabInput): Promise<TabState>
    find(id: string, query: string, forward?: boolean): Promise<{ matches: number; activeMatchOrdinal: number }>
    findStop(id: string, action?: 'clearSelection' | 'keepSelection'): Promise<void>
    close(id: string): Promise<void>
    activate(id: string): Promise<void>
    navigate(id: string, input: string): Promise<void>
    home(id: string): Promise<void>
    back(id: string): Promise<void>
    forward(id: string): Promise<void>
    reload(id: string): Promise<void>
    zoom(id: string, direction: 'in' | 'out' | 'reset'): Promise<void>
    stop(id: string): Promise<void>
    pin(id: string, pinned: boolean): Promise<void>
    reopen(): Promise<void>
    splitToggle(): Promise<void>
    splitSet(id: string): Promise<void>
    splitRatio(ratio: number): Promise<void>
    focus(id: string): Promise<void>
    discard(id: string): Promise<void>
    reorder(input: ReorderTabsInput): Promise<void>
    print(id: string): Promise<boolean>
  }
  groups: {
    create(input?: CreateGroupInput): Promise<TabGroup>
    update(input: UpdateGroupInput): Promise<void>
    remove(id: string): Promise<void>
  }
  views: {
    layout(request: LayoutRequest): void
  }
  history: {
    list(): Promise<HistoryEntry[]>
    remove(url: string): Promise<void>
    clear(): Promise<void>
  }
  bookmarks: {
    /** Ajoute la page aux favoris, ou l'en retire : renvoie l'état final. */
    toggle(input: { url: string; title?: string; favicon?: string }): Promise<boolean>
    remove(id: string): Promise<void>
    /** Favoris des navigateurs installés (lecture locale, rien n'est modifié). */
    detect(): Promise<BookmarkImportSource[]>
    /** Import en masse ; renvoie le nombre réellement ajouté. */
    addMany(entries: { url: string; title?: string }[]): Promise<number>
  }
  tasks: {
    create(input: { title: string; dueAt?: number | null }): Promise<import('./types').Task>
    toggle(id: string): Promise<void>
    remove(id: string): Promise<void>
  }
  works: {
    /** Rapport complet, chargé seulement à l'ouverture. */
    get(id: string): Promise<import('./types').WorkItem | null>
    rename(input: { id: string; title: string }): Promise<void>
    archive(input: { id: string; archived: boolean }): Promise<void>
  }
  notes: {
    get(id: string): Promise<Note | null>
    save(input: SaveNoteInput): Promise<Note>
    /** Change le titre, les étiquettes ou l'épinglage sans réécrire le corps. */
    patch(input: { id: string; title?: string; pinned?: boolean; tags?: string[] }): Promise<Note | null>
    remove(id: string): Promise<void>
    openFolder(): Promise<void>
    /** Capture la sélection de la page active avec sa source et la date. */
    captureSelection(): Promise<Note | null>
    /** Surligne la sélection et l'ajoute à la note de la page. */
    highlight(): Promise<Note | null>
    /** Surlignages enregistrés pour la page active. */
    highlights(): Promise<PageHighlight[]>
    /** Génère ou réécrit une note avec le modèle configuré. */
    ai(input: NoteAiInput): Promise<NoteAiResult>
  }
  privacy: {
    /** Désactive ou réactive le bloqueur pour un site ; true = exempté. */
    toggleSite(host: string): Promise<boolean>
  }
  tunnel: {
    run(input: TunnelRunInput): Promise<{ runId: string }>
    cancel(runId: string): void
    onEvent(callback: (event: TunnelEvent) => void): () => void
    maps(): Promise<TunnelMapSummary[]>
    load(id: string): Promise<TunnelMap | null>
    save(map: TunnelMap): Promise<void>
    rename(input: { id: string; title: string }): Promise<void>
    remove(id: string): Promise<void>
    duplicate(id: string): Promise<TunnelMap | null>
    savePng(input: { dataUrl: string; name: string }): Promise<string | null>
    exportPdf(input: { html: string; name: string }): Promise<boolean>
  }
  selection: {
    onSelect(callback: (payload: SelectionPayload) => void): () => void
  }
  agent: {
    run(input: AgentRunRequest): Promise<{ runId: string }>
    cancel(runId?: string): void
    onEvent(callback: (event: AgentEvent) => void): () => void
  }
  comic: {
    /** Injecte la traduction de BD dans l'onglet, avec sa propre session. */
    run(tabId: string): Promise<ComicRunResult>
    clear(tabId: string): Promise<void>
  }
  settings: {
    update(patch: SettingsPatch): Promise<void>
    setKey(input: SetKeyInput): Promise<boolean>
    testKey(provider: ProviderId): Promise<KeyTestResult>
  }
  appearance: {
    /** Ouvre un sélecteur d'image ; le chemin est enregistré dans les réglages. */
    pickImage(): Promise<{ path: string; dataUrl: string } | null>
    /** Relit l'image d'accueil enregistrée (null si aucune). */
    image(): Promise<string | null>
    clearImage(): Promise<void>
  }
  downloads: {
    list(): Promise<import('./types').DownloadItem[]>
    preview(id: string): Promise<boolean>
    open(id: string): Promise<void>
    clear(): Promise<void>
  }
  updates: {
    status(): Promise<UpdateInfo>
    check(): Promise<UpdateInfo>
    download(): Promise<UpdateInfo>
    install(): Promise<void>
    releases(): Promise<void>
    onEvent(callback: (info: UpdateInfo) => void): () => void
  }
  processes(): Promise<{ live: number; processes: import('./types').ProcessInfo[] }>
  onState(callback: (view: AppView) => void): () => void
  onShortcut(callback: (event: ShortcutEvent) => void): () => void
}
