import { useLayoutEffect, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Sortie animée d'un panneau, d'un tiroir ou de la barre de commande.
 *
 * Monté sur un booléen, un panneau disparaissait entre deux images : on ne
 * voyait pas la fermeture, seulement l'absence. Ce composant retient la
 * surface le temps de son animation de sortie (`EXIT_MS`), puis la démonte.
 *
 * Tout passe par `useLayoutEffect`, jamais par un effet ordinaire : un effet
 * ordinaire s'exécute après la peinture, et la fermeture laissait alors une
 * image où le panneau n'existait plus avant de réapparaître pour s'effacer.
 * Ici, l'état est ajusté avant que l'image soit peinte.
 */
export default function Presence({
  open,
  exit = true,
  children
}: {
  open: boolean
  /** `false` quand une autre surface prend la place : la relève est immédiate,
      sinon l'ancien fond assombrirait le panneau qui arrive. */
  exit?: boolean
  children: ReactNode
}) {
  const [held, setHeld] = useState(open)
  const [closing, setClosing] = useState(false)

  useLayoutEffect(() => {
    if (open) {
      setHeld(true)
      setClosing(false)
      return
    }
    // Fermeture : la surface reste montée le temps du fondu de sortie.
    if (held && exit) {
      setClosing(true)
      return
    }
    setHeld(false)
    setClosing(false)
  }, [open, held, exit])

  useLayoutEffect(() => {
    if (!closing) return
    const timer = setTimeout(() => {
      setHeld(false)
      setClosing(false)
    }, EXIT_MS)
    return () => clearTimeout(timer)
  }, [closing])

  if (!open && !held) return null
  return (
    <div className="presence" data-closing={closing ? 'true' : undefined}>
      {children}
    </div>
  )
}

/**
 * Durée de sortie la plus longue de la feuille (`--dur-3`, 220 ms) plus une
 * image de marge : la surface reste montée jusqu'à la fin du fondu.
 */
export const EXIT_MS = 240
