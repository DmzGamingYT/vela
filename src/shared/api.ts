import type {
  AgentEvent,
  AgentMode,
  AgentRunRequest,
  AppView,
  LayoutRequest,
  Note,
  ProviderId,
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
}

export interface SaveNoteInput {
  id?: string
  title: string
  body: string
  spaceId?: string
  url?: string
}

export interface ProviderPatch {
  model?: string
  baseUrl?: string
}

export interface SettingsPatch {
  theme?: Settings['theme']
  searchEngine?: Settings['searchEngine']
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

/** API exposée à la fenêtre par le preload. Aucun accès Node dans le renderer. */
export interface VelaApi {
  platform: string
  view(): Promise<AppView>
  spaces: {
    create(input: CreateSpaceInput): Promise<void>
    update(input: { id: string; name?: string; color?: string }): Promise<void>
    remove(id: string): Promise<void>
    activate(id: string): Promise<void>
  }
  tabs: {
    create(input?: CreateTabInput): Promise<TabState>
    close(id: string): Promise<void>
    activate(id: string): Promise<void>
    navigate(id: string, input: string): Promise<void>
    home(id: string): Promise<void>
    back(id: string): Promise<void>
    forward(id: string): Promise<void>
    reload(id: string): Promise<void>
    stop(id: string): Promise<void>
    pin(id: string, pinned: boolean): Promise<void>
    reopen(): Promise<void>
    splitToggle(): Promise<void>
    splitSet(id: string): Promise<void>
    splitRatio(ratio: number): Promise<void>
    focus(id: string): Promise<void>
    discard(id: string): Promise<void>
    reorder(input: ReorderTabsInput): Promise<void>
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
    clear(): Promise<void>
  }
  tasks: {
    create(input: { title: string; dueAt?: number | null }): Promise<import('./types').Task>
    toggle(id: string): Promise<void>
    remove(id: string): Promise<void>
  }
  notes: {
    get(id: string): Promise<Note | null>
    save(input: SaveNoteInput): Promise<Note>
    remove(id: string): Promise<void>
    openFolder(): Promise<void>
  }
  agent: {
    run(input: AgentRunRequest): Promise<{ runId: string }>
    cancel(runId?: string): void
    onEvent(callback: (event: AgentEvent) => void): () => void
  }
  settings: {
    update(patch: SettingsPatch): Promise<void>
    setKey(input: SetKeyInput): Promise<boolean>
    testKey(provider: ProviderId): Promise<KeyTestResult>
  }
  downloads: {
    list(): Promise<import('./types').DownloadItem[]>
    open(id: string): Promise<void>
    clear(): Promise<void>
  }
  processes(): Promise<{ live: number; processes: import('./types').ProcessInfo[] }>
  onState(callback: (view: AppView) => void): () => void
  onShortcut(callback: (event: ShortcutEvent) => void): () => void
}
