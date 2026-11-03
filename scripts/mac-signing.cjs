/**
 * Plan de signature d'un bundle macOS, pour une signature ad hoc (sans
 * certificat payant).
 *
 * `codesign --deep` est déprécié depuis macOS 13 : il réécrit la signature des
 * aides et des frameworks au lieu de les préserver, et peut perdre leurs
 * entitlements. On signe donc du plus profond au plus haut — binaires et
 * frameworks imbriqués, puis les .app aidantes, puis le bundle lui-même.
 */
const { readdirSync } = require('node:fs')
const { join } = require('node:path')

/**
 * Tous les éléments d'un bundle à signer, dans l'ordre : les contenus avant
 * leur conteneur, et le bundle en dernier.
 */
function signingPlan(appPath) {
  const cibles = []
  const visiter = (chemin) => {
    let entrees
    try {
      entrees = readdirSync(chemin, { withFileTypes: true })
    } catch {
      return
    }
    for (const entree of entrees) {
      const complet = join(chemin, entree.name)
      if (entree.isDirectory()) {
        visiter(complet)
        if (complet.endsWith('.app') || complet.endsWith('.framework')) cibles.push(complet)
      } else if (complet.endsWith('.dylib') || complet.endsWith('.node')) {
        cibles.push(complet)
      }
    }
  }
  visiter(appPath)
  cibles.push(appPath)
  return cibles
}

module.exports = { signingPlan }
