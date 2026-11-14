/**
 * Point d'entrée du filtre de traqueurs : natif Rust quand le binaire est
 * présent, TypeScript sinon (voir `native/vela-blocklist/README.md`).
 *
 * Le repli n'est pas un luxe : clone frais sans `cargo`, binaire compilé pour
 * une autre architecture ou `extraResources` manquant doivent démarrer
 * exactement comme avant. Le choix est fait une fois, au chargement du module,
 * et `index.ts` journalise l'absence du natif dans une app empaquetée.
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import {
  isAuthPage as isAuthPageTs,
  isStrictType as isStrictTypeTs,
  isThirdParty as isThirdPartyTs,
  isTracker as isTrackerTs,
  shouldBlock as shouldBlockTs,
  type BlockLevel
} from './blocklist'

interface NativeModule {
  isTracker(url: string): boolean
  isAuthPage(url: string): boolean
  isThirdParty(url: string, pageUrl: string): boolean
  isStrictType(resourceType: string): boolean
  shouldBlock(url: string, pageUrl: string, resourceType: string, level: string): boolean
}

function loadNative(): NativeModule | null {
  // Le bundle main est CommonJS : un chemin suffit à `createRequire`
  // (pas de `import.meta.url`, indisponible dans ce format).
  const require = createRequire(join(__dirname, 'blocklistNative.js'))
  const candidates = [
    // Dev / build local : la crate vit à la racine du dépôt.
    join(__dirname, '..', '..', 'native', 'vela-blocklist', 'vela-blocklist.node'),
    // App packagée : extraResources de electron-builder.
    join(process.resourcesPath ?? '', 'native', 'vela-blocklist', 'vela-blocklist.node')
  ]
  for (const candidate of candidates) {
    try {
      return require(candidate) as NativeModule
    } catch {
      // Candidat suivant, puis repli TS.
    }
  }
  return null
}

const native = loadNative()

/** Le filtre tourne-t-il en Rust sur cette machine ? (diagnostic, tests) */
export const BLOCKLIST_NATIVE = native !== null

export function isTracker(url: string): boolean {
  return native ? native.isTracker(url) : isTrackerTs(url)
}

export function isAuthPage(url: string): boolean {
  return native ? native.isAuthPage(url) : isAuthPageTs(url)
}

export function isThirdParty(url: string, pageUrl: string): boolean {
  return native ? native.isThirdParty(url, pageUrl) : isThirdPartyTs(url, pageUrl)
}

export function isStrictType(resourceType: string): boolean {
  return native ? native.isStrictType(resourceType) : isStrictTypeTs(resourceType)
}

export function shouldBlock(
  url: string,
  pageUrl: string,
  resourceType: string,
  level: BlockLevel
): boolean {
  return native ? native.shouldBlock(url, pageUrl, resourceType, level) : shouldBlockTs(url, pageUrl, resourceType, level)
}
