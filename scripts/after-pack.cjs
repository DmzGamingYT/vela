const { execFileSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join } = require('node:path')
const { signingPlan } = require('./mac-signing.cjs')

/**
 * electron-builder `afterPack` hook (macOS uniquement).
 *
 * Deux cas de figure :
 *
 * 1. Un certificat Developer ID est disponible (CSC_LINK/CSC_NAME ou identité
 *    trouvée dans le trousseau). electron-builder signe alors l'app juste après
 *    ce hook : on ne touche à rien, sinon on risquerait de casser la chaîne de
 *    signature avant la notarisation.
 *
 * 2. Aucun certificat. electron-builder ne signe pas du tout, et Gatekeeper
 *    affiche « Vela est endommagé ». On applique une signature ad hoc complète :
 *    l'app affiche le dialogue classique « développeur non vérifié »
 *    (clic droit → Ouvrir, ou `xattr -cr /Applications/Vela.app`).
 *
 * La signature ad hoc se fait du plus profond au plus haut, sans `--deep` :
 * déprécié depuis macOS 13, il réécrit les signatures imbriquées au lieu de les
 * préserver. En cas d'échec seulement, on retombe sur l'ancien chemin.
 */
function hasDeveloperIdIdentity() {
  if (process.env.CSC_LINK || process.env.CSC_NAME) return true
  try {
    const out = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
      encoding: 'utf8'
    })
    return /Developer ID Application/.test(out)
  } catch {
    return false
  }
}

exports.default = async function afterPack(context) {
  if (process.platform !== 'darwin') return

  // Build universel : @electron/universal assemble deux bundles temporaires
  // (`…-arm64-temp`, `…-x64-temp`) et exige que tous leurs fichiers non
  // binaires soient identiques. Une signature ad hoc ici réécrit
  // `_CodeSignature/CodeResources` et casse la fusion. On ignore donc les
  // dossiers temporaires : le bundle fusionné repasse par ce hook, et c'est
  // lui qu'on signe.
  if (/-temp$/.test(context.appOutDir)) return

  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  if (!existsSync(appPath)) return

  if (hasDeveloperIdIdentity()) {
    console.log(
      '[afterPack] identité Developer ID détectée : signature et notarisation par electron-builder'
    )
    return
  }

  try {
    for (const cible of signingPlan(appPath)) {
      execFileSync('codesign', ['--force', '--timestamp=none', '--sign', '-', cible], {
        stdio: 'inherit'
      })
    }
    execFileSync('codesign', ['--verify', '--strict', appPath], { stdio: 'inherit' })
    console.log(`[afterPack] signature ad hoc OK : ${appPath}`)
    return
  } catch (error) {
    console.warn('[afterPack] signature explicite impossible, repli sur --deep :', error.message)
  }

  try {
    execFileSync('codesign', ['--force', '--deep', '--timestamp=none', '--sign', '-', appPath], {
      stdio: 'inherit'
    })
    execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })
    console.log(`[afterPack] signature ad hoc de secours OK : ${appPath}`)
  } catch (error) {
    console.warn('[afterPack] signature ad hoc impossible, on continue sans :', error.message)
  }
}
