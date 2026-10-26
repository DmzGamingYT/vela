import { type Session, type WebContents } from 'electron'
import { chromeUserAgent } from '@shared/userAgent'

/**
 * Identité annoncée par Vela aux sites visités.
 *
 * Trois niveaux doivent être d'accord, sinon Google (entre autres) voit un
 * navigateur embarqué et refuse la connexion :
 *
 * 1. `navigator.userAgent` et `navigator.userAgentData` — l'override CDP les
 *    aligne (chaîne, marques, plateforme, langues).
 * 2. Les en-têtes `User-Agent` et `Sec-CH-UA*` de la navigation — Chromium les
 *    construit à partir de sa propre liste de marques, qui ne contient pas
 *    « Google Chrome » dans Electron. On les réécrit sur la session.
 * 3. Les requêtes qui ne passent pas par la page (favicon, préconnexions,
 *    service workers) — elles prennent `app.userAgentFallback`, posé au
 *    démarrage dans `index.ts`.
 *
 * Sans le point 2, une page Chrome/156 sans aucun client hint est tout aussi
 * suspecte qu'un UA « Electron ».
 */

/** Liste de langues, pas un en-tête : Chromium ajoute lui-même les q-values. */
export const ACCEPT_LANGUAGES = 'fr-FR,fr,en'

/** En-tête équivalent, au cas où Chromium ne l'aurait pas déjà normalisé. */
const ACCEPT_LANGUAGE_HEADER = 'fr-FR,fr;q=0.9,en;q=0.8'

const CHROME_VERSION = process.versions.chrome ?? '140.0.0.0'
const CHROME_MAJOR = CHROME_VERSION.split('.')[0] || '140'

export const CHROME_UA = chromeUserAgent(CHROME_VERSION, process.platform)

const appliedContents = new WeakSet<WebContents>()
const appliedSessions = new WeakSet<Session>()

function platformName(): string {
  if (process.platform === 'win32') return 'Windows'
  if (process.platform === 'linux') return 'Linux'
  return 'macOS'
}

function systemVersion(): string {
  try {
    return process.getSystemVersion() || '10.0.0'
  } catch {
    return '10.0.0'
  }
}

function architecture(): string {
  return process.arch === 'arm64' ? 'arm' : 'x86'
}

const BRANDS = [
  { brand: 'Chromium', version: CHROME_MAJOR },
  { brand: 'Google Chrome', version: CHROME_MAJOR },
  { brand: 'Not_A Brand', version: '8' }
]

const FULL_VERSION_LIST = [
  { brand: 'Chromium', version: CHROME_VERSION },
  { brand: 'Google Chrome', version: CHROME_VERSION },
  { brand: 'Not_A Brand', version: '8.0.0.0' }
]

const lowEntropyBrands = BRANDS.map((entry) => `"${entry.brand}";v="${entry.version}"`).join(', ')
const fullVersionBrands = FULL_VERSION_LIST.map(
  (entry) => `"${entry.brand}";v="${entry.version}"`
).join(', ')

/** Valeurs des client hints, indexées par nom d'en-tête en minuscules. */
const CLIENT_HINTS: Record<string, string> = {
  'sec-ch-ua': lowEntropyBrands,
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': `"${platformName()}"`,
  'sec-ch-ua-arch': `"${architecture()}"`,
  'sec-ch-ua-bitness': '"64"',
  'sec-ch-ua-model': '""',
  'sec-ch-ua-platform-version': `"${systemVersion()}"`,
  'sec-ch-ua-full-version-list': fullVersionBrands,
  'sec-ch-ua-wow64': '?0'
}

/** Les trois hints que Chrome envoie sur toute requête HTTPS. */
const ALWAYS = ['sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform']

/**
 * Session d'un espace : UA, langues et client hints cohérents sur *toutes* les
 * requêtes, y compris celles qui ne passent pas par l'override de la page.
 */
export function applySessionIdentity(ses: Session): void {
  if (appliedSessions.has(ses)) return
  appliedSessions.add(ses)

  try {
    ses.setUserAgent(CHROME_UA, ACCEPT_LANGUAGES)
  } catch {
    /* session déjà utilisée : les en-têtes ci-dessous prennent le relais */
  }

  ses.webRequest.onBeforeSendHeaders(
    { urls: ['http://*/*', 'https://*/*'] },
    (details, callback) => {
      const headers = details.requestHeaders
      headers['User-Agent'] = CHROME_UA
      headers['Accept-Language'] = ACCEPT_LANGUAGE_HEADER

      // Client hints : uniquement en HTTPS, comme Chromium.
      if (details.url.startsWith('https://')) {
        for (const name of ALWAYS) {
          const existing = Object.keys(headers).find((entry) => entry.toLowerCase() === name)
          if (existing && existing !== name) delete headers[existing]
          headers[name] = CLIENT_HINTS[name]
        }
        // Les hints à haute entropie ne partent que si le serveur les demande :
        // on réécrit seulement ceux déjà présents, avec les mêmes valeurs que
        // `navigator.userAgentData`.
        for (const name of Object.keys(CLIENT_HINTS)) {
          if (ALWAYS.includes(name)) continue
          const existing = Object.keys(headers).find((entry) => entry.toLowerCase() === name)
          if (existing) headers[existing] = CLIENT_HINTS[name]
        }
      }

      callback({ requestHeaders: headers })
    }
  )
}

/** Aligne ce que la page lit en JavaScript (UA, client hints, plateforme, langues). */
export function applyBrowserIdentity(contents: WebContents): void {
  if (appliedContents.has(contents) || contents.isDestroyed()) return
  appliedContents.add(contents)

  try {
    contents.setUserAgent(CHROME_UA)
  } catch {
    /* session déjà utilisée : l'override CDP prend le relais */
  }

  try {
    if (!contents.debugger.isAttached()) contents.debugger.attach('1.3')
    void contents.debugger
      .sendCommand('Network.setUserAgentOverride', {
        userAgent: CHROME_UA,
        acceptLanguage: ACCEPT_LANGUAGES,
        platform: platformName(),
        userAgentMetadata: {
          brands: BRANDS,
          fullVersionList: FULL_VERSION_LIST,
          fullVersion: CHROME_VERSION,
          platform: platformName(),
          platformVersion: systemVersion(),
          architecture: architecture(),
          bitness: '64',
          model: '',
          mobile: false,
          wow64: false
        }
      })
      .catch(() => {
        /* protocole indisponible : en-têtes et UA restent alignés */
      })
  } catch {
    /* un débogueur est déjà branché sur cette page : rien à forcer */
  }
}
