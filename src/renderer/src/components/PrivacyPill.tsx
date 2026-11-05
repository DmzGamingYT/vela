import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

interface PrivacyPillProps {
  /** Requêtes bloquées sur cette page. */
  count: number
  onOpen: () => void
}

const ANNOUNCE_EVERY_MS = 5000

/**
 * Pastille de confidentialité : bouclier seul quand rien n’a été bloqué,
 * bouclier + nombre sinon. Les changements de compteur sont annoncés aux
 * lecteurs d’écran, au plus une fois toutes les cinq secondes : une page qui
 * charge peut en produire des dizaines.
 */
export default function PrivacyPill({ count, onOpen }: PrivacyPillProps) {
  const [announcement, setAnnouncement] = useState('')
  const lastAnnouncement = useRef(0)

  useEffect(() => {
    if (count <= 0) return
    const text = `${count} requête${count > 1 ? 's' : ''} bloquée${count > 1 ? 's' : ''} sur cette page`
    const wait = Math.max(0, ANNOUNCE_EVERY_MS - (Date.now() - lastAnnouncement.current))
    const timer = window.setTimeout(() => {
      lastAnnouncement.current = Date.now()
      setAnnouncement(text)
    }, wait)
    return () => window.clearTimeout(timer)
  }, [count])

  const plural = count > 1 ? 's' : ''
  const label =
    count > 0
      ? `${count} requête${plural} bloquée${plural} sur cette page, voir le détail`
      : 'Aucune requête bloquée'

  return (
    <>
      <button
        type="button"
        className="privacy-pill"
        data-empty={count === 0}
        aria-label={label}
        title={label}
        onClick={onOpen}
      >
        <Icon name="shield" size={20} />
        {count > 0 && (
          <span className="privacy-pill-count" aria-hidden="true">
            {count}
          </span>
        )}
      </button>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
    </>
  )
}
