import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import SidebarHeader from './SidebarHeader'

/**
 * L'en-tête ne porte plus qu'un nom et la marque de l'app, tous deux
 * décoratifs. La ligne entière reste la zone de déplacement de la fenêtre.
 */
describe('en-tête de la barre latérale', () => {
  const html = renderToStaticMarkup(createElement(SidebarHeader))

  it('garde la ligne comme zone de déplacement', () => {
    expect(html).toContain('class="sidebar-top drag"')
  })

  it('affiche le wordmark avec le point d’accent', () => {
    expect(html).toContain('Azimut')
    expect(html).toContain('class="wordmark-dot"')
  })

  it('porte la marque, une seule, juste avant le mot', () => {
    expect(html.match(/class="wordmark-mark"/g) ?? []).toHaveLength(1)
    expect(html.indexOf('wordmark-mark')).toBeLessThan(html.indexOf('class="wordmark"'))
    // Vectorielle : jamais d'image bitmap dans l'en-tête.
    expect(html).not.toContain('<img')
  })

  it('porte la boussole, pas l’ancienne barque', () => {
    expect(html).toContain('class="boussole"')
    expect(html).toContain('boussole-nord')
    expect(html).toContain('boussole-sud')
    expect(html).toContain('boussole-bg-a')
  })

  it('n’est pas interactif et reste hors de l’ordre de tabulation', () => {
    expect(html).not.toContain('<button')
    expect(html).not.toContain('tabindex')
    expect(html).not.toContain('role=')
    expect(html).toContain('aria-hidden="true"')
  })
})

/**
 * La boussole a deux jeux de teintes dans `82-boussole.css`, choisis par
 * `data-mode` : c'est le mode jour/nuit automatique. Ces clés sont celles des
 * maîtres `build/boussole-light.svg` et `-dark.svg`.
 */
describe('teintes de la boussole', () => {
  const css = readFileSync(join(__dirname, '../../styles/82-boussole.css'), 'utf8')

  it('teinte le fond clair en blanc vers bleu-gris', () => {
    expect(css).toContain('stop-color: #ffffff;')
    expect(css).toContain('stop-color: #c9d3e8;')
  })

  it('bascule tout en mode sombre sous data-mode', () => {
    expect(css).toContain(":root[data-mode='dark'] .boussole-bg-a")
    expect(css).toContain(':root[data-mode=\'dark\'] .boussole-bg-b')
    expect(css).toContain('stop-color: #3c4459;')
    expect(css).toContain('stop-color: #171a24;')
    expect(css).toContain('fill: #ff8a6b;')
  })
})
