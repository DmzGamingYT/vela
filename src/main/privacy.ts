import { session, type Session } from 'electron'
import { isTracker } from './blocklist'

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
  const chrome = process.versions.chrome ?? '140.0.0.0'
  if (process.platform === 'win32') {
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`
  }
  if (process.platform === 'linux') {
    return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`
  }
  return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`
}

export function prepareSession(partition: string): Session {
  const ses = session.fromPartition(partition)
  ses.setUserAgent(userAgentForPlatform(), 'fr-FR,fr;q=0.9,en;q=0.8')
  return ses
}
