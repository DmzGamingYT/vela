import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { version } from '../../package.json'

/**
 * L'aide du dépôt (README) et les pages du site décrivent les mêmes limites.
 * Ce test échoue dès qu'un des deux textes prend de l'avance sur l'autre —
 * c'est ce qui évite de promettre une connexion Google fiable ou une
 * signature inexistante. La structure des pages et la parité des flux réseau
 * sont vérifiées séparément dans `site.test.ts`.
 */
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8')
const readme = read('README.md')
const home = read('site', 'public', 'index.html')
const aide = read('site', 'public', 'aide', 'index.html')
const script = read('site', 'public', 'site.js')

describe('limites documentées dans l’aide et sur le site', () => {
  it('dit que les extensions et la synchronisation ne sont pas prises en charge', () => {
    for (const [name, text] of [
      ['README', readme],
      ['site', aide]
    ] as const) {
      expect(text, name).toMatch(/extensions[^.]{0,40}(Chrome|Chrome Web Store)/i)
      expect(text, name).toMatch(/(non |pas )prises? en charge/i)
      expect(text, name).toMatch(/synchronisation/i)
    }
  })

  it('ne promet pas une connexion Google infaillible', () => {
    for (const [name, text] of [
      ['README', readme],
      ['site', aide]
    ] as const) {
      expect(text, name).toMatch(/Google peut[^.]{0,60}refuser/i)
      expect(text, name).toMatch(/navigateur système/i)
      expect(text, name).toMatch(/(importer (une|votre) session|import de session) depuis Chrome ou Safari/i)
    }
    expect(home + aide).not.toMatch(/Connexion Google garantie/i)
  })

  it('explique macOS non signé, la commande de secours et pourquoi l’installation silencieuse échoue', () => {
    for (const [name, text] of [
      ['README', readme],
      ['site', aide]
    ] as const) {
      expect(text, name).toMatch(/Developer ID/)
      expect(text, name).toMatch(/notari/i)
      expect(text, name).toMatch(/Gatekeeper/)
      expect(text, name).toMatch(/xattr -cr \/Applications\/Vela\.app/)
    }
    expect(aide).toMatch(/installation silencieuse/i)
  })

  it('décrit le build macOS universel comme livré, pas comme à venir', () => {
    for (const [name, text] of [
      ['README', readme],
      ['site', aide]
    ] as const) {
      expect(text, name).toMatch(/universel/)
      expect(text, name).toMatch(/Apple silicon/)
      expect(text, name).toMatch(/Intel/)
      // Les deux disent qu’un essai sur une vraie machine Intel reste à faire.
      expect(text, name).toMatch(/vraie machine Intel/)
    }
    // Le site ne renvoie plus l’universel à une version future : il est publié.
    expect(home + aide).not.toMatch(/prochaine version/)
  })

  it('garde le site sur une seule version, jamais en avance sur l’app', () => {
    // Le site ne peut pas annoncer une version dont les installateurs ne sont
    // pas encore construits : leurs empreintes n'existent pas. Il suit donc la
    // publication d'au plus une version, et chaque mention dit la même chose.
    const announced = (home.match(/Fichiers de la version ([\d.]+)/) || [])[1] || ''
    expect(announced, 'version annoncée').toMatch(/^\d+\.\d+\.\d+$/)
    const site = announced.split('.').map(Number)
    const app = version.split('.').map(Number)
    const ahead = site[0] - app[0] || site[1] - app[1] || site[2] - app[2]
    expect(ahead, `site ${announced} en avance sur l’app ${version}`).toBeLessThanOrEqual(0)
    expect(home, 'titre de téléchargement').toContain(`Vela ${announced}, pour les trois plateformes`)
    // Les liens du tableau pointent vers la release annoncée…
    expect(home).toContain(`releases/download/v${announced}/Vela-${announced}-universal.dmg`)
    expect(home).toContain(`Vela-${announced}-amd64.deb`)
    // …et le bouton adapté à la plateforme aussi : le script compose ses liens
    // depuis une base de release unique, à laquelle s'ajoute le numéro annoncé.
    expect(script).toContain(`/download/v${announced}/`)
    expect(script).toContain(`Vela-${announced}-universal.dmg`)
  })

  it('explique SmartScreen sous Windows', () => {
    for (const [name, text] of [
      ['README', readme],
      ['site', aide]
    ] as const) {
      expect(text, name).toMatch(/SmartScreen/)
      expect(text, name).toMatch(/certificat/i)
    }
    expect(aide).toMatch(/Exécuter quand même/)
  })
})
