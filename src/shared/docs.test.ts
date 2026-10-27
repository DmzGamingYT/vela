import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * L'aide (README) et le site vitrine décrivent les mêmes limites. Ce test
 * échoue dès qu'un des deux textes prend de l'avance sur l'autre — c'est ce qui
 * évite de promettre une connexion Google fiable ou une signature inexistante.
 */
const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8')
const site = readFileSync(join(process.cwd(), 'site', 'public', 'index.html'), 'utf8')
const texts: [string, string][] = [
  ['README', readme],
  ['site', site]
]

describe('limites documentées dans l’aide et sur le site', () => {
  it('dit que les extensions et la synchronisation ne sont pas prises en charge', () => {
    for (const [name, text] of texts) {
      expect(text, name).toMatch(/extensions Chrome/i)
      expect(text, name).toMatch(/non prises? en charge/i)
      expect(text, name).toMatch(/synchronisation/i)
    }
  })

  it('ne promet pas une connexion Google infaillible', () => {
    for (const [name, text] of texts) {
      expect(text, name).toMatch(/Google peut[^.]{0,40}refuser/i)
      expect(text, name).toMatch(/aucune imitation supplémentaire de Chrome/i)
      expect(text, name).toMatch(/importer votre session depuis Chrome ou Safari/i)
      expect(text, name).toMatch(/navigateur système/i)
    }
  })

  it('explique macOS non signé et pourquoi l’installation silencieuse échoue', () => {
    for (const [name, text] of texts) {
      expect(text, name).toMatch(/Developer ID/)
      expect(text, name).toMatch(/notari/i)
      expect(text, name).toMatch(/Gatekeeper/)
      expect(text, name).toMatch(/xattr -cr \/Applications\/Vela\.app/)
    }
  })

  it('explique SmartScreen sous Windows', () => {
    for (const [name, text] of texts) {
      expect(text, name).toMatch(/SmartScreen/)
      expect(text, name).toMatch(/certificat de signature de code/i)
    }
  })
})
