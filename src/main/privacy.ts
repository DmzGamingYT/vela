import { session, webContents, type Session } from 'electron'
import { isAuthPage, isStrictType, isThirdParty, isTracker, type BlockLevel } from './blocklist'
import { applySessionIdentity } from './identity'

const attached = new WeakSet<Session>()

// Partitions réellement ouvertes depuis le démarrage : nettoyer le cache d'un
// espace jamais visité ne sert à rien et créerait sa session pour rien.
const prepared = new Set<string>()

export function preparedPartitions(): Set<string> {
  return prepared
}

/**
 * Filtre local, appliqué à la session d'un espace.
 * `webContentsId` permet de compter les requêtes bloquées par onglet.
 */
export function attachPrivacy(
  ses: Session,
  isEnabled: () => boolean,
  onBlocked: (webContentsId: number, host: string) => void,
  isExempt: (pageUrl: string) => boolean = () => false,
  levelOf: () => BlockLevel = () => 'trackers'
): void {
  if (attached.has(ses)) return
  attached.add(ses)

  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    if (!isEnabled()) return callback({})
    if (details.resourceType === 'mainFrame') return callback({})
    const level = levelOf()
    const tracker = isTracker(details.url)
    // Test le moins cher d'abord : la quasi-totalité des requêtes d'une page
    // n'est ni un traqueur ni une ressource tierce active, et repart ici sans
    // toucher à webContents.
    if (!tracker && (level !== 'strict' || !isStrictType(details.resourceType))) return callback({})
    const owner = details.webContentsId && details.webContentsId > 0 ? details.webContentsId : 0
    let pageUrl = ''
    if (owner) {
      try {
        pageUrl = webContents.fromId(owner)?.getURL() ?? ''
      } catch {
        /* doute sur la page : on applique le filtrage normal */
      }
    }
    // Pages d'auth : aucune interférence, même sur les requêtes tierces.
    if (pageUrl && isAuthPage(pageUrl)) return callback({})
    // Site exempté par l'utilisateur depuis le bouclier.
    if (pageUrl && isExempt(pageUrl)) return callback({})
    // En mode renforcé, seules les ressources actives d'un autre site tombent.
    if (!tracker && !isThirdParty(details.url, pageUrl)) return callback({})
    if (owner) onBlocked(owner, blockedHost(details.url))
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
  // `fromPartition(undefined)` tue le processus principal : on refuse toute
  // valeur qui n'est pas une partition persistante nommée.
  const safe =
    typeof partition === 'string' && /^persist:[a-z0-9._-]{1,64}$/i.test(partition.trim())
      ? partition.trim()
      : 'persist:vela-recovery'
  prepared.add(safe)
  const ses = session.fromPartition(safe)
  // Identité Chrome complète (UA, langues, client hints) sur chaque requête de
  // l'espace, y compris celles qui ne passent pas par la page.
  applySessionIdentity(ses)
  return ses
}
