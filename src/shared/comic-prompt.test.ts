import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8')

/**
 * Trois endroits portent le prompt de traduction : le script de page (usage
 * autonome), le pont de l'application et le banc d'évaluation. Ils doivent
 * transporter le contexte et la contrainte de longueur, sinon la qualité dépend
 * de l'endroit d'où part la requête.
 */
describe('prompt de traduction de BD', () => {
  const userscript = read('userscripts/comic-translate.user.js')
  const bridge = read('src/main/comic.ts')
  const bench = read('scripts/comic-eval.mjs')

  // Les prompts sont écrits en concaténations : on recolle les morceaux avant
  // de chercher une phrase, sinon la garde échoue sur un simple retour à la ligne.
  const joined = (source: string): string => source.replace(/'\s*\+\s*'/g, '').replace(/\s+/g, ' ')

  it('transporte le contexte et la contrainte de longueur', () => {
    for (const source of [userscript, bridge, bench]) {
      const text = joined(source)
      expect(text).toContain('contexte')
      expect(text).toContain('tiennent dans une bulle')
    }
  })

  it('demande le même format de réponse', () => {
    for (const source of [userscript, bridge, bench]) {
      expect(source).toContain('traductions')
    }
  })
})
