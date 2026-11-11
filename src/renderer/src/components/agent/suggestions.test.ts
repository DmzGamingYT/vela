import { describe, expect, it } from 'vitest'
import type { ComposerTab } from './ChatComposer'
import { buildAgentSuggestions, buildQuickActions, pageKindOf } from './suggestions'

function tab(url: string, title = 'Page'): ComposerTab {
  return { id: url, title, url }
}

const video = tab('https://www.youtube.com/watch?v=abc', 'Vidéo')
const article = tab('https://exemple.fr/article/vela', 'Article')
const page = tab('https://exemple.fr/', 'Accueil')

describe('suggestions de l’agent', () => {
  it('reconnaît une vidéo, un article et une page', () => {
    expect(pageKindOf(video)).toBe('video')
    expect(pageKindOf(article)).toBe('article')
    expect(pageKindOf(page)).toBe('page')
  })

  it('adapte le vocabulaire à une vidéo', () => {
    const suggestions = buildAgentSuggestions([video], 'answer')
    expect(suggestions[0].label).toBe('Résumer cette vidéo')
    expect(suggestions[0].prompt).toContain('cette vidéo')
  })

  it('parle de ces pages pour plusieurs sources', () => {
    const suggestions = buildAgentSuggestions([article, page], 'answer')
    expect(suggestions[0].label).toBe('Comparer ces pages')
    expect(suggestions[1].label).toBe('Garder les points communs')
    expect(suggestions[2].label).toBe('Résumer ces pages')
  })

  it('garde les libellés à l’infinitif', () => {
    const labels = buildAgentSuggestions([article], 'answer').map((suggestion) => suggestion.label)
    expect(labels).toEqual([
      'Résumer cet article',
      'Garder les points clés',
      'Préparer un plan d’action'
    ])
  })

  it('retire « Corriger » devant une vidéo', () => {
    const ids = buildQuickActions([video]).map((action) => action.id)
    expect(ids).not.toContain('correct')
    expect(ids).toContain('summarize')
  })
})
