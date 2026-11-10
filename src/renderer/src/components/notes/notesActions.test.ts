import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  join(process.cwd(), 'src/renderer/src/styles/07-notes-reglages-dialogue.css'),
  'utf8'
)

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) return ''
  const end = css.indexOf('}', start)
  return css.slice(start, end)
}

describe('barre d’actions des notes', () => {
  it('range les cinq actions en deux colonnes, sans rogner la dernière', () => {
    const actions = rule('.notes-actions')
    expect(actions).toContain('display: grid')
    expect(actions).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
    expect(actions).not.toContain('overflow-x: auto')
    expect(rule('.notes-actions > .action:first-child')).toContain('grid-column: 1 / -1')
  })

  it('ne cache plus un défilement horizontal invisible', () => {
    expect(css).not.toContain('.notes-actions::-webkit-scrollbar')
  })
})
