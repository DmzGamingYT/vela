import { useCallback, useEffect, useRef, useState } from 'react'
import type { TabView } from '@shared/types'
import { needsTranslation } from '@shared/language'
import {
  alwaysTranslateFor,
  initialTranslationStatus,
  reduceTranslation,
  setAlwaysTranslateFor,
  translationEngine,
  type TranslationStatus
} from './translation'

export interface PageTranslation {
  status: TranslationStatus
  source: string | null
  target: string
  error: string | null
  always: boolean
  /** Traduire, annuler pendant l’exécution, ou réessayer après un échec. */
  activate(): void
  /** Revenir à la page d’origine ; la pastille repasse à « Traduire ». */
  restore(): void
  setAlways(value: boolean): void
  /** Changer de langue cible ; la page déjà traduite est retraduite. */
  setTarget(code: string): void
}

/**
 * Pilote la traduction d’un onglet. Le moteur est optionnel : sans lui, la
 * pastille reste masquée (`hidden`) plutôt que d’échouer à chaque clic.
 */
export function usePageTranslation(tab: TabView, uiLanguage: string): PageTranslation {
  const engine = translationEngine()
  const source = tab.lang ?? null
  const [target, setTargetState] = useState(uiLanguage)
  const available = Boolean(engine)
  const [status, setStatus] = useState<TranslationStatus>(() =>
    initialTranslationStatus(source, uiLanguage, available)
  )
  const [error, setError] = useState<string | null>(null)
  const [always, setAlwaysState] = useState(() => alwaysTranslateFor(source))
  // Chaque demande porte un numéro : une réponse tardive ne repeint jamais
  // l’état d’une page que l’on a quittée ou dont on a annulé la traduction.
  const request = useRef(0)

  const run = useCallback(
    async (code: string) => {
      if (!engine || !needsTranslation(source, code)) return
      request.current += 1
      const ticket = request.current
      setError(null)
      setStatus((current) => reduceTranslation(current, { type: 'translate' }))
      try {
        const result = await engine.translate(tab.id, code)
        if (ticket !== request.current) return
        if (!result?.ok) {
          setError(result?.error ?? 'La traduction a échoué.')
          setStatus('error')
          return
        }
        setStatus((current) => reduceTranslation(current, { type: 'done' }))
      } catch (cause) {
        if (ticket !== request.current) return
        setError(cause instanceof Error ? cause.message : 'La traduction a échoué.')
        setStatus('error')
      }
    },
    [engine, source, tab.id]
  )

  // Nouvelle page : on repart de l’état de départ, jamais de l’état précédent.
  // La remise à zéro part après le corps de l’effet, pour ne pas faire rendre
  // la coque pendant l’effet ; le ticket évite qu’une page quittée entre-temps
  // ne repeigne l’état de la suivante.
  useEffect(() => {
    request.current += 1
    const ticket = request.current
    queueMicrotask(() => {
      if (ticket !== request.current) return
      setError(null)
      setTargetState(uiLanguage)
      setStatus(initialTranslationStatus(source, uiLanguage, available))
      setAlwaysState(alwaysTranslateFor(source))
    })
  }, [tab.id, tab.url, source, uiLanguage, available])

  const activate = useCallback(() => {
    if (status === 'running') {
      request.current += 1
      setStatus('proposed')
      return
    }
    void run(target)
  }, [run, status, target])

  const restore = useCallback(() => {
    request.current += 1
    setError(null)
    setStatus('proposed')
    void engine?.restore(tab.id)
  }, [engine, tab.id])

  const setAlways = useCallback(
    (value: boolean) => {
      setAlwaysState(value)
      setAlwaysTranslateFor(source, value)
    },
    [source]
  )

  const setTarget = useCallback(
    (code: string) => {
      setTargetState(code)
      if (status === 'translated' || status === 'error') void run(code)
    },
    [run, status]
  )

  // « Toujours traduire » : une seule tentative par page, pour ne pas boucler
  // sur une erreur. La demande part après le corps de l'effet : `run` écrit
  // l'état de la pastille, et un setState pendant l'effet ferait rendre deux
  // fois la coque pour rien.
  useEffect(() => {
    if (!available || !always || status !== 'proposed') return
    queueMicrotask(() => void run(target))
  }, [available, always, status, run, target])

  return { status, source, target, error, always, activate, restore, setAlways, setTarget }
}
