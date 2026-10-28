/**
 * Liste locale de domaines publicitaires et de mesure d'audience.
 * Aucun serveur de filtrage : le blocage se fait dans Chromium, avant la requête.
 */
export const TRACKER_HOSTS: readonly string[] = [
  '2mdn.net',
  '33across.com',
  'adform.net',
  'adnxs.com',
  'adsrvr.org',
  'ads-twitter.com',
  'adservice.google.com',
  'advertising.com',
  'agkn.com',
  'amazon-adsystem.com',
  'amplitude.com',
  'analytics.twitter.com',
  'bidswitch.net',
  'bluekai.com',
  'casalemedia.com',
  'chartbeat.com',
  'criteo.com',
  'criteo.net',
  'crwdcntrl.net',
  'crazyegg.com',
  'demdex.net',
  'doubleclick.net',
  'everesttech.net',
  'exelator.com',
  'facebook.net',
  'fullstory.com',
  'google-analytics.com',
  'googleadservices.com',
  'googlesyndication.com',
  'googletagmanager.com',
  'googletagservices.com',
  'heap.io',
  'hotjar.com',
  'imrworldwide.com',
  'insight.adsrvr.org',
  'krxd.net',
  'mathtag.com',
  'mixpanel.com',
  'moatads.com',
  'moatpixel.com',
  'openx.net',
  'optimizely.com',
  'outbrain.com',
  'parsely.com',
  'pubmatic.com',
  'quantserve.com',
  'rlcdn.com',
  'rubiconproject.com',
  'scorecardresearch.com',
  'segment.com',
  'segment.io',
  'sharethrough.com',
  'smartadserver.com',
  'taboola.com',
  'tapad.com',
  'teads.tv',
  'tynt.com',
  'zeotap.com'
]

const ALLOW: readonly string[] = []
const TRACKER_INDEX = new Set(TRACKER_HOSTS)
const ALLOW_INDEX = new Set(ALLOW)

/**
 * Le domaine ou l'un de ses parents appartient-il à `index` ?
 * Un Set et une poignée de découpes remplacent le balayage de toute la liste,
 * sur le chemin d'une requête : c'est appelé pour chaque ressource de chaque page.
 */
function matches(host: string, index: Set<string>): boolean {
  let candidate = host
  for (;;) {
    if (index.has(candidate)) return true
    const dot = candidate.indexOf('.')
    if (dot < 0) return false
    candidate = candidate.slice(dot + 1)
  }
}

/**
 * Pages d'authentification : le bloqueur s'y désactive entièrement.
 * Les contrôles anti-bot des fournisseurs (Google, Microsoft, Apple, Yahoo)
 * échouent si la moindre requête de la page de connexion est amputée
 * (« navigateur non sécurisé » au moment de valider l'identifiant).
 */
export const AUTH_PAGE_HOSTS: readonly string[] = [
  'accounts.google.com',
  'accounts.youtube.com',
  'myaccount.google.com',
  'login.microsoftonline.com',
  'login.microsoft.com',
  'login.live.com',
  'account.microsoft.com',
  'appleid.apple.com',
  'idmsa.apple.com',
  'login.yahoo.com'
]

const AUTH_PAGE_INDEX = new Set(AUTH_PAGE_HOSTS)

/**
 * Hôte d'une URL sans construire d'objet `URL` (coûteux et alloué pour chaque
 * ressource de chaque page). `new URL` reste le repli des adresses tordues.
 */
function hostOf(url: string): string {
  const scheme = url.indexOf('://')
  if (scheme < 0) return ''
  let start = scheme + 3
  // IPv6 littéral : la lecture manuelle s'arrêterait sur les deux-points.
  if (url.charCodeAt(start) === 91) return ''
  const slash = url.indexOf('/', start)
  const at = url.indexOf('@', start)
  if (at >= 0 && (slash < 0 || at < slash)) start = at + 1
  let end = url.length
  for (let i = start; i < url.length; i += 1) {
    const code = url.charCodeAt(i)
    if (code === 47 || code === 63 || code === 35 || code === 58) {
      end = i
      break
    }
  }
  if (end <= start) return ''
  return url.slice(start, end).toLowerCase()
}

function parsedHost(url: string): string {
  const fast = hostOf(url)
  if (fast) return fast
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

export function isAuthPage(url: string): boolean {
  const host = parsedHost(url)
  if (!host) return false
  return matches(host, AUTH_PAGE_INDEX)
}

export function isTracker(url: string): boolean {
  const host = parsedHost(url)
  if (!host || matches(host, ALLOW_INDEX)) return false
  return matches(host, TRACKER_INDEX)
}
