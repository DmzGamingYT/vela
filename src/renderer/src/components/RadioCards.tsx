import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Icon } from './Icon'

export interface ChoiceOption<T extends string> {
  value: T
  label: string
  /** Une ligne d'explication, jamais plus. */
  hint?: string
  disabled?: boolean
  /** Miniature ou pastille affichée à gauche (ou au-dessus en pastille). */
  visual?: ReactNode
  /** Nom accessible quand le libellé visible ne suffit pas. */
  ariaLabel?: string
}

interface Props<T extends string> {
  ariaLabel: string
  value: T
  options: ChoiceOption<T>[]
  onChange: (value: T) => void
  variant?: 'card' | 'swatch' | 'segment'
  className?: string
}

/**
 * Groupe de cartes à choix unique, au clavier complet.
 *
 * Un seul onglet s'arrête dans le groupe (tabindex mobile) ; les flèches
 * parcourent les options et les choisissent, comme un groupe de boutons radio
 * natifs. Espace et Entrée gardent le comportement du bouton. Le style de
 * sélection est le même partout : contour d'accent et coche.
 */
export default function RadioCards<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  variant = 'card',
  className = ''
}: Props<T>) {
  const refs = useRef(new Map<string, HTMLButtonElement>())
  const enabled = options.filter((option) => !option.disabled)
  const selected = options.find((option) => option.value === value && !option.disabled)
  const tabbable = selected?.value ?? enabled[0]?.value

  const focusAt = (index: number): void => {
    const option = enabled[(index + enabled.length) % enabled.length]
    if (!option) return
    refs.current.get(option.value)?.focus()
    onChange(option.value)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: T): void => {
    const index = enabled.findIndex((option) => option.value === current)
    if (index < 0) return
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault()
        focusAt(index + 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault()
        focusAt(index - 1)
        break
      case 'Home':
        event.preventDefault()
        focusAt(0)
        break
      case 'End':
        event.preventDefault()
        focusAt(enabled.length - 1)
        break
      default:
        break
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`choice-grid choice-${variant} ${className}`.trim()}
      data-variant={variant}
    >
      {options.map((option) => {
        const active = option.value === value && !option.disabled
        return (
          <button
            key={option.value}
            ref={(node) => {
              if (!node) refs.current.delete(option.value)
              else refs.current.set(option.value, node)
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.ariaLabel}
            aria-disabled={option.disabled || undefined}
            disabled={option.disabled}
            tabIndex={option.value === tabbable ? 0 : -1}
            className="choice"
            data-active={active}
            onClick={() => {
              if (option.disabled) return
              onChange(option.value)
            }}
            onKeyDown={(event) => onKeyDown(event, option.value)}
          >
            {option.visual && (
              <span className="choice-visual" aria-hidden="true">
                {option.visual}
              </span>
            )}
            <span className="choice-copy">
              <span className="choice-name">
                {option.label}
                {active && <Icon name="check" size={13} />}
              </span>
              {option.hint && <span className="choice-hint">{option.hint}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
