import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-color-scheme: dark)'

function media(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(QUERY)
}

function subscribe(onChange: () => void): () => void {
  const query = media()
  if (!query) return () => {}
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function snapshot(): boolean {
  return media()?.matches ?? false
}

/**
 * Suit `prefers-color-scheme` pendant que la fenêtre est ouverte.
 *
 * Le mode « Système » ne suffit pas à lui seul : le châssis réapplique ses
 * jetons sur l'événement média, mais l'aperçu des réglages doit aussi changer
 * de mode sans fermer la feuille. `useSyncExternalStore` évite un état local
 * qui se désynchronise de la requête média.
 */
export function useSystemDark(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
