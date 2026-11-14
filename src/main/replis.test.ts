/**
 * Un `catch` muet est un choix, pas un oubli — à condition de l'écrire.
 *
 * L'audit (C4) a trouvé des replis silencieux dont certains masquaient des
 * pertes : c'est ainsi qu'un index de notes illisible devenait une liste vide
 * et qu'une écriture ratée passait inaperçue. Les fichiers qui portent des
 * données de l'utilisateur doivent donc dire, sur place, pourquoi le repli est
 * sans conséquence.
 *
 * Ce test ne juge pas la formulation : il exige qu'une explication existe,
 * dans le bloc ou juste avant.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RACINE = join(__dirname, '..', '..')
const FICHIERS = ['src/main/store.ts', 'src/main/notes.ts', 'src/main/updater.ts']

function replisSansExplication(chemin: string): string[] {
  const lignes = readFileSync(join(RACINE, chemin), 'utf8').split('\n')
  const fautifs: string[] = []
  lignes.forEach((ligne, index) => {
    if (!/^\s*\} catch \{\s*$/.test(ligne)) return
    const avant = lignes.slice(Math.max(0, index - 5), index)
    const apres = lignes.slice(index + 1, index + 4)
    const explique = [...avant, ...apres].some((texte) => /\/\/|\/\*/.test(texte))
    if (!explique) fautifs.push(`${chemin}:${index + 1}`)
  })
  return fautifs
}

describe('replis silencieux', () => {
  it('chaque catch des fichiers de données est expliqué sur place', () => {
    const fautifs = FICHIERS.flatMap(replisSansExplication)
    expect(fautifs).toEqual([])
  })
})
