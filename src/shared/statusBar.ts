import type { UpdateChannel, UpdateInfo } from './api'

/**
 * Contenu inconnu tant que les notes de version ne sont pas chargées.
 * La barre ne doit jamais inventer un résumé de changements.
 */
export const RELEASE_NOTES_PLACEHOLDER =
  '[RÉSUMÉ DES CHANGEMENTS — À COMPLÉTER DEPUIS LES NOTES DE VERSION]'

export type StatusBarPhase = 'ready' | 'detail' | 'downloading' | 'error'

export interface StatusBarUi {
  detailOpen: boolean
  /** Version reportée avec « Plus tard » ; null tant que rien n'est reporté. */
  laterVersion: string | null
}

export type StatusBarEvent =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'later'; version: string }

/** Machine à états locale : détail ouvert / fermé, version reportée. */
export function reduceStatusBar(state: StatusBarUi, event: StatusBarEvent): StatusBarUi {
  switch (event.type) {
    case 'open':
      return state.detailOpen ? state : { ...state, detailOpen: true }
    case 'close':
      return state.detailOpen ? { ...state, detailOpen: false } : state
    case 'later':
      return { detailOpen: false, laterVersion: event.version }
    default:
      return state
  }
}

/** Le canal réel prime ; le système ne sert que de repli avant le premier statut. */
export function channelOf(update: UpdateInfo | null, platform: string): UpdateChannel {
  if (update?.channel) return update.channel
  if (platform === 'darwin') return 'mac'
  if (platform === 'win32') return 'windows'
  if (platform === 'linux') return 'linux-package'
  return 'other'
}

/**
 * Le libellé suit ce que le bouton fait réellement :
 * Windows relance l’application, macOS ouvre le .dmg, Linux affiche l’AppImage
 * vérifiée quand Vela ne peut pas remplacer l’installation lui-même.
 */
export function installActionLabel(channel: UpdateChannel, appImageWritable = true): string {
  switch (channel) {
    case 'windows':
      return 'Installer et redémarrer'
    case 'mac':
      return 'Ouvrir le DMG'
    case 'appimage':
      return appImageWritable ? 'Installer et redémarrer' : 'Afficher l’AppImage'
    case 'linux-package':
      return 'Afficher l’AppImage'
    default:
      return 'Voir la version'
  }
}

export interface StatusBarModel {
  phase: StatusBarPhase
  version: string
  readyLabel: string
  downloadingLabel: string
  detailTitle: string
  summary: string
  installLabel: string
  progress: number
  error: string
}

function versionOf(update: UpdateInfo): string {
  return update.version ?? '[version]'
}

/**
 * Vue dérivée de l’état réel de la mise à jour. Aucun état n’est simulé :
 * `available` signifie que le téléchargement automatique commence, et une
 * version reportée disparaît jusqu’au prochain lancement.
 */
export function statusBarView(
  update: UpdateInfo | null,
  platform: string,
  ui: StatusBarUi
): StatusBarModel | null {
  if (!update) return null

  const version = versionOf(update)
  const channel = channelOf(update, platform)
  const common = {
    version,
    summary: RELEASE_NOTES_PLACEHOLDER,
    readyLabel: `Mise à jour ${version} prête`,
    downloadingLabel: `Téléchargement de la ${version}`,
    detailTitle: `Vela ${version} est prête`,
    installLabel: installActionLabel(channel, update.appImageWritable !== false),
    progress: Math.min(100, Math.max(0, Math.round(update.progress))),
    error: update.message ?? 'Le téléchargement a échoué.'
  }

  switch (update.state) {
    case 'downloaded':
      if (ui.laterVersion !== null && ui.laterVersion === (update.version ?? '')) return null
      return { ...common, phase: ui.detailOpen ? 'detail' : 'ready' }
    case 'available':
    case 'downloading':
      return { ...common, phase: 'downloading' }
    case 'error':
      return { ...common, phase: 'error' }
    case 'cancelled':
      return null
    default:
      return null
  }
}
