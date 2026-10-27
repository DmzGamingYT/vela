import type { UpdateInfo } from './api'

/** Dépôt public des releases : la même source que celle des mises à jour. */
const OWNER = 'DmzGamingYT'
const REPO = 'vela'

/** Une version utilisable dans une URL, sans chemin possible. */
export function safeVersion(version: string): string {
  return version
    .trim()
    .replace(/^v/i, '')
    .replace(/[^0-9A-Za-z.-]/g, '')
}

/**
 * Installateurs macOS publiés, du plus précis au plus général : la version de
 * l'architecture d'abord, l'universelle ensuite. Les noms suivent
 * `artifactName` d'electron-builder, et `macInstallerNames` sert aussi à
 * vérifier qu'un fichier annoncé existe bien avant de le proposer.
 */
export function macInstallerNames(version: string, arch: string): string[] {
  const clean = safeVersion(version)
  if (!clean) return []
  const names: string[] = []
  if (arch === 'arm64' || arch === 'x64') names.push(`Vela-${clean}-${arch}.dmg`)
  names.push(`Vela-${clean}-universal.dmg`)
  return names
}

export function releaseAssetUrl(version: string, asset: string): string {
  return `https://github.com/${OWNER}/${REPO}/releases/download/v${safeVersion(version)}/${asset}`
}

export type UpdateAction = 'install' | 'restart'

export interface UpdateNotice {
  label: string
  action: UpdateAction | null
}

/**
 * Ce que la barre d'état affiche : rien pendant un simple contrôle silencieux,
 * quelque chose dès qu'un téléchargement avance ou qu'une version est prête.
 */
export function updateNotice(info: UpdateInfo | null, isMac: boolean): UpdateNotice | null {
  if (!info) return null
  const version = info.version ? ` ${info.version}` : ''
  switch (info.state) {
    case 'downloaded':
      return { label: `Mise à jour${version} prête`, action: isMac ? 'install' : 'restart' }
    case 'downloading':
      return { label: `Mise à jour${version} · ${info.progress} %`, action: null }
    case 'available':
      return { label: `Mise à jour${version} en préparation`, action: null }
    case 'checking':
      return { label: 'Recherche de mise à jour', action: null }
    default:
      return null
  }
}

export function updateActionLabel(action: UpdateAction): string {
  return action === 'install' ? 'Installer' : 'Redémarrer maintenant'
}

/**
 * Le texte de Réglages › À propos. Sur macOS, l'installation n'est pas
 * silencieuse — Gatekeeper refuse un bundle non signé — donc on dit
 * exactement ce qu'il reste à faire, sans promettre l'inverse.
 */
export function updateDescription(info: UpdateInfo | null, isMac: boolean): string {
  if (!info) return 'Mises à jour automatiques en arrière-plan'
  const version = info.version ?? 'La mise à jour'
  switch (info.state) {
    case 'checking':
      return 'Vérification…'
    case 'available':
      return isMac
        ? `Vela ${info.version ?? ''} — préparation de l’installateur`.trim()
        : `Vela ${info.version ?? ''} — téléchargement en arrière-plan`.trim()
    case 'downloading':
      return `Téléchargement en arrière-plan ${info.progress} %`
    case 'downloaded':
      return isMac
        ? `${version} est téléchargée. Installer ouvre le .dmg : glissez Vela dans Applications, puis relancez.`
        : `${version} s’installe à la fermeture de Vela.`
    case 'not-available':
      return 'Vela est à jour'
    case 'error':
      return info.message ?? 'Mise à jour impossible'
    default:
      return 'Mises à jour automatiques en arrière-plan'
  }
}
