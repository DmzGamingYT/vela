// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Markdown } from './markdown'

afterEach(cleanup)

describe('Markdown — surlignage de recherche', () => {
  it('marque les occurrences sans tenir compte de la casse ni des accents', () => {
    const { container } = render(
      <Markdown text="Le résumé du projet, puis le RESUME final." highlight="resume" />
    )
    const hits = Array.from(container.querySelectorAll('mark.md-hit'))
    expect(hits.map((hit) => hit.textContent)).toEqual(['résumé', 'RESUME'])
  })

  it('ne marque rien quand le passage est absent', () => {
    const { container } = render(<Markdown text="Une autre note." highlight="introuvable" />)
    expect(container.querySelector('mark.md-hit')).toBeNull()
  })

  it('surligne aussi dans le code et les liens', () => {
    const { container } = render(
      <Markdown text={'`alpha` et [alpha](https://example.com)'} highlight="alpha" />
    )
    expect(container.querySelectorAll('mark.md-hit')).toHaveLength(2)
  })

  it('ne surligne que les termes positifs, guillemets et exclusions compris', () => {
    const { container } = render(
      <Markdown
        text="Note vocale sur le projet, avec un brouillon."
        highlight={'projet "note vocale" -brouillon'}
      />
    )
    const hits = Array.from(container.querySelectorAll('mark.md-hit'))
    expect(hits.map((hit) => hit.textContent)).toEqual(['Note vocale', 'projet'])
  })
})
