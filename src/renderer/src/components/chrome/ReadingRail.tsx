import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { APP_SHORTCUTS } from '@shared/shortcuts'
import { hostOf, isHomeUrl } from '@shared/url'
import { shortcut } from '../../lib/format'
import { useBrowser } from '../../store/browser'
import { Icon, type IconName } from '../Icon'

const TOOLTIP_DELAY = 500

interface RailButtonProps {
  label: string
  tip: string
  keys?: string
  icon: IconName
  active?: boolean
  expanded?: boolean
  count?: number
  /** Anneau de progression d’un téléchargement ; `null` tant que la taille
   *  totale est inconnue. */
  ring?: number | null
  /** `off` : la protection est levée sur ce site. */
  shield?: 'off'
  onClick(): void
}

/**
 * Un geste du rail et son infobulle.
 *
 * L'infobulle nomme le geste et son raccourci — sans elle, l'étincelle ne dit
 * pas qu'elle ouvre l'agent. Sa partie accessible ne répète pas le libellé du
 * bouton : le lecteur d'écran annonce « Notes, Raccourci ⌘E ».
 */
function RailButton({
  label,
  tip,
  keys,
  icon,
  active,
  expanded,
  count,
  ring,
  shield,
  onClick
}: RailButtonProps) {
  const id = useId()
  const ref = useRef<HTMLButtonElement>(null)
  const timer = useRef<number | null>(null)
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)

  const clear = (): void => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }

  const hide = (): void => {
    clear()
    setAt(null)
  }

  const show = (): void => {
    if (at) return
    clear()
    timer.current = window.setTimeout(() => {
      const rect = ref.current?.getBoundingClientRect()
      if (!rect) return
      // À gauche du bouton : le rail touche le bord de la fenêtre.
      setAt({ left: rect.left - 10, top: rect.top + rect.height / 2 })
    }, TOOLTIP_DELAY)
  }

  useEffect(() => clear, [])

  return (
    <>
      <button
        ref={ref}
        type="button"
        className="rr-btn"
        data-on={active ? 'true' : undefined}
        data-shield={shield}
        aria-label={label}
        aria-pressed={active}
        aria-expanded={expanded}
        aria-describedby={at ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hide()
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || !at) return
          event.preventDefault()
          event.stopPropagation()
          hide()
        }}
        onClick={() => {
          hide()
          onClick()
        }}
      >
        {ring !== undefined && (
          <svg className="rr-ring" viewBox="0 0 34 34" aria-hidden="true">
            <circle className="download-ring-track" cx="17" cy="17" r="15" />
            <circle
              className="download-ring-fill"
              data-known={ring !== null}
              cx="17"
              cy="17"
              r="15"
              strokeDasharray={
                ring === null ? '23.5 94.25' : `${Math.max(ring, 1) * 0.9425} 94.25`
              }
            />
          </svg>
        )}
        <Icon name={icon} size={20} strokeWidth={1.5} />
        {count ? (
          <span className="rr-count" aria-hidden="true">
            {count}
          </span>
        ) : null}
      </button>

      {at &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            className="dock-tip rr-tip"
            style={{ left: at.left, top: at.top }}
          >
            <span aria-hidden="true" className="dock-tip-text">
              {tip} {keys && <kbd>{keys}</kbd>}
            </span>
            <span className="sr-only">{keys ? `Raccourci ${keys}` : tip}</span>
          </div>,
          document.body
        )}
    </>
  )
}

/**
 * Rail de lecture, à droite de la page.
 *
 * Deux familles, dans cet ordre : en haut les panneaux (notes, agent),
 * séparés par un filet ; en bas les outils de la page (bouclier).
 * Sur l'accueil, il ne reste que les panneaux : sans page, le bouclier n'a
 * rien à protéger, mais les notes et l'agent restent à un clic.
 * Un panneau ouvert garde un fond arrondi, comme l'onglet actif de la barre
 * latérale. Le rail réserve sa bande par `.workspace[data-rail]`.
 */
export default function ReadingRail() {
  const view = useBrowser((state) => state.view)
  const overlay = useBrowser((state) => state.overlay)
  const setOverlay = useBrowser((state) => state.setOverlay)
  const splitToggle = useBrowser((state) => state.splitToggle)

  const tab = view?.tabs.find((item) => item.id === view.activeTabId)
  if (!view || !tab || isHomeUrl(tab.url)) return null

  const host = hostOf(tab.url)
  const exempt = view.privacyExemptions.includes(host)
  const blocked = tab.blocked

  return (
    <nav className="reading-rail" aria-label="Page et lecture">
      {/* Notes et Agent ont rejoint le pied de la barre latérale, avec les
          marque-pages : ce sont des panneaux de l'application, pas des outils
          de la page. Le rail ne garde que ce qui agit sur le volet ouvert. */}
      {/* Les marque-pages ont rejoint le pied de la barre latérale, à côté de
          l'historique : ce qu'on garde et ce qu'on a vu forment une famille. */}

      {/* Les téléchargements ne sont plus ici : le pied de la barre latérale
          les porte, et deux boutons pour un même panneau faisaient doublon. */}
      {/* La vue scindée quitte la pilule du bas : elle range les volets, elle
          appartient donc aux outils de la page. Le store explique lui-même
          pourquoi il refuse une fenêtre trop étroite. */}
      <RailButton
        label="Vue scindée"
        tip="Vue scindée"
        keys={shortcut('⇧D')}
        icon="split"
        active={view.split}
        onClick={() => splitToggle()}
      />
      <span className="rr-sep" aria-hidden="true" />

      <RailButton
        label="Protection de la page"
        tip="Protection"
        keys={shortcut(APP_SHORTCUTS.shield.key)}
        icon="shield"
        active={overlay === 'shield'}
        expanded={overlay === 'shield'}
        shield={exempt ? 'off' : undefined}
        count={blocked || undefined}
        onClick={() => setOverlay(overlay === 'shield' ? null : 'shield')}
      />
    </nav>
  )
}
