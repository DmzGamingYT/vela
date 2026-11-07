import { describe, expect, it } from 'vitest'
import { aiActionForEvent, NOTE_AI_ACTIONS } from './aiActions'

describe('raccourcis des actions IA', () => {
  it('associe chaque action à un chiffre unique', () => {
    expect(NOTE_AI_ACTIONS.map((action) => action.digit)).toEqual(['1', '2', '3', '4', '5'])
    expect(new Set(NOTE_AI_ACTIONS.map((action) => action.digit)).size).toBe(5)
  })

  it('reconnaît la rangée numérique et le pavé numérique', () => {
    expect(aiActionForEvent({ altKey: true, shiftKey: false, code: 'Digit1' })).toBe(
      'reformulate'
    )
    expect(aiActionForEvent({ altKey: true, shiftKey: false, code: 'Numpad5' })).toBe(
      'beautify'
    )
    expect(aiActionForEvent({ altKey: true, shiftKey: false, code: 'Digit4' })).toBe('correct')
  })

  it('ignore les frappes sans Alt, avec Shift ou hors des chiffres attendus', () => {
    expect(aiActionForEvent({ altKey: false, shiftKey: false, code: 'Digit1' })).toBeNull()
    expect(aiActionForEvent({ altKey: true, shiftKey: true, code: 'Digit1' })).toBeNull()
    expect(aiActionForEvent({ altKey: true, shiftKey: false, code: 'Digit9' })).toBeNull()
    expect(aiActionForEvent({ altKey: true, shiftKey: false, code: 'KeyA' })).toBeNull()
  })
})
