import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * La CSP du renderer est la première barrière si une page arrive à injecter du
 * contenu dans l'interface. Le script de thème reste le seul inline : son
 * empreinte doit être exacte, sinon le thème flashe au démarrage.
 */
const html = readFileSync(join(process.cwd(), 'src', 'renderer', 'index.html'), 'utf8')
const policy = (html.match(/Content-Security-Policy[^>]*content="([^"]+)"/) || [])[1] || ''
const directive = (name: string): string =>
  policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `)) ?? ''

describe('CSP du renderer', () => {
  it('n’autorise aucun script inline non empreinté', () => {
    expect(directive('script-src')).not.toContain("'unsafe-inline'")
    expect(directive('script-src')).toContain("'self'")
  })

  it('reconnaît exactement le script de thème', () => {
    const inline = html.match(/<script>([\s\S]*?)<\/script>/)
    expect(inline, 'script de thème introuvable').not.toBeNull()
    const hash = createHash('sha256').update(inline![1]).digest('base64')
    expect(directive('script-src')).toContain(`'sha256-${hash}'`)
  })

  it('limite les connexions sortantes aux usages déclarés', () => {
    const connect = directive('connect-src')
    expect(connect).toContain('https://api.open-meteo.com')
    expect(connect).toContain('https://geocoding-api.open-meteo.com')
    // Pas de joker http(s) : une nouvelle destination doit être ajoutée ici.
    expect(connect).not.toMatch(/(^|\s)https?:(\s|$)/)
    expect(connect).not.toContain('wss:')
    expect(connect).not.toContain('*;')
  })
})
