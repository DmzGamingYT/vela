import { type WebContents } from 'electron'
import { chromeUserAgent } from '@shared/userAgent'

/**
 * Identité annoncée par Vela aux sites visités.
 *
 * Le simple remplacement de la chaîne `User-Agent` ne suffit pas : Chromium
 * continue d'exposer `navigator.userAgentData` et d'envoyer `Sec-CH-UA` avec
 * une liste de marques sans « Google Chrome », et `navigator.languages` reste
 * celle du système alors que l'en-tête `Accept-Language` annonce le français.
 * Google lit justement ces signaux pour sa page « Ce navigateur ou cette
 * application ne sont peut-être pas sécurisés ».
 *
 * L'override CDP aligne les quatre d'un coup : chaîne UA, client hints,
 * plateforme et langues.
 */

/** Liste de langues, pas un en-tête : Chromium ajoute lui-même les q-values. */
export const ACCEPT_LANGUAGES = 'fr-FR,fr,en'

const applied = new WeakSet<WebContents>()

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

export function applyBrowserIdentity(contents: WebContents): void {
  if (applied.has(contents) || contents.isDestroyed()) return
  applied.add(contents)

  const version = process.versions.chrome ?? '140.0.0.0'
  const major = version.split('.')[0] || '140'
  const userAgent = chromeUserAgent(version, process.platform)

  try {
    contents.setUserAgent(userAgent)
  } catch {
    /* session déjà utilisée : l'override CDP prend le relais */
  }

  try {
    if (!contents.debugger.isAttached()) contents.debugger.attach('1.3')
    void contents.debugger
      .sendCommand('Network.setUserAgentOverride', {
        userAgent,
        acceptLanguage: ACCEPT_LANGUAGES,
        platform: platformName(),
        userAgentMetadata: {
          brands: [
            { brand: 'Chromium', version: major },
            { brand: 'Google Chrome', version: major },
            { brand: 'Not_A Brand', version: '8' }
          ],
          fullVersionList: [
            { brand: 'Chromium', version },
            { brand: 'Google Chrome', version },
            { brand: 'Not_A Brand', version: '8.0.0.0' }
          ],
          fullVersion: version,
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
        /* protocole indisponible : on garde au moins la chaîne UA et les langues */
      })
  } catch {
    /* un debogueur est deja branche sur cette page : rien a forcer */
  }
}
