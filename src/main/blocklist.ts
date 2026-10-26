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

export function isAuthPage(url: string): boolean {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  if (!host) return false
  return matches(host, AUTH_PAGE_INDEX)
}

export function isTracker(url: string): boolean {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  if (!host || matches(host, ALLOW_INDEX)) return false
  return matches(host, TRACKER_INDEX)
}
