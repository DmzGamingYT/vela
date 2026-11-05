import { useEffect, useState } from 'react'

export interface SavedSessionTab {
  url: string
  title: string
}

export interface SavedSession {
  id: string
  name: string
  createdAt: number
  spaceId: string
  spaceName: string
  tabs: SavedSessionTab[]
}

const STORAGE_KEY = 'vela.sessions.v1'
const MAX_SESSIONS = 20
const MAX_TABS = 40
const MAX_NAME = 80

/** Les autres fenêtres du renderer écoutent ce signal pour le compteur du rail. */
export const SESSIONS_EVENT = 'vela:sessions-change'

function emit(): void {
  try {
    window.dispatchEvent(new Event(SESSIONS_EVENT))
  } catch {
    /* aucun écouteur : rien à signaler */
  }
}

function sanitize(raw: unknown): SavedSession[] {
  if (!Array.isArray(raw)) return []
  const sessions: SavedSession[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const candidate = entry as Partial<SavedSession>
    if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string') continue
    if (typeof candidate.spaceId !== 'string' || typeof candidate.spaceName !== 'string') continue
    const tabs = Array.isArray(candidate.tabs)
      ? candidate.tabs
          .filter(
            (tab): tab is SavedSessionTab =>
              Boolean(tab) &&
              typeof tab === 'object' &&
              typeof (tab as Partial<SavedSessionTab>).url === 'string' &&
              /^https?:/i.test((tab as SavedSessionTab).url)
          )
          .slice(0, MAX_TABS)
          .map((tab) => ({ url: tab.url, title: typeof tab.title === 'string' ? tab.title : '' }))
      : []
    if (tabs.length === 0) continue
    sessions.push({
      id: candidate.id,
      name: candidate.name.slice(0, MAX_NAME),
      createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now(),
      spaceId: candidate.spaceId,
      spaceName: candidate.spaceName,
      tabs
    })
  }
  return sessions.slice(0, MAX_SESSIONS)
}

export function listSessions(): SavedSession[] {
  try {
    return sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'))
  } catch {
    return []
  }
}

function write(sessions: SavedSession[]): SavedSession[] {
  const next = sessions.slice(0, MAX_SESSIONS)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* stockage indisponible : la session reste en mémoire */
  }
  emit()
  return next
}

export function saveSession(input: {
  name: string
  spaceId: string
  spaceName: string
  tabs: SavedSessionTab[]
}): SavedSession[] {
  const tabs = input.tabs
    .filter((tab) => /^https?:/i.test(tab.url))
    .slice(0, MAX_TABS)
    .map((tab) => ({ url: tab.url, title: tab.title }))
  if (tabs.length === 0) return listSessions()
  const session: SavedSession = {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: (input.name.trim() || 'Session sans nom').slice(0, MAX_NAME),
    createdAt: Date.now(),
    spaceId: input.spaceId,
    spaceName: input.spaceName,
    tabs
  }
  return write([session, ...listSessions()])
}

export function removeSession(id: string): SavedSession[] {
  return write(listSessions().filter((session) => session.id !== id))
}

/** Compteur partagé par le rail, mis à jour après chaque enregistrement. */
export function useSessionCount(): number {
  const [count, setCount] = useState(() => listSessions().length)
  useEffect(() => {
    const refresh = (): void => setCount(listSessions().length)
    window.addEventListener(SESSIONS_EVENT, refresh)
    return () => window.removeEventListener(SESSIONS_EVENT, refresh)
  }, [])
  return count
}
