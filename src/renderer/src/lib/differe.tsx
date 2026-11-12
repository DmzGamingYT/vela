import { useEffect, useReducer } from 'react'
import type { ComponentType, JSX } from 'react'

/**
 * Panneau chargé à la demande, sans passer par `Suspense`.
 *
 * `lazy` retient la surface jusqu'à ce que React reprenne le rendu après la
 * promesse : sur ce châssis, la reprise attend le repli du planificateur et
 * coûtait ~300 ms à la première ouverture, même quand le module était déjà en
 * mémoire. Ici, le module est chargé une fois (au repos, cf. `precharger`) et
 * la surface apparaît à l'image suivante ; tant qu'il n'est pas là, elle ne
 * rend rien — le repli était déjà `null`.
 */
export function differe(charger: () => Promise<{ default: ComponentType }>): {
  Panneau: ComponentType
  precharger: () => Promise<void>
} {
  let module: ComponentType | null = null
  let promesse: Promise<void> | null = null

  const precharger = (): Promise<void> =>
    (promesse ??= charger().then((charge) => {
      module = charge.default
    }))

  function Differe(): JSX.Element | null {
    const [, forcer] = useReducer((compteur: number) => compteur + 1, 0)

    useEffect(() => {
      if (module) return
      let vivant = true
      void precharger().then(() => {
        if (vivant) forcer()
      })
      return () => {
        vivant = false
      }
      // `precharger` est stable : une seule tentative par montage.
    }, [])

    if (!module) return null
    const Composant = module
    return <Composant />
  }

  return { Panneau: Differe, precharger }
}
