import type { AgentMode } from '@shared/types'
import type { AgentActionEntry } from '@shared/agentLoop'

export type Overlay =
  | 'command'
  | 'sessions'
  | 'settings'
  | 'space'
  | 'processes'
  | 'downloads'
  | 'history'
  | 'bookmarks'
  | null

export type WorkMode = 'browse' | 'work'

export interface Toast {
  id: string
  text: string
  tone: 'info' | 'error'
  action?: { label: string; run: () => void }
  /** La pastille s'efface : elle quitte la liste à la fin du fondu. */
  leaving?: boolean
}

export interface AgentStep {
  label: string
  state: 'pending' | 'active' | 'done'
}

export interface AgentUi {
  runId: string | null
  title: string
  steps: AgentStep[]
  markdown: string
  status: 'idle' | 'running' | 'done' | 'error' | 'cancelled'
  error: string | null
  mode: AgentMode
  prompt: string
  sources: { title: string; url: string; anchor?: string }[]
  /** Demande de départ : rédiger un rapport, ou agir sur les pages. */
  requestMode: 'answer' | 'act'
  /** Actions réellement exécutées, dans l'ordre. */
  journal: AgentActionEntry[]
}
