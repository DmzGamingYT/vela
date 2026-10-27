import { useEffect, useState } from 'react'
import { hostOf } from '@shared/url'
import { initials, tintFor } from '../lib/format'

/**
 * Icône d'un site : d'abord celle que la page a déjà mémorisée, sinon le cache
 * local du domaine (`favicons.get`), qui ne contacte que le site lui-même.
 * Aucune requête tierce, et dix montages ne font qu'une demande. Le cache est
 * celui de l'espace : un domaine vu dans « Travail » ne s'invite pas ailleurs.
 */

const memo = new Map<string, Promise<string | null>>()

export function iconRequest(url: string, spaceId = ''): Promise<string | null> {
  const host = hostOf(url)
  if (!host) return Promise.resolve(null)
  const key = `${spaceId}|${host}`
  const pending = memo.get(key)
  if (pending) return pending
  const task = window.vela.favicons.get(host, spaceId).catch(() => null)
  memo.set(key, task)
  return task
}

/** Après une purge du cache, les prochains montages redemandent l'icône. */
export function clearFaviconMemo(): void {
  memo.clear()
}

export default function Favicon({
  src,
  url,
  label,
  size = 16,
  spaceId
}: {
  src?: string | null
  url?: string
  label?: string
  size?: number
  spaceId?: string
}) {
  const [broken, setBroken] = useState(false)
  const [cached, setCached] = useState<string | null>(null)
  const tint = tintFor(label || 'vela')

  useEffect(() => {
    if (src || !url) return
    let alive = true
    void iconRequest(url, spaceId).then((data) => {
      if (alive) setCached(data)
    })
    return () => {
      alive = false
    }
  }, [src, url, spaceId])

  const image = src && !broken ? src : cached

  return (
    <span className="favicon" style={{ color: tint, background: `${tint}1c` }} aria-hidden="true">
      {image ? (
        <img
          src={image}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          referrerPolicy="no-referrer"
          draggable={false}
          onError={() => setBroken(true)}
        />
      ) : (
        <span>{initials(label || '·')}</span>
      )}
    </span>
  )
}
