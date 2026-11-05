// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Icon } from './Icon'
import TranslateButton from './TranslateButton'

beforeEach(() => {
  document.documentElement.dataset.mode = 'light'
})

afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.mode
})

function tile(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Traduire cette page' })
}

function expectSynced(button: HTMLButtonElement): void {
  expect(button.style.getPropertyValue('--halo')).toBe(
    button.style.getPropertyValue('--translate-background')
  )
}

describe('bouton de traduction', () => {
  it('rend le repos dans une tuile de 56 px', () => {
    render(<TranslateButton />)
    const button = tile()
    expect(button.dataset.state).toBe('rest')
    expect(button.style.getPropertyValue('--halo')).toBe('#ffffff')
    expect(button.style.getPropertyValue('--translate-background')).toBe('#ffffff')
    expect(button.style.getPropertyValue('--translate-color')).toBe('#1c1b1a')
    expectSynced(button)
  })

  it('synchronise le halo au survol', () => {
    render(<TranslateButton />)
    const button = tile()
    fireEvent.mouseEnter(button)
    expect(button.dataset.state).toBe('hover')
    expect(button.style.getPropertyValue('--translate-color')).toBe('var(--clay)')
    expectSynced(button)
  })

  it('synchronise le halo au focus clavier', () => {
    render(<TranslateButton />)
    const button = tile()
    fireEvent.focusIn(button)
    expect(button.dataset.state).toBe('focus')
    expectSynced(button)
  })

  it('passe à l’accent plein quand la traduction est active', () => {
    render(<TranslateButton active />)
    const button = tile()
    expect(button.dataset.state).toBe('active')
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.style.getPropertyValue('--translate-background')).toBe('var(--clay)')
    expect(button.style.getPropertyValue('--translate-color')).toBe('#ffffff')
    expectSynced(button)
  })

  it('atténue l’encre sans changer le halo quand le bouton est désactivé', () => {
    render(<TranslateButton disabled />)
    const button = tile()
    expect(button.dataset.state).toBe('disabled')
    expect(button.disabled).toBe(true)
    expect(button.style.getPropertyValue('--translate-color')).toContain('40%')
    expectSynced(button)
  })

  it('suit le fond sombre et garde un halo de la même couleur', () => {
    document.documentElement.dataset.mode = 'dark'
    render(<TranslateButton />)
    const button = tile()
    expect(button.style.getPropertyValue('--translate-background')).toBe('#211f1d')
    expect(button.style.getPropertyValue('--translate-color')).toBe('#f4f1ec')
    expectSynced(button)
  })

  it('garde l’icône décorative et le bouton natif au clavier', () => {
    const onClick = vi.fn()
    const { container } = render(<TranslateButton onClick={onClick} />)
    const button = tile()
    const svg = container.querySelector('svg')
    expect(button.tabIndex).toBe(0)
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(svg?.getAttribute('role')).toBeNull()
    expect(svg?.getAttribute('aria-label')).toBeNull()
    expect(svg?.getAttribute('width')).toBe('24')
    expect(svg?.getAttribute('stroke-width')).toBe('1.7')
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('épaissit le trait quand l’icône descend sous 20 px', () => {
    const { container } = render(<Icon name="translate" size={15} />)
    expect(container.querySelector('svg')?.getAttribute('stroke-width')).toBe('1.9')
  })
})
