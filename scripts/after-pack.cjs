const { execFileSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join } = require('node:path')

/**
 * electron-builder `afterPack` hook (macOS uniquement).
 * Sans certificat Developer ID, le bundle garde une signature partielle
 * (« code has no resources but signature indicates they must be present »),
 * ce que Gatekeeper traduit par « Vela est endommagé ».
 * On uniformise avec une signature ad hoc : l'app passe alors au dialogue
 * classique « développeur non vérifié » (clic droit → Ouvrir, ou xattr -cr),
 * au lieu d'un refus bloquant.
 */
exports.default = async function afterPack(context) {
  if (process.platform !== 'darwin') return
  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  if (!existsSync(appPath)) return
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
