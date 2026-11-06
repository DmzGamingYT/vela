import type { Note } from '@shared/types'

export interface Draft {
  id?: string
  title: string
  body: string
  spaceId: string
  url?: string
  tags: string[]
  pinned: boolean
}

export function draftFrom(note: Note): Draft {
  return {
    id: note.id,
    title: note.title,
    body: note.body,
    spaceId: note.spaceId,
    url: note.url,
    tags: note.tags ?? [],
    pinned: note.pinned ?? false
  }
}
