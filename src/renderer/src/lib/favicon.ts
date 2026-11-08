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

/**
 * Un logo quasi monochrome sombre (GitHub, Notion…) disparaît sur une tuile
 * sombre : on l'inverse. Les icônes colorées et les logos clairs ne bougent pas.
 * Seuls les pixels opaques comptent ; un fond blanc opaque garde son icône telle
 * quelle, puisque sa luminance moyenne reste haute.
 */
export function isDarkMonoLogo(pixels: Uint8ClampedArray | number[]): boolean {
  let opaque = 0
  let mono = 0
  let luminance = 0
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue
    opaque += 1
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]
    if (Math.max(r, g, b) - Math.min(r, g, b) <= 28) mono += 1
    luminance += 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  if (opaque < 8) return false
  return mono / opaque >= 0.6 && luminance / opaque < 96
}
