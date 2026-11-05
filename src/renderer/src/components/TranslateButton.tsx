import { useEffect, useState, type CSSProperties } from 'react'
import { translateTileTokens } from '../lib/translateTile'
import { Icon } from './Icon'

interface TranslateButtonProps {
  active?: boolean
  disabled?: boolean
  onClick?: () => void
  title?: string
}

function readDarkMode(): boolean {
  return document.documentElement.dataset.mode !== 'light'
}

/**
 * Tuile de traduction : 56 × 56, halo synchronisé avec le fond dans chaque
 * état. Le SVG reste décoratif : le bouton porte seul le nom accessible.
 */
export default function TranslateButton({
  active = false,
  disabled = false,
  onClick,
  title = 'Traduire cette page'
}: TranslateButtonProps) {
  const [dark, setDark] = useState(readDarkMode)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)

  // Le thème est posé sur <html data-mode> par App.tsx, pas dans ce composant.
  useEffect(() => {
    const root = document.documentElement
    const sync = (): void => setDark(root.dataset.mode !== 'light')
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['data-mode'] })
    return () => observer.disconnect()
  }, [])

  const state = disabled ? 'disabled' : active ? 'active' : hovered ? 'hover' : focused ? 'focus' : 'rest'
  const tokens = translateTileTokens(state, dark ? 'dark' : 'light')
  const style = {
    '--halo': tokens.halo,
    '--translate-background': tokens.background,
    '--translate-color': tokens.color,
    '--translate-border': tokens.border,
    '--translate-accent': tokens.accent
  } as CSSProperties

  return (
    <button
      type="button"
      className="translate-btn"
      data-state={state}
      data-active={active}
      aria-label="Traduire cette page"
      aria-pressed={active}
      disabled={disabled}
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={style}
    >
      <Icon name="translate" size={24} />
    </button>
  )
}
