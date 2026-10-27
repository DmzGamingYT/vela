/**
 * Micro et enregistrement : ce qui est décidé avant d'appeler le système.
 *
 * Ces fonctions sont pures pour être testées sans Electron : le message exact
 * d'un refus d'autorisation, le format de durée, et le type d'audio retenu.
 */

export type MicFailure = 'denied' | 'missing' | 'insecure' | 'unsupported' | 'busy' | 'unknown'

export interface MicProblem {
  reason: MicFailure
  message: string
  /** true quand seuls les réglages du système peuvent débloquer la situation. */
  system: boolean
}

/**
 * Traduit l'erreur d'un `getUserMedia` refusé en message actionnable. Aucune
 * erreur n'est propagée : l'interface affiche ce texte et s'arrête là.
 */
export function describeMicError(error: unknown): MicProblem {
  const name = typeof error === 'object' && error && 'name' in error ? String((error as Error).name) : ''
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return {
      reason: 'denied',
      message:
        'L’accès au micro a été refusé. Autorisez le micro pour Vela dans Réglages Système › Confidentialité et sécurité › Microphone, puis réessayez.',
      system: true
    }
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      reason: 'missing',
      message: 'Aucun micro n’est branché. Branchez-en un, puis réessayez.',
      system: true
    }
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return {
      reason: 'busy',
      message: 'Le micro est déjà utilisé par une autre application. Fermez-la, puis réessayez.',
      system: false
    }
  }
  if (name === 'OverconstrainedError') {
    return { reason: 'missing', message: 'Ce micro ne peut pas être ouvert par Vela.', system: true }
  }
  return {
    reason: 'unknown',
    message: 'Le micro n’a pas pu être ouvert. Rien n’a été enregistré.',
    system: false
  }
}

/** Durée lisible : 0:07, 12:40, 1:02:03. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

const CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/mpeg']

/**
 * Type d'enregistrement accepté par le moteur, ou chaîne vide s'il n'en
 * annonce aucun (MediaRecorder choisira seul).
 */
export function pickAudioMime(supported: (mime: string) => boolean): string {
  for (const mime of CANDIDATES) {
    try {
      if (supported(mime)) return mime
    } catch {
      /* type inconnu du moteur : on essaie le suivant */
    }
  }
  return ''
}

/** L'enregistrement ne doit pas dépasser cette taille (25 Mo, ≈ 25 min). */
export const MAX_RECORDING_BYTES = 25 * 1024 * 1024

/** Message d'état de l'enregistreur, lisible par un lecteur d'écran. */
export function recorderStatus(stage: 'intro' | 'recording' | 'paused' | 'saving' | 'error'): string {
  switch (stage) {
    case 'recording':
      return 'Enregistrement en cours'
    case 'paused':
      return 'Enregistrement en pause'
    case 'saving':
      return 'Enregistrement terminé, écriture sur le disque'
    case 'error':
      return 'Enregistrement impossible'
    default:
      return 'Prêt à enregistrer'
  }
}
