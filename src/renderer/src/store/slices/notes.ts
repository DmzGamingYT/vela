import type { StateCreator } from 'zustand'
import type { SaveNoteInput } from '@shared/api'
import type { Note } from '@shared/types'
import type { BrowserState } from '../browser'

export interface NotesSlice {
  notesOpen: boolean
  voiceNoteRequest: number
  voiceNoteSpaceId: string | null
  /** Demande d'ouverture d'une note précise, depuis la palette. */
  noteRequest: { id: string; nonce: number } | null
  /** Demande d'ouverture ou de progression dans la recherche des notes. */
  notesSearchRequest: { mode: 'focus' | 'next'; nonce: number } | null
  toggleNotes(open?: boolean): void
  requestVoiceNote(spaceId?: string): void
  consumeVoiceNoteRequest(): void
  saveNote(input: SaveNoteInput): Promise<Note | null>
  deleteNote(id: string): Promise<void>
  createTask(title: string, dueToday?: boolean): Promise<void>
  toggleTask(id: string): Promise<void>
  deleteTask(id: string): Promise<void>
  captureSelection(): Promise<void>
  requestNote(id: string): void
  consumeNoteRequest(): void
  requestNotesSearch(mode?: 'focus' | 'next'): void
  consumeNotesSearchRequest(): void
}

/** Notes, enregistrements vocaux et tâches du jour. */
export const createNotesSlice: StateCreator<BrowserState, [], [], NotesSlice> = (set, get) => ({
  notesOpen: false,
  voiceNoteRequest: 0,
  voiceNoteSpaceId: null,
  noteRequest: null,
  notesSearchRequest: null,

  toggleNotes(open) {
    // Les notes et l'agent sont deux surfaces de travail ancrées à droite :
    // ouvertes ensemble sur une fenêtre de 1280 px, elles ne laissaient plus
    // que 116 px à la page. Une seule à la fois, donc.
    const next = open ?? !get().notesOpen
    set((state) => ({
      notesOpen: next,
      agentOpen: next ? false : state.agentOpen,
      // Comme l'agent, les notes referment le panneau modal ouvert : les deux
      // se disputaient le clavier, et le tiroir restait visible sous la
      // fenêtre des réglages.
      overlay: next ? null : state.overlay
    }))
  },

  requestVoiceNote(spaceId) {
    set((state) => ({
      notesOpen: true,
      agentOpen: false,
      voiceNoteRequest: state.voiceNoteRequest + 1,
      voiceNoteSpaceId: spaceId ?? state.view?.activeSpaceId ?? null
    }))
  },

  consumeVoiceNoteRequest() {
    set({ voiceNoteRequest: 0, voiceNoteSpaceId: null })
  },

  async saveNote(input) {
    return get().call(() => window.vela.notes.save(input), 'La note n’a pas été enregistrée.')
  },

  async deleteNote(id) {
    await get().call(() => window.vela.notes.remove(id), 'La note n’a pas été supprimée.')
    get().toast('Note déplacée dans la corbeille.')
  },

  async createTask(title, dueToday = true) {
    const trimmed = title.trim().slice(0, 200)
    if (!trimmed) return
    let dueAt: number | null = null
    if (dueToday) {
      const end = new Date()
      end.setHours(23, 59, 59, 999)
      dueAt = end.getTime()
    }
    await get().call(() => window.vela.tasks.create({ title: trimmed, dueAt }), 'Tâche non créée.')
  },

  async toggleTask(id) {
    await get().call(() => window.vela.tasks.toggle(id), 'Tâche non mise à jour.')
  },

  async deleteTask(id) {
    await get().call(() => window.vela.tasks.remove(id), 'Tâche non supprimée.')
  },

  async captureSelection() {
    const note = await get().call(() => window.vela.notes.captureSelection(), 'Capture impossible.')
    if (note === null) {
      get().toast('Sélectionnez du texte dans la page pour le capturer.', 'error')
      return
    }
    get().toast('Extrait enregistré dans les notes.')
    set({ notesOpen: true, agentOpen: false })
  },

  /** La palette ouvre la note choisie, pas seulement le tiroir. */
  requestNote(id) {
    set((state) => ({
      noteRequest: { id, nonce: (state.noteRequest?.nonce ?? 0) + 1 },
      notesOpen: true,
      agentOpen: false
    }))
  },

  consumeNoteRequest() {
    set({ noteRequest: null })
  },

  /** Ouvre le tiroir Notes et demande le focus ou le résultat suivant. */
  requestNotesSearch(mode = 'focus') {
    set((state) => ({
      notesSearchRequest: { mode, nonce: (state.notesSearchRequest?.nonce ?? 0) + 1 },
      notesOpen: true,
      agentOpen: false
    }))
  },

  consumeNotesSearchRequest() {
    set({ notesSearchRequest: null })
  }
})
