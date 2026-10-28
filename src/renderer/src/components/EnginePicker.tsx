import { useRef } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import type { SearchEngineId } from '@shared/types'
import { SEARCH_ENGINES } from '@shared/url'
import { ENGINE_LOOK } from '../lib/engines'
import { BrandMark, ENGINE_BRANDS } from './BrandMark'
import { Icon } from './Icon'

interface EnginePickerProps {
  value: SearchEngineId
  onChange: (id: SearchEngineId) => void
  /** Identifiant du texte qui nomme le groupe (label ou titre de section). */
  labelledBy?: string
  /** Nom direct, quand aucun texte visible ne coiffe le groupe. */
  label?: string
  /** Variante compacte des réglages : logo et libellé sur une ligne. */
  compact?: boolean
}

const IDS = Object.keys(SEARCH_ENGINES) as SearchEngineId[]

/**
 * Choix du moteur de recherche, avec la marque réelle de chacun.
 *
 * Un vrai groupe de boutons radio : une seule entrée dans l'ordre de tabulation,
 * puis les flèches parcourent et choisissent, comme un `select` natif. Le
 * `<select>` d'origine ne pouvait pas afficher d'image dans ses options.
 */
export default function EnginePicker({
  value,
  onChange,
  labelledBy,
  label,
  compact = false
}: EnginePickerProps) {
  const refs = useRef(new Map<SearchEngineId, HTMLButtonElement | null>())
  const columns = compact ? 4 : 3
  const current = IDS.includes(value) ? IDS.indexOf(value) : 0

  const key = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: columns,
      ArrowUp: -columns
    }
    let next: number | null = null
    if (event.key in moves) next = (index + moves[event.key] + IDS.length) % IDS.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = IDS.length - 1
    if (next === null) return
    event.preventDefault()
    const id = IDS[next]
    refs.current.get(id)?.focus()
    onChange(id)
  }

  return (
    <div
      className="engine-grid"
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-label={label}
      data-compact={compact}
    >
      {IDS.map((id, index) => {
        const active = current === index
        const look = ENGINE_LOOK[id]
        return (
          <button
            key={id}
            ref={(node) => {
              if (node) refs.current.set(id, node)
              else refs.current.delete(id)
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={SEARCH_ENGINES[id].label}
            tabIndex={active ? 0 : -1}
            className="engine-tile"
            data-active={active}
            style={{ '--tint': look.tint } as CSSProperties}
            onClick={() => onChange(id)}
            onKeyDown={(event) => key(event, index)}
          >
            <span
              className="engine-mark"
              aria-hidden="true"
              style={{ background: `${look.tint}22`, color: look.tint }}
            >
              <BrandMark brand={ENGINE_BRANDS[id]} size={compact ? 17 : 23} />
            </span>
            <span className="engine-label">{SEARCH_ENGINES[id].label}</span>
            {active && (
              <span className="engine-check">
                <Icon name="check" size={13} />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
