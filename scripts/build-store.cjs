/**
 * Construit la crate `native/vela-store` et copie la bibliothèque produite en
 * `vela-store.node`, à côté de la crate (nom attendu par `require`).
 *
 * Usage : node scripts/build-store.cjs
 */
const { execFileSync } = require('node:child_process')
const { copyFileSync, existsSync } = require('node:fs')
const { join } = require('node:path')

const ROOT = join(__dirname, '..')
const CRATE = join(ROOT, 'native', 'vela-store')
const OUT = join(CRATE, 'vela-store.node')

execFileSync('cargo', ['build', '--release', '--manifest-path', join(CRATE, 'Cargo.toml')], {
  stdio: 'inherit'
})

// Nom produit par le linker selon la plateforme.
const names =
  process.platform === 'darwin'
    ? ['libvela_store.dylib']
    : process.platform === 'win32'
      ? ['vela_store.dll']
      : ['libvela_store.so']

const built = names.map((name) => join(CRATE, 'target', 'release', name)).find(existsSync)
if (!built) {
  console.error(`Bibliothèque introuvable (cherché : ${names.join(', ')})`)
  process.exit(1)
}

copyFileSync(built, OUT)
console.log(`OK : ${OUT}`)
