import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(process.cwd(), 'src/renderer/src/styles/07-notes-reglages-dialogue.css'), 'utf8')

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) return ''
  const end = css.indexOf('}', start)
  return css.slice(start, end)
}

describe('barre d’actions des notes', () => {
  it('passe à la ligne au lieu de rogner la dernière action', () => {
    const actions = rule('.notes-actions')
    expect(actions).toContain('flex-wrap: wrap')
    expect(actions).not.toContain('overflow-x: auto')
  })

  it('ne cache plus un défilement horizontal invisible', () => {
    expect(css).not.toContain('.notes-actions::-webkit-scrollbar')
  })
})
