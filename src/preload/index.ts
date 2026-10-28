import { contextBridge, ipcRenderer } from 'electron'
import type {
  CreateGroupInput,
  CreateSpaceInput,
  CreateTabInput,
  NoteAiInput,
  ReorderTabsInput,
  SaveNoteInput,
  SetKeyInput,
  SettingsPatch,
  UpdateGroupInput,
  VelaApi
} from '@shared/api'
import type { AgentEvent, AppView, LayoutRequest, MiniState, SelectionPayload, ShortcutEvent } from '@shared/types'
import type { TunnelEvent } from '@shared/api'

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: VelaApi = {
  platform: process.platform,
  // Architecture réellement exécutée (arm64, x64) : le bundle universel en a
  // deux, et « À propos » comme les diagnostics doivent pouvoir le dire.
  arch: process.arch,
  view: () => ipcRenderer.invoke('app:view'),
  avatars: {
    read: (name: string) => ipcRenderer.invoke('avatar:read', name)
  },
  letterboxd: {
    import: (spaceId: string) => ipcRenderer.invoke('letterboxd:import', spaceId)
  },
  thumbs: {
    get: (url: string) => ipcRenderer.invoke('thumbs:get', url),
    count: () => ipcRenderer.invoke('thumbs:count'),
    purge: () => ipcRenderer.invoke('thumbs:purge')
  },
  spaces: {
    create: (input: CreateSpaceInput) => ipcRenderer.invoke('space:create', input),
    update: (input) => ipcRenderer.invoke('space:update', input),
    remove: (id: string) => ipcRenderer.invoke('space:remove', id),
    activate: (id: string) => ipcRenderer.invoke('space:activate', id)
  },
  tabs: {
    create: (input?: CreateTabInput) => ipcRenderer.invoke('tab:create', input ?? {}),
    close: (id: string) => ipcRenderer.invoke('tab:close', id),
    activate: (id: string) => ipcRenderer.invoke('tab:activate', id),
    navigate: (id: string, input: string) => ipcRenderer.invoke('tab:navigate', { id, input }),
    find: (id: string, query: string, forward?: boolean) => ipcRenderer.invoke('tab:find', { id, query, forward }),
    findStop: (id: string, action?: 'clearSelection' | 'keepSelection') => ipcRenderer.invoke('tab:find-stop', { id, action }),
    home: (id: string) => ipcRenderer.invoke('tab:home', id),
    back: (id: string) => ipcRenderer.invoke('tab:back', id),
    forward: (id: string) => ipcRenderer.invoke('tab:forward', id),
    reload: (id: string) => ipcRenderer.invoke('tab:reload', id),
    zoom: (id: string, direction: 'in' | 'out' | 'reset') => ipcRenderer.invoke('tab:zoom', { id, direction }),
    stop: (id: string) => ipcRenderer.invoke('tab:stop', id),
    pin: (id: string, pinned: boolean) => ipcRenderer.invoke('tab:pin', { id, pinned }),
    mute: (id: string, muted: boolean) => ipcRenderer.invoke('tab:mute', { id, muted }),
    reopen: () => ipcRenderer.invoke('tab:reopen'),
    splitToggle: () => ipcRenderer.invoke('tab:split-toggle'),
    splitSet: (id: string) => ipcRenderer.invoke('tab:split-set', id),
    splitRatio: (ratio: number) => ipcRenderer.invoke('tab:split-ratio', ratio),
    focus: (id: string) => ipcRenderer.invoke('tab:focus', id),
    discard: (id: string) => ipcRenderer.invoke('tab:discard', id),
    reorder: (input: ReorderTabsInput) => ipcRenderer.invoke('tab:reorder', input),
    print: (id: string) => ipcRenderer.invoke('tab:print', id)
  },
  groups: {
    create: (input?: CreateGroupInput) => ipcRenderer.invoke('group:create', input ?? {}),
    update: (input: UpdateGroupInput) => ipcRenderer.invoke('group:update', input),
    remove: (id: string) => ipcRenderer.invoke('group:remove', id)
  },
  views: {
    layout: (request: LayoutRequest) => ipcRenderer.send('views:layout', request)
  },
  mini: {
    open: (input) => ipcRenderer.invoke('mini:open', input ?? {}),
    close: () => ipcRenderer.invoke('mini:close'),
    navigate: (input: string) => ipcRenderer.invoke('mini:navigate', input),
    back: () => ipcRenderer.invoke('mini:back'),
    forward: () => ipcRenderer.invoke('mini:forward'),
    reload: () => ipcRenderer.invoke('mini:reload'),
    stop: () => ipcRenderer.invoke('mini:stop'),
    openInTab: () => ipcRenderer.invoke('mini:open-in-tab'),
    state: () => ipcRenderer.invoke('mini:state'),
    // La barre n'écoute qu'à partir de son montage : elle se présente pour
    // recevoir l'état courant, et les demandes de focus qui ont attendu.
    ready: () => ipcRenderer.send('mini:ready'),
    onState: (callback: (state: MiniState) => void) => subscribe('mini:state', callback),
    onFocusAddress: (callback: () => void) => {
      const listener = (): void => callback()
      ipcRenderer.on('mini:focus-address', listener)
      return () => ipcRenderer.removeListener('mini:focus-address', listener)
    }
  },
  history: {
    list: () => ipcRenderer.invoke('history:list'),
    remove: (url: string) => ipcRenderer.invoke('history:remove', url),
    clear: () => ipcRenderer.invoke('history:clear')
  },
  favicons: {
    get: (host: string, spaceId?: string) => ipcRenderer.invoke('favicons:get', { host, spaceId }),
    purge: () => ipcRenderer.invoke('favicons:purge')
  },
  bookmarks: {
    toggle: (input: { url: string; title?: string; favicon?: string }) => ipcRenderer.invoke('bookmark:toggle', input),
    remove: (id: string) => ipcRenderer.invoke('bookmark:remove', id),
    detect: () => ipcRenderer.invoke('bookmark:detect'),
    addMany: (entries: { url: string; title?: string }[]) => ipcRenderer.invoke('bookmark:add-many', entries),
    move: (id: string, position: number) => ipcRenderer.invoke('bookmark:move', { id, position }),
    reorder: (ids: string[]) => ipcRenderer.invoke('bookmark:reorder', ids)
  },
  downloads: {
    list: () => ipcRenderer.invoke('downloads:list'),
    preview: (id: string) => ipcRenderer.invoke('downloads:preview', id),
    open: (id: string) => ipcRenderer.invoke('downloads:open', id),
    clear: () => ipcRenderer.invoke('downloads:clear')
  },
  updates: {
    status: () => ipcRenderer.invoke('update:status'),
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    releases: () => ipcRenderer.invoke('update:releases'),
    onEvent: (callback: (info: import('@shared/api').UpdateInfo) => void) =>
      subscribe('update:event', callback)
  },
  processes: () => ipcRenderer.invoke('app:metrics'),
  tasks: {
    create: (input: { title: string; dueAt?: number | null }) => ipcRenderer.invoke('tasks:create', input),
    toggle: (id: string) => ipcRenderer.invoke('tasks:toggle', id),
    remove: (id: string) => ipcRenderer.invoke('tasks:remove', id)
  },
  works: {
    get: (id: string) => ipcRenderer.invoke('works:get', id),
    rename: (input: { id: string; title: string }) => ipcRenderer.invoke('work:rename', input),
    archive: (input: { id: string; archived: boolean }) => ipcRenderer.invoke('work:archive', input)
  },
  notes: {
    get: (id: string) => ipcRenderer.invoke('notes:get', id),
    save: (input: SaveNoteInput) => ipcRenderer.invoke('notes:save', input),
    patch: (input: { id: string; title?: string; pinned?: boolean; tags?: string[] }) =>
      ipcRenderer.invoke('notes:patch', input),
    remove: (id: string) => ipcRenderer.invoke('notes:remove', id),
    openFolder: () => ipcRenderer.invoke('notes:open-folder'),
    captureSelection: () => ipcRenderer.invoke('notes:capture-selection'),
    highlight: () => ipcRenderer.invoke('notes:highlight'),
    highlights: () => ipcRenderer.invoke('notes:highlights'),
    ai: (input: NoteAiInput) => ipcRenderer.invoke('notes:ai', input),
    rename: (input: { id: string; title: string }) => ipcRenderer.invoke('notes:rename', input),
    graph: (id: string) => ipcRenderer.invoke('notes:graph', id),
    audio: {
      save: (input: { spaceId: string; dataUrl: string }) => ipcRenderer.invoke('notes:audio-save', input),
      get: (name: string) => ipcRenderer.invoke('notes:audio-get', name),
      remove: (name: string) => ipcRenderer.invoke('notes:audio-remove', name)
    },
    transcribe: (input: { name: string; consent: boolean }) => ipcRenderer.invoke('notes:transcribe', input)
  },
  privacy: {
    toggleSite: (host: string) => ipcRenderer.invoke('privacy:toggle-site', host)
  },
  tunnel: {
    run: (input) => ipcRenderer.invoke('tunnel:run', input),
    cancel: (runId: string) => ipcRenderer.send('tunnel:cancel', runId),
    onEvent: (callback: (event: TunnelEvent) => void) => subscribe('tunnel:event', callback),
    maps: () => ipcRenderer.invoke('tunnel:maps'),
    load: (id: string) => ipcRenderer.invoke('tunnel:load', id),
    save: (map: import('@shared/tunnel').TunnelMap) => ipcRenderer.invoke('tunnel:save', map),
    rename: (input: { id: string; title: string }) => ipcRenderer.invoke('tunnel:rename', input),
    remove: (id: string) => ipcRenderer.invoke('tunnel:remove', id),
    duplicate: (id: string) => ipcRenderer.invoke('tunnel:duplicate', id),
    savePng: (input: { dataUrl: string; name: string }) => ipcRenderer.invoke('tunnel:save-png', input),
    exportPdf: (input: { html: string; name: string }) => ipcRenderer.invoke('tunnel:export-pdf', input)
  },
  selection: {
    onSelect: (callback: (payload: SelectionPayload) => void) => subscribe('selection', callback)
  },
  agent: {
    run: (input) => ipcRenderer.invoke('agent:run', input),
    cancel: (runId?: string) => ipcRenderer.send('agent:cancel', runId),
    onEvent: (callback: (event: AgentEvent) => void) => subscribe('agent:event', callback)
  },
  comic: {
    run: (tabId: string) => ipcRenderer.invoke('comic:run', { tabId }),
    clear: (tabId: string) => ipcRenderer.invoke('comic:clear', { tabId })
  },
  settings: {
    update: (patch: SettingsPatch) => ipcRenderer.invoke('settings:update', patch),
    setKey: (input: SetKeyInput) => ipcRenderer.invoke('settings:set-key', input),
    testKey: (provider) => ipcRenderer.invoke('settings:test-key', { provider })
  },
  appearance: {
    pickImage: () => ipcRenderer.invoke('appearance:pick-image'),
    image: () => ipcRenderer.invoke('appearance:image'),
    clearImage: () => ipcRenderer.invoke('appearance:clear-image')
  },
  onState: (callback: (view: AppView) => void) => subscribe('state:changed', callback),
  onShortcut: (callback: (event: ShortcutEvent) => void) => subscribe('shortcut', callback)
}

contextBridge.exposeInMainWorld('vela', api)
