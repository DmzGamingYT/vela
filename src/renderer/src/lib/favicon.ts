import { hostOf } from '@shared/url'

/**
 * Choix d'affichage d'un favicon, sans DOM : la tuile d'un épinglé demande la
 * plus grande icône connue, mais ne l'agrandit jamais au-delà de sa taille
 * native. Le cadre de 40 px sert de plafond, pas de taille imposée.
 */

/** Première lettre du domaine, sans « www. » ; `·` si l'adresse est vide. */
export function domainLetter(url: string): string {
  const host = hostOf(url).replace(/^www\./i, '').trim()
  const match = /[a-z0-9]/i.exec(host)
  return (match?.[0] ?? '·').toUpperCase()
}

/** Taille d'affichage : native si elle tient dans le cadre, sinon le cadre. */
export function faviconSize(natural: number, frame: number): number {
  if (!Number.isFinite(natural) || natural <= 0) return frame
  return Math.min(natural, frame)
}

/** Une icône native de 16 ou 32 px reste à sa taille, centrée dans le cadre. */
export function needsUpgrade(natural: number, frame: number): boolean {
  return Number.isFinite(natural) && natural > 0 && natural < frame
}
