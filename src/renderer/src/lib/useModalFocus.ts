import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

/** Éléments réellement atteignables : visibles, non désactivés, non masqués. */
function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((node) => {
    if (node.closest('[aria-hidden="true"]')) return false
    const style = window.getComputedStyle(node)
    return style.visibility !== 'hidden' && style.display !== 'none' && node.getClientRects().length > 0
  })
}

/**
 * Focus d'une feuille modale.
 *
 * Une feuille ouverte au clavier gardait le focus derrière elle : la touche Tab
 * parcourait la barre latérale et la page masquées. Ce hook pose le focus dans
 * la feuille, y garde Tab et Shift+Tab, et le rend au déclencheur à la
 * fermeture. Il ne remplace pas Échap, déjà traité par l'application.
 */
export function useModalFocus<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null

    // Après le premier rendu : les champs et boutons de la feuille existent.
    const frame = requestAnimationFrame(() => {
      if (node.contains(document.activeElement)) return
      const items = focusables(node)
      if (items.length > 0) items[0].focus()
      else {
        node.tabIndex = -1
        node.focus()
      }
    })

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return
      // La feuille peut avoir été remplacée par un autre état du panneau
      // (protection d'un site, par exemple) : on relit la référence.
      const root = ref.current
      if (!root) return
      const items = focusables(root)
      if (items.length === 0) {
        event.preventDefault()
        root.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (!root.contains(active)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
        return
      }
      if (event.shiftKey && (active === first || active === root)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown, true)
      if (previous && previous.isConnected) previous.focus()
    }
  }, [])

  return ref
}
