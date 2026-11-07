/** Modèles proposés quand on crée une note : structure Markdown et étiquette. */
export type NoteTemplateId = 'meeting' | 'idea' | 'reading'

export interface NoteTemplate {
  id: NoteTemplateId
  label: string
  hint: string
  icon: 'check' | 'sparkles' | 'globe'
  title: string
  tags: string[]
  body: string
}

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: 'meeting',
    label: 'Réunion',
    hint: 'Ordre du jour, décisions, actions',
    icon: 'check',
    title: 'Réunion',
    tags: ['réunion'],
    body: `## Ordre du jour

- 

## Décisions

- 

## Actions

- [ ] 
`
  },
  {
    id: 'idea',
    label: 'Idée',
    hint: 'L’idée, son pourquoi, la première étape',
    icon: 'sparkles',
    title: 'Idée',
    tags: ['idée'],
    body: `## L’idée


## Pourquoi maintenant


## Première étape

- [ ] 
`
  },
  {
    id: 'reading',
    label: 'Lecture',
    hint: 'Référence, idées clés, citations',
    icon: 'globe',
    title: 'Lecture',
    tags: ['lecture'],
    body: `## Référence

Auteur · 
Lien : 

## Idées clés

- 

## Citations

> 

## À retenir

`
  }
]
