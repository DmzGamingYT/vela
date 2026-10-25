import { session, webContents, type Session } from 'electron'
import { isAuthPage, isTracker } from './blocklist'
import { chromeUserAgent } from '@shared/userAgent'
import { ACCEPT_LANGUAGES } from './identity'

const attached = new WeakSet<Session>()

/**
 * Filtre local, appliqué à la session d'un espace.
 * `webContentsId` permet de compter les requêtes bloquées par onglet.
 */
export function attachPrivacy(
  ses: Session,
  isEnabled: () => boolean,
  onBlocked: (webContentsId: number) => void
): void {
  if (attached.has(ses)) return
  attached.add(ses)

  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    if (!isEnabled()) return callback({})
    if (details.resourceType === 'mainFrame') return callback({})
    // Pages d'auth : aucune interférence, même sur les requêtes tierces.
    if (details.webContentsId && details.webContentsId > 0) {
      try {
        const pageUrl = webContents.fromId(details.webContentsId)?.getURL() ?? ''
        if (pageUrl && isAuthPage(pageUrl)) return callback({})
      } catch {
        /* doute sur la page : on applique le filtrage normal */
      }
    }
    if (!isTracker(details.url)) return callback({})
    if (details.webContentsId && details.webContentsId > 0) onBlocked(details.webContentsId)
    callback({ cancel: true })
  })

  ses.setPermissionRequestHandler((_contents, permission, callback) => {
    // v0.1 : la navigation n'obtient jamais caméra, micro, position ni notifications.
    const allowed = permission === 'fullscreen' || permission === 'clipboard-sanitized-write'
    callback(allowed)
  })

  ses.setPermissionCheckHandler((_contents, permission) => {
    return permission === 'fullscreen' || permission === 'clipboard-sanitized-write'
  })
}

export function userAgentForPlatform(): string {
  return chromeUserAgent(process.versions.chrome ?? '140.0.0.0', process.platform)
}

export function prepareSession(partition: string): Session {
  const ses = session.fromPartition(partition)
  // Second argument = liste de langues : Chromium construit lui-même les q-values.
  // Passer un en-tête complet ici produisait « fr-FR,fr;q=0.9;q=0.9,… », invalide.
  ses.setUserAgent(userAgentForPlatform(), ACCEPT_LANGUAGES)
  return ses
}
