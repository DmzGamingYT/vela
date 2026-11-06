import type { BrowserWindow, WebContents } from 'electron'
import type { CreateTabInput } from '@shared/api'
import type {
  AppView,
  DownloadItem,
  HistoryEntry,
  NoteMeta,
  ProcessInfo,
  TabGroup,
  TabState
} from '@shared/types'
import type { AgentRunner } from '../agent'
import type { MiniWindow } from '../mini'
import type { HighlightsStore, NotesStore } from '../notes'
import type { NoteAudioStore } from '../noteAudio'
import type { Store } from '../store'
import type { TabManager } from '../tabs'
import type { Thumbnails } from '../thumbnails'
import type { TunnelService } from '../tunnel'

/**
 * Ce que les modules d'IPC peuvent atteindre de `Browser`.
 *
 * Le contexte est construit dans `Browser.registerIpc` : les champs et les
 * méthodes qui restent privés le demeurent, seuls ceux listés ici sortent.
 */
export interface IpcHost {
  readonly store: Store
  readonly notes: NotesStore
  readonly noteAudio: NoteAudioStore
  readonly highlights: HighlightsStore
  readonly tabs: TabManager
  readonly agent: AgentRunner
  readonly tunnel: TunnelService
  readonly thumbs: Thumbnails
  readonly mini: MiniWindow

  view(): AppView
  broadcast(): void
  send(channel: string, payload: unknown): void
  metrics(): { live: number; processes: ProcessInfo[] }
  win(): BrowserWindow | null
  setOverlay(value: boolean): void

  createTab(input: CreateTabInput): TabState
  closeTab(id: string): Promise<void>
  activateTab(id: string): void
  pinTab(input: unknown): void
  reopenTab(): void
  toggleSplit(): void
  setSplitTab(id: string): void
  reorderTab(input: unknown): void
  createGroup(input: unknown): TabGroup
  updateGroup(input: unknown): void
  removeGroup(id: string): void

  addSpace(input: unknown): void
  updateSpace(input: unknown): void
  removeSpace(id: string): void
  duplicateSpace(id: string): void
  clearSpaceData(id: string): Promise<void>
  activateSpace(id: string): void

  saveNote(input: unknown): ReturnType<NotesStore['save']>
  setNoteCache(list: NoteMeta[]): void
  runAgent(input: unknown): { runId: string }

  updateSettings(patch: unknown): void
  testKey(input: unknown): Promise<{ ok: boolean; message: string }>
  confirmRemoteEndpoint(payload: unknown): Promise<boolean>

  downloads(): DownloadItem[]
  setDownloads(list: DownloadItem[]): void

  pendingHistory(): { entries: HistoryEntry[]; timer: NodeJS.Timeout } | null
  setPendingHistory(value: { entries: HistoryEntry[]; timer: NodeJS.Timeout } | null): void
  commitPendingHistory(): void

  openMini(input: { url?: string; spaceId?: string }): boolean
  startSelectionDrag(sender: WebContents, selected: string): void
}
