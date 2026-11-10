import { describe, expect, it } from 'vitest'
import { createNotesSlice, type NotesSlice } from './notes'

interface FakeState {
  notesOpen: boolean
  agentOpen: boolean
  overlay: string | null
}

function setup(over: Partial<FakeState> = {}) {
  const state: FakeState = { notesOpen: false, agentOpen: false, overlay: null, ...over }
  const set = (patch: unknown): void => {
    const value =
      typeof patch === 'function'
        ? (patch as (current: FakeState) => Partial<FakeState>)(state)
        : (patch as Partial<FakeState>)
    Object.assign(state, value)
  }
  const get = (): FakeState => state
  const slice = createNotesSlice(set as never, get as never) as unknown as NotesSlice
  return { slice, state }
}

describe('tiroir des notes', () => {
  it('ouvre et referme le tiroir', () => {
    const { slice, state } = setup()
    slice.toggleNotes(true)
    expect(state.notesOpen).toBe(true)
    slice.toggleNotes()
    expect(state.notesOpen).toBe(false)
  })

  it('referme l’agent quand il s’ouvre', () => {
    const { slice, state } = setup({ agentOpen: true })
    slice.toggleNotes(true)
    expect(state.agentOpen).toBe(false)
  })

  it('referme le panneau modal ouvert', () => {
    // Sans cela, le tiroir et la fenêtre des réglages se recouvraient, et
    // leurs deux pièges de focus se disputaient le clavier.
    const { slice, state } = setup({ overlay: 'settings' })
    slice.toggleNotes(true)
    expect(state.overlay).toBeNull()
  })

  it('laisse le panneau ouvert quand le tiroir se referme', () => {
    const { slice, state } = setup({ notesOpen: true, overlay: 'settings' })
    slice.toggleNotes(false)
    expect(state.overlay).toBe('settings')
  })
})
