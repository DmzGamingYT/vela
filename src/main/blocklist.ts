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

export function isTracker(url: string): boolean {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  if (!host || ALLOW.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) return false
  return TRACKER_HOSTS.some((tracker) => host === tracker || host.endsWith(`.${tracker}`))
}
