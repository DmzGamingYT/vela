import { describe, expect, it } from 'vitest'
import { parseDroppedExcerpt } from './noteDrop'

describe('extrait déposé', () => {
  it('lit la source et le titre de l’en-tête', () => {
    const raw = [
      '---',
      'source: https://example.org/article',
      'titre: Un article — utile',
      '---',
      '',
      '> Le passage choisi.',
      ''
    ].join('\n')
    const parsed = parseDroppedExcerpt(raw)
    expect(parsed.url).toBe('https://example.org/article')
    expect(parsed.title).toBe('Un article — utile')
    expect(parsed.body).toBe('> Le passage choisi.')
  })

  it('refuse une source qui n’est pas http(s)', () => {
    const raw = ['---', 'source: javascript:alert(1)', '---', '> texte'].join('\n')
    expect(parseDroppedExcerpt(raw).url).toBeUndefined()
  })

  it('accepte un texte brut sans en-tête', () => {
    expect(parseDroppedExcerpt('  juste du texte  ')).toEqual({ body: 'juste du texte' })
  })
})
