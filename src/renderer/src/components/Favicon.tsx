import { useEffect, useRef, useState } from 'react'
import type { SyntheticEvent } from 'react'
import { hostOf } from '@shared/url'
import { domainLetter, needsUpgrade } from '../lib/favicon'
import { initials, tintFor } from '../lib/format'

/**
 * Icône d'un site : d'abord celle que la page a déjà mémorisée, sinon le cache
 * local du domaine (`favicons.get`), qui ne contacte que le site lui-même.
 * Aucune requête tierce, et dix montages ne font qu'une demande. Le cache est
 * celui de l'espace : un domaine vu dans « Travail » ne s'invite pas ailleurs.
 *
 * `upgrade` demande la meilleure icône du site quand celle de la page est plus
 * petite que le cadre (16 ou 32 px) : le cache lit alors l'Apple Touch ou le
 * manifeste. Une petite icône n'est jamais agrandie au-delà de sa taille native.
 */

const memo = new Map<string, Promise<string | null>>()
const memoCached = new Map<string, Promise<string | null>>()

export function iconRequest(url: string, spaceId = '', cacheOnly = false): Promise<string | null> {
  const host = hostOf(url)
  if (!host) return Promise.resolve(null)
  const key = `${spaceId}|${host}`
  const store = cacheOnly ? memoCached : memo
  const pending = store.get(key)
  if (pending) return pending
  const task = (
    cacheOnly ? window.vela.favicons.peek(host, spaceId) : window.vela.favicons.get(host, spaceId)
  ).catch(() => null)
  store.set(key, task)
  return task
}

/** Après une purge du cache, les prochains montages redemandent l'icône. */
export function clearFaviconMemo(): void {
  memo.clear()
  memoCached.clear()
}

export default function Favicon({
  src,
  url,
  label,
  size = 16,
  spaceId,
  cacheOnly = false,
  upgrade = false,
  letter = 'initials'
}: {
  src?: string | null
  url?: string
  label?: string
  size?: number
  spaceId?: string
  /** Aucune requête : seulement l'icône déjà mémorisée sur l'appareil. */
  cacheOnly?: boolean
  /** Demande la meilleure icône si celle de la page est plus petite que `size`. */
  upgrade?: boolean
  /** Lettre de secours : initiales du titre ou première lettre du domaine. */
  letter?: 'initials' | 'domain'
}) {
  const [failed, setFailed] = useState<string[]>([])
  const [better, setBetter] = useState<string | null>(null)
  const [cached, setCached] = useState<string | null>(null)
  const upgraded = useRef(false)
  const tint = tintFor(label || hostOf(url ?? '') || 'vela')

  useEffect(() => {
    if (src || !url) return
    const address = url
    let alive = true
    void iconRequest(address, spaceId, cacheOnly).then((data) => {
      if (alive) setCached(data)
    })
    return () => {
      alive = false
    }
  }, [src, url, spaceId, cacheOnly])

  // La page fournit souvent un 16 ou 32 px. On ne l'agrandit pas : on demande
  // une fois la meilleure icône du site, qui remplacera celle de la page.
  const onLoad = (event: SyntheticEvent<HTMLImageElement>): void => {
    if (!upgrade || !url || cacheOnly || upgraded.current) return
    const natural = event.currentTarget.naturalWidth
    if (!needsUpgrade(natural, size)) return
    upgraded.current = true
    void iconRequest(url, spaceId).then((data) => {
      if (data) setBetter(data)
    })
  }

  const usable = (value: string | null | undefined): value is string =>
    Boolean(value && !failed.includes(value))
  const image = usable(better) ? better : usable(src) ? src : usable(cached) ? cached : null
  const fallback = letter === 'domain' ? domainLetter(url ?? '') : initials(label || '·')

  return (
    <span
      className="favicon"
      style={{ color: tint, background: `${tint}1c` }}
      data-fallback={image ? undefined : 'true'}
      data-native={upgrade ? 'true' : undefined}
      aria-hidden="true"
    >
      {image ? (
        <img
          src={image}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          referrerPolicy="no-referrer"
          draggable={false}
          onLoad={onLoad}
          onError={() => setFailed((current) => (image ? [...current, image] : current))}
        />
      ) : (
        <span>{fallback}</span>
      )}
    </span>
  )
}
