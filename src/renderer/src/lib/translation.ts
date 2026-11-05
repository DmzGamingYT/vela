import { needsTranslation } from '@shared/language'

/**
 * Machine à états de la traduction de page.
 *
 * Cinq états seulement : `hidden` (rien à proposer), `proposed` (pastille
 * « Traduire »), `running` (traduction en cours, clic = annuler), `translated`
 * (la page est traduite, la pastille ouvre la fenêtre) et `error` (échec, clic
 * = réessayer).
 */
export type TranslationStatus = 'hidden' | 'proposed' | 'running' | 'translated' | 'error'

export type TranslationEvent =
  | { type: 'translate' }
  | { type: 'done' }
  | { type: 'fail' }
  | { type: 'restore' }
  | { type: 'hide' }

/** Le moteur de traduction vit dans le processus principal ; l'interface ne
 *  connaît que ce contrat. Il est absent tant qu'aucun moteur n'est branché. */
export interface TranslationEngine {
  translate(
    tabId: string,
    target: string
  ): Promise<{ ok: boolean; source?: string | null; error?: string }>
  restore(tabId: string): Promise<void>
}

export function translationEngine(): TranslationEngine | null {
  const bridge = (window.vela as unknown as { page?: Partial<TranslationEngine> } | undefined)?.page
  if (!bridge) return null
  return typeof bridge.translate === 'function' && typeof bridge.restore === 'function'
    ? (bridge as TranslationEngine)
    : null
}

/** État de départ : la pastille n'apparaît que si un moteur existe et que la
 *  page est dans une autre langue que l'interface. */
export function initialTranslationStatus(
  pageLang: string | null | undefined,
  uiLang: string,
  engineAvailable: boolean
): TranslationStatus {
  return engineAvailable && needsTranslation(pageLang, uiLang) ? 'proposed' : 'hidden'
}

export function reduceTranslation(
  status: TranslationStatus,
  event: TranslationEvent
): TranslationStatus {
  switch (event.type) {
    case 'hide':
      return 'hidden'
    case 'restore':
      return status === 'running' || status === 'translated' || status === 'error'
        ? 'proposed'
        : status
    case 'translate':
      // Une pastille « en cours » reste active : le même clic annule.
      return status === 'running' ? 'proposed' : 'running'
    case 'done':
      return status === 'running' ? 'translated' : status
    case 'fail':
      return 'error'
    default:
      return status
  }
}

/**
 * « Toujours traduire » est mémorisé par langue source (choix retenu faute de
 * décision produit : par site demanderait de rejouer les réglages à chaque
 * navigation, et la décision se prend surtout sur la langue lue).
 */
const PREFIX = 'vela:translate:always:'

export function alwaysTranslateFor(source: string | null | undefined): boolean {
  const code = (source ?? '').trim().toLowerCase()
  if (!code) return false
  try {
    return window.localStorage.getItem(`${PREFIX}${code}`) === '1'
  } catch {
    return false
  }
}

export function setAlwaysTranslateFor(source: string | null | undefined, value: boolean): void {
  const code = (source ?? '').trim().toLowerCase()
  if (!code) return
  try {
    if (value) window.localStorage.setItem(`${PREFIX}${code}`, '1')
    else window.localStorage.removeItem(`${PREFIX}${code}`)
  } catch {
    /* stockage refusé : le réglage ne survit pas, la traduction reste manuelle */
  }
}
