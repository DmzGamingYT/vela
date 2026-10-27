import { session, webContents, type Session } from 'electron'
import { isAuthPage, isTracker } from './blocklist'
import { applySessionIdentity } from './identity'

const attached = new WeakSet<Session>()

/**
 * Filtre local, appliqué à la session d'un espace.
 * `webContentsId` permet de compter les requêtes bloquées par onglet.
 */
export function attachPrivacy(
  ses: Session,
  isEnabled: () => boolean,
  onBlocked: (webContentsId: number, host: string) => void,
  isExempt: (pageUrl: string) => boolean = () => false
): void {
  if (attached.has(ses)) return
  attached.add(ses)

  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    if (!isEnabled()) return callback({})
    if (details.resourceType === 'mainFrame') return callback({})
    // Test le moins cher d'abord : la quasi-totalité des requêtes d'une page
    // n'est pas un traqueur et repart sans toucher à webContents.
    if (!isTracker(details.url)) return callback({})
    const owner = details.webContentsId && details.webContentsId > 0 ? details.webContentsId : 0
    if (owner) {
      try {
        const pageUrl = webContents.fromId(owner)?.getURL() ?? ''
        // Pages d'auth : aucune interférence, même sur les requêtes tierces.
        if (pageUrl && isAuthPage(pageUrl)) return callback({})
        // Site exempté par l'utilisateur depuis le bouclier.
        if (pageUrl && isExempt(pageUrl)) return callback({})
      } catch {
        /* doute sur la page : on applique le filtrage normal */
      }
      onBlocked(owner, blockedHost(details.url))
    }
    callback({ cancel: true })
  })

  ses.setPermissionRequestHandler((_contents, permission, callback) => {
    // Par défaut : la navigation n’obtient jamais caméra, micro, position ni notifications.
    const allowed = permission === 'fullscreen' || permission === 'clipboard-sanitized-write'
    callback(allowed)
  })

  ses.setPermissionCheckHandler((_contents, permission) => {
    return permission === 'fullscreen' || permission === 'clipboard-sanitized-write'
  })
}

function blockedHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

export function prepareSession(partition: string): Session {
  const ses = session.fromPartition(partition)
  // Identité Chrome complète (UA, langues, client hints) sur chaque requête de
  // l'espace, y compris celles qui ne passent pas par la page.
  applySessionIdentity(ses)
  return ses
}
