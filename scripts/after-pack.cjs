const { execFileSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join } = require('node:path')

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
  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  if (!existsSync(appPath)) return

  if (hasDeveloperIdIdentity()) {
    console.log('[afterPack] identité Developer ID détectée : signature et notarisation par electron-builder')
    return
  }

  try {
    execFileSync(
      'codesign',
      ['--force', '--deep', '--timestamp=none', '--sign', '-', appPath],
      { stdio: 'inherit' }
    )
    execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })
    console.log(`[afterPack] signature ad hoc OK : ${appPath}`)
  } catch (error) {
    console.warn('[afterPack] signature ad hoc impossible, on continue sans :', error.message)
  }
}
