// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  saveNote: vi.fn(),
  toast: vi.fn(),
  toggleNotes: vi.fn(),
  requestVoiceNote: vi.fn()
}))

vi.mock('../../store/browser', () => ({
  useBrowser: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      view: { notes: [] },
      saveNote: mocks.saveNote,
      toast: mocks.toast,
      toggleNotes: mocks.toggleNotes,
      requestVoiceNote: mocks.requestVoiceNote
    })
}))

import QuickNotesCard from './QuickNotesCard'

beforeEach(() => {
  mocks.saveNote.mockReset()
  mocks.toast.mockReset()
})

afterEach(() => cleanup())

/** Ouvre le champ de note et saisit un texte. */
function fill(text: string): void {
  fireEvent.click(screen.getByText('Noter une idée, un lien ou une tâche…'))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: text } })
}

describe('carte de note rapide', () => {
  it('vide le champ et confirme quand la note est écrite', async () => {
    mocks.saveNote.mockResolvedValue({ id: 'n1', title: 'Idée' })
    render(<QuickNotesCard spaceId="s1" />)
    fill('Une idée')
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith('Note enregistrée.'))
    // Le champ se referme : la note est partie, rien ne reste à l'écran.
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('garde le texte et prévient quand l’écriture échoue', async () => {
    // `saveNote` avale l'erreur et rend `null` : sans test, le champ se
    // vidait et l’app annonçait une note enregistrée qui n’existait pas.
    mocks.saveNote.mockResolvedValue(null)
    render(<QuickNotesCard spaceId="s1" />)
    fill('Une idée à ne pas perdre')
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        'Erreur lors de l’enregistrement de la note.',
        'error'
      )
    )
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'Une idée à ne pas perdre'
    )
    expect(mocks.toast).not.toHaveBeenCalledWith('Note enregistrée.')
  })
})
