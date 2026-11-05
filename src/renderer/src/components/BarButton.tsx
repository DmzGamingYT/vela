import type { ButtonHTMLAttributes } from 'react'
import { Icon, type IconName } from './Icon'

interface BarButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName
  /** Nom accessible : c’est aussi l’infobulle, aucune icône seule sans texte. */
  label: string
  iconSize?: number
  filled?: boolean
  active?: boolean
  tone?: 'plain' | 'ink' | 'accent'
}

/**
 * Bouton de barre d’adresse : 40 px visibles, rayon 20 px, icône 20 px, zone
 * cliquable de 44 × 44 px. Un seul gabarit pour le bouclier, la traduction,
 * l’étoile et les commandes de vue.
 */
export default function BarButton({
  icon,
  label,
  iconSize = 20,
  filled = false,
  active = false,
  tone = 'plain',
  className,
  ...rest
}: BarButtonProps) {
  return (
    <button
      type="button"
      className={className ? `bar-btn ${className}` : 'bar-btn'}
      data-tone={tone}
      data-active={active}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} size={iconSize} filled={filled} />
    </button>
  )
}
