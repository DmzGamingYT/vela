// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TranslateButton from './TranslateButton'

afterEach(cleanup)

const styles = readFileSync(path.join(__dirname, '../styles/29-traduction.css'), 'utf8')

function renderButton(overrides: Partial<Parameters<typeof TranslateButton>[0]> = {}) {
  const onTranslate = vi.fn()
  const onOpen = vi.fn()
  const view = render(
    <TranslateButton
      status="proposed"
      source="en"
      target="fr"
      onTranslate={onTranslate}
      onOpen={onOpen}
      {...overrides}
    />
  )
  return { ...view, onTranslate, onOpen }
}

describe('pastille de traduction', () => {
  it('propose la traduction avec un nom accessible', () => {
    renderButton()
    const button = screen.getByRole('button', { name: 'Traduire en français' })
    expect(button.dataset.state).toBe('proposed')
    expect(button.textContent).toContain('Traduire')
    expect(button.hasAttribute('aria-expanded')).toBe(false)
  })

  it('appelle la traduction au clic', () => {
    const { onTranslate } = renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'Traduire en français' }))
    expect(onTranslate).toHaveBeenCalledTimes(1)
  })

  it('affiche les codes réels à l’état traduit et ouvre la fenêtre', () => {
    const { onOpen } = renderButton({ status: 'translated', source: 'de', expanded: false })
    const button = screen.getByRole('button', { name: /Traduite en français/ })
    expect(button.dataset.state).toBe('translated')
    expect(button.textContent).toContain('DE → FR')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(button)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('reflète l’ouverture de la fenêtre dans aria-expanded', () => {
    renderButton({ status: 'translated', expanded: true })
    expect(screen.getByRole('button', { name: /Traduite en français/ }).getAttribute('aria-expanded')).toBe('true')
  })

  it('reste active pendant la traduction et annule au clic', () => {
    const { onTranslate } = renderButton({ status: 'running' })
    const button = screen.getByRole('button', { name: /Traduction en cours/ })
    expect(button.dataset.state).toBe('running')
    expect(button.disabled).toBe(false)
    expect(button.querySelector('.translate-spinner')).not.toBeNull()
    fireEvent.click(button)
    expect(onTranslate).toHaveBeenCalledTimes(1)
  })

  it('propose de réessayer après un échec', () => {
    renderButton({ status: 'error' })
    const button = screen.getByRole('button', { name: /échoué/ })
    expect(button.dataset.state).toBe('error')
    expect(button.textContent).toContain('Échec, réessayer')
  })

  it('garde --halo synchronisé avec le fond de chaque état', () => {
    for (const state of ['proposed', 'translated', 'running', 'error'] as const) {
      const block = new RegExp(`\\.translate-pill\\[data-state='${state}'\\]\\s*\\{([^}]*)\\}`).exec(styles)
      expect(block, `état ${state}`).not.toBeNull()
      expect(block?.[1]).toMatch(/background:/)
      expect(block?.[1]).toMatch(/--halo:\s*var\(--bar-/)
      expect(block?.[1]).toMatch(/color:/)
    }
  })

  it('dessine l’icône en SVG inline qui lit currentColor et --halo', () => {
    const { container } = renderButton()
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('stroke')).toBe('currentColor')
    expect(container.innerHTML).toContain('var(--halo')
  })
})
