import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
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
    expect(html).toContain('Vela')
    expect(html).toContain('class="wordmark-dot"')
  })

  it('porte la marque, une seule, juste avant le mot', () => {
    expect(html.match(/class="wordmark-mark"/g) ?? []).toHaveLength(1)
    expect(html.indexOf('wordmark-mark')).toBeLessThan(html.indexOf('class="wordmark"'))
    // Vectorielle : jamais d'image bitmap dans l'en-tête.
    expect(html).not.toContain('<img')
  })

  it('n’est pas interactif et reste hors de l’ordre de tabulation', () => {
    expect(html).not.toContain('<button')
    expect(html).not.toContain('tabindex')
    expect(html).not.toContain('role=')
    expect(html).toContain('aria-hidden="true"')
  })
})
