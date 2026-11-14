/**
 * Le pont a deux extrémités écrites dans deux fichiers : le preload compose les
 * charges, `src/main/ipc/*` les valide. Une charge mal formée est ignorée sans
 * erreur (c'est la règle de la frontière) — donc un désaccord ne se voit pas à
 * l'exécution. Ce test compare les deux sources.
 *
 * Cas réel : `tab:close` envoyait `id` (une chaîne) alors que le contrat attend
 * `{ id }`. Fermer un onglet, basculer, revenir en arrière, recharger, scinder
 * et supprimer un groupe ne faisaient plus rien, sans le moindre message.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RACINE = join(__dirname, '..', '..', '..')
const PRELOAD = join(RACINE, 'src', 'preload', 'index.ts')
const MAIN = join(RACINE, 'src', 'main')

/** Noms d'arguments qui portent déjà un objet complet (paquets de champs). */
const OBJETS = new Set([
  'input',
  'entries',
  'ids',
  'patch',
  'range',
  'map',
  'shot',
  'payload',
  'ratio',
  'tabIds',
  'action'
])

function lire(chemin: string): string {
  return readFileSync(chemin, 'utf8')
}

/** Tous les fichiers du processus principal (les contrats vivent aussi hors de `ipc/`). */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dir, entree.name)
    if (entree.isDirectory()) return sources(chemin)
    if (!entree.name.endsWith('.ts') || entree.name.endsWith('.test.ts')) return []
    return [chemin]
  })
}

/** canal → nom du validateur, tel que déclaré par `request('canal', Validateur`. */
function contrats(): Map<string, string> {
  const trouves = new Map<string, string>()
  for (const fichier of sources(MAIN)) {
    const source = lire(fichier)
    for (const m of source.matchAll(/request\('([a-z][\w-]*:[a-z][\w-]*)',\s*([A-Za-z]+)/g)) {
      trouves.set(m[1], m[2])
    }
  }
  return trouves
}

/** Validateurs déclarés comme un objet : `shape<…>`. Les autres prennent une valeur. */
function validateursObjets(): Set<string> {
  const objets = new Set<string>()
  for (const fichier of sources(MAIN)) {
    const source = lire(fichier)
    for (const m of source.matchAll(/const ([A-Za-z]+)\s*=\s*shape</g)) objets.add(m[1])
  }
  return objets
}

/** canal → expression passée à `ipcRenderer.invoke`. */
function envois(): Map<string, string> {
  const trouves = new Map<string, string>()
  const source = lire(PRELOAD)
  for (const m of source.matchAll(/invoke\('([a-z][\w-]*:[a-z][\w-]*)',\s*([^)\n]*)/g)) {
    trouves.set(m[1], m[2].trim())
  }
  return trouves
}

describe('charges du pont', () => {
  it('le preload envoie un objet partout où le contrat en attend un', () => {
    const declarations = contrats()
    const objets = validateursObjets()
    const desaccords: string[] = []

    for (const [canal, envoi] of envois()) {
      const validateur = declarations.get(canal)
      if (!validateur || !objets.has(validateur)) continue
      // Un objet littéral, une expression qui en produit un (`input ?? {}`), ou
      // un paramètre qui porte déjà un paquet de champs.
      const objet = /[{(]/.test(envoi) || OBJETS.has(envoi)
      if (!objet) desaccords.push(`${canal} : envoie « ${envoi} », attend un objet`)
    }

    expect(desaccords).toEqual([])
  })

  it('chaque canal du preload a un contrat', () => {
    const declarations = contrats()
    const orphelins = [...envois().keys()].filter((canal) => !declarations.has(canal))
    expect(orphelins).toEqual([])
  })
})
