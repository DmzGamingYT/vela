import type { RefObject } from 'react'
import { codeLabel, languageName } from '@shared/language'
import type { TranslationStatus } from '../lib/translation'

interface TranslateButtonProps {
  /** `hidden` n’est jamais rendu : le parent ne monte pas le bouton. */
  status: Exclude<TranslationStatus, 'hidden'>
  source: string | null
  target: string
  /** Fenêtre de traduction ouverte (état « traduite »). */
  expanded?: boolean
  onTranslate: () => void
  onOpen: () => void
  buttonRef?: RefObject<HTMLButtonElement | null>
}

const STATIC_LABELS = {
  running: 'Traduction en cours, cliquer pour annuler',
  error: 'La traduction a échoué, cliquer pour réessayer'
} as const

/**
 * Icône de traduction, dessinée ici et non importée : le glyphe a besoin de
 * `currentColor` et de `--halo`, qui doit valoir exactement la couleur du fond
 * de la pastille pour que le rectangle arrière se fonde dedans.
 */
export function TranslateGlyph({ size = 20 }: { size?: number }) {
  const detailed = size >= 32
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="2.5" width="13" height="11" rx="3.5" />
      <path d="M4.8 13.5v3.2l3-3.2" />
      <path
        d={
          detailed
            ? 'M5.6 5h4.8M8 3.9V5M6.9 5.8c.3 1.3 1.1 2.3 2.4 3M9.8 5.8c-.4 1.3-1.2 2.3-2.6 3'
            : 'M5.8 5.6h4.6M5.8 8h2.6'
        }
      />
      <g fill="var(--halo,#fff)" stroke="var(--halo,#fff)" strokeWidth={4}>
        <rect x="9.5" y="9.5" width="12" height="10.5" rx="3.5" />
        <path d="M17.5 20v2.7l-3.2-2.7z" />
      </g>
      <g fill="currentColor">
        <rect x="9.5" y="9.5" width="12" height="10.5" rx="3.5" />
        <path d="M17.5 20v2.7l-3.2-2.7z" />
      </g>
      <path
        d="M13.4 16.6l2.1-4.6 2.1 4.6M14.2 15h2.6"
        stroke="var(--halo,#fff)"
        strokeWidth={1.6}
      />
    </svg>
  )
}

/**
 * Pastille de traduction, quatre états visibles. Les codes de langue viennent
 * de la détection réelle : aucune paire n’est écrite en dur.
 */
export default function TranslateButton({
  status,
  source,
  target,
  expanded = false,
  onTranslate,
  onOpen,
  buttonRef
}: TranslateButtonProps) {
  const translated = status === 'translated'
  const label = translated
    ? `Traduite en ${languageName(target)}, ouvrir la fenêtre de traduction`
    : status === 'proposed'
      ? `Traduire en ${languageName(target)}`
      : status === 'running'
        ? STATIC_LABELS.running
        : STATIC_LABELS.error

  return (
    <button
      ref={buttonRef}
      type="button"
      className="translate-pill"
      data-state={status}
      aria-label={label}
      aria-expanded={translated ? expanded : undefined}
      title={label}
      onClick={translated ? onOpen : onTranslate}
    >
      <TranslateGlyph size={20} />
      {status === 'proposed' && <span className="translate-pill-label">Traduire</span>}
      {status === 'running' && <span className="translate-spinner" aria-hidden="true" />}
      {status === 'error' && <span className="translate-pill-label">Échec, réessayer</span>}
      {translated && (
        <>
          <span className="translate-pill-label">
            {codeLabel(source)} → {codeLabel(target)}
          </span>
          <span className="translate-caret" aria-hidden="true">
            ⌄
          </span>
        </>
      )}
    </button>
  )
}
