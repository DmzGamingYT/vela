// `memo` est déjà le nom du cache de requêtes ci-dessous : l'enveloppe React
// entre sous un autre nom pour ne pas l'écraser.
import { memo as memoComponent, useEffect, useRef, useState } from 'react'
import type { CSSProperties, SyntheticEvent } from 'react'
import { hostOf } from '@shared/url'
import { domainLetter, isDarkMonoLogo, needsUpgrade } from '../lib/favicon'
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

const MAX_MEMO_ENTRIES = 256
const memo = new Map<string, Promise<string | null>>()
const memoCached = new Map<string, Promise<string | null>>()

function setBounded<T>(store: Map<string, T>, key: string, value: T): void {
  if (store.size >= MAX_MEMO_ENTRIES) {
    const oldestKey = store.keys().next().value
    if (oldestKey) store.delete(oldestKey)
  }
  store.set(key, value)
}

type PeekWaiter = (value: string | null) => void
interface PeekBatch {
  hosts: Set<string>
  waiters: Map<string, PeekWaiter[]>
}

// Les lignes d'une même liste demandent leur icône dans la même passe : on les
// regroupe par espace et une seule requête ramène tout le lot. L'historique
// ouvrait jusqu'ici un aller-retour IPC par domaine (une soixantaine).
const peekBatches = new Map<string, PeekBatch>()
let peekScheduled = false

function schedulePeek(spaceId: string, host: string, resolve: PeekWaiter): void {
  const batch = peekBatches.get(spaceId) ?? { hosts: new Set<string>(), waiters: new Map() }
  batch.hosts.add(host)
  const waiting = batch.waiters.get(host)
  if (waiting) waiting.push(resolve)
  else batch.waiters.set(host, [resolve])
  peekBatches.set(spaceId, batch)
  if (peekScheduled) return
  peekScheduled = true
  queueMicrotask(flushPeeks)
}

function flushPeeks(): void {
  peekScheduled = false
  const batches = [...peekBatches]
  peekBatches.clear()
  for (const [spaceId, batch] of batches) {
    void window.vela.favicons
      .peekMany([...batch.hosts], spaceId)
      .then((icons) => {
        for (const [host, waiters] of batch.waiters) {
          const icon = icons[host] ?? null
          for (const waiter of waiters) waiter(icon)
        }
      })
      .catch(() => {
        for (const waiters of batch.waiters.values()) for (const waiter of waiters) waiter(null)
      })
  }
}

export function iconRequest(url: string, spaceId = '', cacheOnly = false): Promise<string | null> {
  const host = hostOf(url)
  if (!host) return Promise.resolve(null)
  const key = `${spaceId}|${host}`
  const store = cacheOnly ? memoCached : memo
  const pending = store.get(key)
  if (pending) return pending
  const task = cacheOnly
    ? new Promise<string | null>((resolve) => schedulePeek(spaceId, host, resolve))
    : window.vela.favicons.get(host, spaceId).catch(() => null)
  setBounded(store, key, task)
  return task
}

const memoDark = new Map<string, boolean>()

/** Après une purge du cache, les prochains montages redemandent l'icône. */
export function clearFaviconMemo(): void {
  memo.clear()
  memoCached.clear()
  memoDark.clear()
}

/**
 * Un logo sombre quasi monochrome est invisible sur une tuile sombre : le
 * canvas tranche une seule fois par source, puis le CSS l'inverse en sombre.
 * Une image distante sans CORS teint le canvas : on garde l'icône telle quelle.
 */
function detectDarkMono(image: HTMLImageElement, src: string): boolean {
  const known = memoDark.get(src)
  if (known !== undefined) return known
  let dark = false
  try {
    const side = 24
    const canvas = document.createElement('canvas')
    canvas.width = side
    canvas.height = side
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (context) {
      context.drawImage(image, 0, 0, side, side)
      dark = isDarkMonoLogo(context.getImageData(0, 0, side, side).data)
    }
  } catch {
    dark = false
  }
  setBounded(memoDark, src, dark)
  return dark
}

/**
 * Un seul observateur pour toutes les icônes : la demande réseau attend que
 * l'icône approche de l'écran. L'historique rend jusqu'à cent cinquante lignes
 * dont une douzaine est vue ; une icône demandée n'est plus observée, et
 * `iconRequest` ramène les lignes d'un même domaine à une seule demande.
 */
type Sight = () => void
const watchers = new Map<Element, Sight>()
let watcher: IntersectionObserver | null = null

function watchOnce(element: Element, onSight: Sight): () => void {
  // Sans observateur (environnement de test), on demande sans attendre :
  // l'icône doit arriver dans les cas où rien ne signalera la visibilité.
  if (typeof IntersectionObserver === 'undefined') {
    onSight()
    return () => undefined
  }
  watcher ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const sight = watchers.get(entry.target)
        if (!sight) continue
        watchers.delete(entry.target)
        watcher?.unobserve(entry.target)
        sight()
      }
    },
    { rootMargin: '200px 0px' }
  )
  watchers.set(element, onSight)
  watcher.observe(element)
  return () => {
    watchers.delete(element)
    watcher?.unobserve(element)
  }
}

/**
 * Mémoïsé : ses props sont des valeurs simples, et les listes (historique,
 * favoris, onglets) en montent des dizaines à chaque rendu du parent.
 */
function Favicon({
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
  const [darkMono, setDarkMono] = useState<{ src: string; dark: boolean } | null>(null)
  const [seen, setSeen] = useState(false)
  const node = useRef<HTMLSpanElement | null>(null)
  const upgraded = useRef(false)
  const tint = tintFor(label || hostOf(url ?? '') || 'vela')

  // Ce que l'appareil connaît déjà : lecture locale, sans réseau, même hors
  // écran. Une ligne d'historique garde donc son icône en arrivant.
  useEffect(() => {
    if (src || !url) return
    let alive = true
    void iconRequest(url, spaceId, true).then((data) => {
      if (alive && data) setCached(data)
    })
    return () => {
      alive = false
    }
  }, [src, url, spaceId])

  // Le réseau, lui, attend l'écran : rien ne part pour une ligne jamais vue.
  useEffect(() => {
    const element = node.current
    if (src || !url || cacheOnly || seen || !element) return
    return watchOnce(element, () => setSeen(true))
  }, [src, url, cacheOnly, seen])

  useEffect(() => {
    if (!seen || src || !url) return
    let alive = true
    void iconRequest(url, spaceId).then((data) => {
      if (alive && data) setCached(data)
    })
    return () => {
      alive = false
    }
  }, [seen, src, url, spaceId])

  // La page fournit souvent un 16 ou 32 px. On ne l'agrandit pas : on demande
  // une fois la meilleure icône du site, qui remplacera celle de la page.
  const onLoad = (event: SyntheticEvent<HTMLImageElement>): void => {
    const image = event.currentTarget
    setDarkMono({ src: image.src, dark: detectDarkMono(image, image.src) })
    if (!upgrade || !url || cacheOnly || upgraded.current) return
    const natural = image.naturalWidth
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
      ref={node}
      className="favicon"
      // La teinte sert de graine : la feuille de style la ramène vers l'encre
      // du thème pour que la lettre de secours reste lisible sur les deux fonds.
      style={{ '--favicon-tint': tint } as CSSProperties}
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
          data-dark-mono={darkMono?.src === image && darkMono.dark ? 'true' : undefined}
          onLoad={onLoad}
          onError={() => setFailed((current) => (image ? [...current, image] : current))}
        />
      ) : (
        <span>{fallback}</span>
      )}
    </span>
  )
}

export default memoComponent(Favicon)
