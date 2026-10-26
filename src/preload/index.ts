import { contextBridge, ipcRenderer } from 'electron'
import type {
  CreateGroupInput,
  CreateSpaceInput,
  CreateTabInput,
  ReorderTabsInput,
  SaveNoteInput,
  SetKeyInput,
  SettingsPatch,
  UpdateGroupInput,
  VelaApi
} from '@shared/api'
import type { AgentEvent, AppView, LayoutRequest, SelectionPayload, ShortcutEvent } from '@shared/types'
import type { TunnelEvent } from '@shared/api'

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: VelaApi = {
  platform: process.platform,
  view: () => ipcRenderer.invoke('app:view'),
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
  history: {
    list: () => ipcRenderer.invoke('history:list'),
    remove: (url: string) => ipcRenderer.invoke('history:remove', url),
    clear: () => ipcRenderer.invoke('history:clear')
  },
  bookmarks: {
    toggle: (input: { url: string; title?: string; favicon?: string }) => ipcRenderer.invoke('bookmark:toggle', input),
    remove: (id: string) => ipcRenderer.invoke('bookmark:remove', id),
    detect: () => ipcRenderer.invoke('bookmark:detect'),
    addMany: (entries: { url: string; title?: string }[]) => ipcRenderer.invoke('bookmark:add-many', entries)
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
    remove: (id: string) => ipcRenderer.invoke('notes:remove', id),
    openFolder: () => ipcRenderer.invoke('notes:open-folder'),
    captureSelection: () => ipcRenderer.invoke('notes:capture-selection')
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
