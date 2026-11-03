import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

/**
 * La signature ad hoc du bundle macOS se fait sans `--deep`, du plus profond au
 * plus haut : signer un conteneur avant son contenu invaliderait la signature
 * du contenu.
 */
const require = createRequire(import.meta.url)
const { signingPlan } = require('../../scripts/mac-signing.cjs') as {
  signingPlan: (path: string) => string[]
}

const racine = mkdtempSync(join(tmpdir(), 'vela-sign-'))
afterAll(() => rmSync(racine, { recursive: true, force: true }))

const fichier = (chemin: string): void => {
  mkdirSync(join(chemin, '..'), { recursive: true })
  writeFileSync(chemin, 'binaire')
}

const app = join(racine, 'Vela.app')
const aide = join(app, 'Contents', 'Frameworks', 'Vela Helper.app')
const framework = join(app, 'Contents', 'Frameworks', 'Electron Framework.framework')

fichier(join(app, 'Contents', 'MacOS', 'Vela'))
fichier(join(aide, 'Contents', 'MacOS', 'Vela Helper'))
fichier(join(framework, 'Versions', 'A', 'Electron Framework'))
fichier(join(app, 'Contents', 'Resources', 'app.asar.unpacked', 'natif.node'))
fichier(join(app, 'Contents', 'Frameworks', 'libEGL.dylib'))

describe('signingPlan', () => {
  it('signe le contenu avant son conteneur, et le bundle en dernier', () => {
    const plan = signingPlan(app)
    expect(plan.at(-1)).toBe(app)
    expect(plan).toContain(aide)
    expect(plan).toContain(framework)
    expect(plan.indexOf(aide)).toBeLessThan(plan.indexOf(app))
    expect(plan.indexOf(framework)).toBeLessThan(plan.indexOf(app))
  })

  it('attrape les binaires natifs et les bibliothèques', () => {
    const plan = signingPlan(app)
    expect(plan.filter((cible) => cible.endsWith('.node'))).toHaveLength(1)
    expect(plan.filter((cible) => cible.endsWith('.dylib'))).toHaveLength(1)
  })

  it('ne signe rien en double', () => {
    const plan = signingPlan(app)
    expect(new Set(plan).size).toBe(plan.length)
  })
})
