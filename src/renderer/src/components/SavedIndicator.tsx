import { useEffect, useRef, useState } from 'react'

/**
 * Petit accusé de prise en compte dans l'en-tête des réglages.
 *
 * Il ne s'affiche pas au montage : seule une modification réelle doit parler.
 * Les changements rapprochés réarment le même délai, et le texte disparaît
 * après deux secondes. La région reste montée pour que les lecteurs d'écran
 * puissent annoncer son contenu sans perdre le focus.
 */
export default function SavedIndicator({ value }: { value: string }) {
  const [saved, setSaved] = useState(false)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setSaved(true)
    const timer = window.setTimeout(() => setSaved(false), 2000)
    return () => window.clearTimeout(timer)
  }, [value])

  return (
    <span className="settings-saved" role="status" aria-live="polite" aria-atomic="true">
      {saved ? 'Enregistré' : ''}
    </span>
  )
}
