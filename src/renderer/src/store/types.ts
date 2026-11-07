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

/** Ordre de la liste des notes : dernière modification, ou titre. */
export type NotesSort = 'updated' | 'title'

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

/** Un échange terminé, gardé au-dessus de la réponse en cours. */
export interface AgentTurn {
  id: string
  prompt: string
  markdown: string
  mode: AgentMode
  sources: { title: string; url: string; anchor?: string }[]
  status: 'done' | 'error' | 'cancelled'
  requestMode: 'answer' | 'act'
}

export interface AgentUi {
  runId: string | null
  /** Conversation déjà échangée : le fil survit aux demandes suivantes. */
  turns: AgentTurn[]
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
