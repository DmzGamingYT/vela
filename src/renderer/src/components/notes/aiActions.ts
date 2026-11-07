import type { NoteAiAction } from '@shared/api'

export interface NoteAiActionMeta {
  id: NoteAiAction
  label: string
  hint: string
  tier: 'primary' | 'secondary'
  /** Touche affichée après ⌘ ou Ctrl. */
  key: string
  /** Chiffre physique utilisé avec ⌘⌥ (Ctrl+Alt). */
  digit: string
}

export const NOTE_AI_ACTIONS: NoteAiActionMeta[] = [
  {
    id: 'reformulate',
    label: 'Reformuler',
    hint: 'Phrases claires, même contenu',
    tier: 'primary',
    key: '⌥1',
    digit: '1'
  },
  {
    id: 'summarize',
    label: 'Résumer',
    hint: 'Cinq points et une synthèse',
    tier: 'primary',
    key: '⌥2',
    digit: '2'
  },
  {
    id: 'translate',
    label: 'Traduire',
    hint: 'En français, structure conservée',
    tier: 'secondary',
    key: '⌥3',
    digit: '3'
  },
  {
    id: 'correct',
    label: 'Corriger',
    hint: 'Orthographe et grammaire',
    tier: 'secondary',
    key: '⌥4',
    digit: '4'
  },
  {
    id: 'beautify',
    label: 'Embellir',
    hint: 'Mise en page Markdown',
    tier: 'secondary',
    key: '⌥5',
    digit: '5'
  }
]

export const NOTE_AI_SECONDARY_ACTIONS = NOTE_AI_ACTIONS.filter(
  (action) => action.tier === 'secondary'
)

/** Chiffre du raccourci, sur la rangée numérique ou le pavé numérique. */
export function aiActionForEvent(event: {
  altKey: boolean
  shiftKey: boolean
  code: string
}): NoteAiAction | null {
  if (!event.altKey || event.shiftKey) return null
  const match = /^(?:Digit|Numpad)([1-5])$/.exec(event.code)
  if (!match) return null
  const digit = match[1]
  if (!digit) return null
  return NOTE_AI_ACTIONS.find((action) => action.digit === digit)?.id ?? null
}
