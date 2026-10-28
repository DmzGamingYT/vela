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

/**
 * Niveaux proposés : « trackers » arrête les domaines de la liste, « strict »
 * arrête en plus les ressources actives servies par un tiers (script, cadre,
 * requête de mesure). Les images, polices et styles restent : un mode
 * renforcé qui casse chaque page ne serait pas utilisable.
 */
export type BlockLevel = 'trackers' | 'strict'

const STRICT_TYPES = new Set(['script', 'subFrame', 'xhr', 'ping', 'media', 'websocket', 'other'])

// Suffixes en deux parties : sans eux, « co.uk » ferait passer deux sites
// distincts pour un même domaine.
const MULTI_SUFFIX = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'com.au',
  'net.au',
  'co.jp',
  'co.kr',
  'com.br',
  'com.mx',
  'co.nz',
  'co.za',
  'com.tr',
  'com.cn',
  'co.in'
])

/** Domaine enregistrable approximatif : les deux (ou trois) derniers labels. */
function registrable(host: string): string {
  const parts = host.split('.')
  if (parts.length <= 2) return host
  // IPv4 : les quatre nombres forment l'adresse entière.
  if (parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part))) return host
  const two = parts.slice(-2).join('.')
  return MULTI_SUFFIX.has(two) ? parts.slice(-3).join('.') : two
}

/** Même site : même domaine enregistrable, sous-domaines compris. */
function sameSite(a: string, b: string): boolean {
  if (!a || !b) return true
  return a === b || registrable(a) === registrable(b)
}

export function isThirdParty(url: string, pageUrl: string): boolean {
  const host = parsedHost(url)
  const page = parsedHost(pageUrl)
  if (!host || !page) return false
  return !sameSite(host, page)
}

export function isStrictType(resourceType: string): boolean {
  return STRICT_TYPES.has(resourceType)
}

/**
 * Décision pure, testable sans Electron : une requête doit-elle être arrêtée ?
 * L'appelant a déjà écarté la navigation principale, les pages d'auth et les
 * sites exemptés.
 */
export function shouldBlock(
  url: string,
  pageUrl: string,
  resourceType: string,
  level: BlockLevel
): boolean {
  if (isTracker(url)) return true
  if (level !== 'strict') return false
  if (!STRICT_TYPES.has(resourceType)) return false
  return isThirdParty(url, pageUrl)
}
