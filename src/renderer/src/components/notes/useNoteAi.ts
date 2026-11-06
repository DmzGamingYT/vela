import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { NoteAiAction } from '@shared/api'
import type { Note } from '@shared/types'
import { draftFrom, type Draft } from './draft'

export type AiBusy = NoteAiAction | 'generate' | null

interface NoteAiOptions {
  draft: Draft | null
  setDraft: Dispatch<SetStateAction<Draft | null>>
  setDirty(value: boolean): void
  setPreview(value: boolean): void
  setSavedAt(value: number | null): void
  saveNote(input: {
    title: string
    body: string
    spaceId: string
    url?: string
    tags?: string[]
    pinned?: boolean
  }): Promise<Note | null>
  activeTitle: string | undefined
  activeUrl: string | undefined
  spaceId: string
  toast(message: string, tone?: 'error'): void
}

/** Réécriture de la note ouverte et génération d'une note depuis la page. */
export function useNoteAi({
  draft,
  setDraft,
  setDirty,
  setPreview,
  setSavedAt,
  saveNote,
  activeTitle,
  activeUrl,
  spaceId,
  toast
}: NoteAiOptions) {
  const [aiBusy, setAiBusy] = useState<AiBusy>(null)
  const [aiMode, setAiMode] = useState<'api' | 'demo' | null>(null)

  const runAi = async (action: NoteAiAction): Promise<void> => {
    if (!draft) return
    if (!draft.body.trim()) {
      toast('Écrivez d’abord quelques lignes.', 'error')
      return
    }
    setAiBusy(action)
    try {
      const result = await window.vela.notes.ai({
        action,
        body: draft.body,
        title: draft.title,
        url: draft.url
      })
      if (!result.text) throw new Error('Réponse vide')
      setDraft({
        ...draft,
        body: result.text,
        tags: draft.tags.includes('ia') ? draft.tags : [...draft.tags, 'ia']
      })
      setDirty(true)
      setPreview(true)
      setAiMode(result.mode)
      toast(
        result.mode === 'demo'
          ? 'Note réécrite en mode démo (aucun modèle configuré).'
          : 'Note réécrite par le modèle.'
      )
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Le modèle n’a pas répondu.', 'error')
    } finally {
      setAiBusy(null)
    }
  }

  const generateNote = async (): Promise<void> => {
    setAiBusy('generate')
    try {
      const result = await window.vela.notes.ai({ action: 'generate' })
      if (!result.text) throw new Error('Réponse vide')
      const title = activeTitle ? `Note — ${activeTitle}` : 'Note générée'
      const note = await saveNote({
        title: title.slice(0, 160),
        body: result.text,
        spaceId,
        url: activeUrl,
        tags: ['ia'],
        pinned: false
      })
      if (note) {
        setDraft(draftFrom(note))
        setSavedAt(note.updatedAt)
        setDirty(false)
        setPreview(true)
        setAiMode(result.mode)
        toast(
          result.mode === 'demo'
            ? 'Note générée en mode démo (aucun modèle configuré).'
            : 'Note générée par le modèle.'
        )
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Génération impossible.', 'error')
    } finally {
      setAiBusy(null)
    }
  }

  return { aiBusy, aiMode, setAiMode, runAi, generateNote }
}
