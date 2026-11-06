/**
 * Classement des résultats de la palette. Une note ou un onglet nommé
 * « Hébergement statique » doit passer devant les commandes génériques qui
 * contiennent seulement le mot dans leur indice, et les en-têtes de groupe
 * doivent rester contigus à l'affichage.
 */

export interface Rankable {
  group: string
  label: string
  hint?: string
  /** Entrée fabriquée à partir de la frappe, jamais prioritaire sur une action. */
  generated?: boolean
}

export function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** Titre exact, puis préfixe, mot, sous-chaîne, et seulement ensuite l'indice. */
export function scoreOf(item: Rankable, search: string): number {
  const label = normalize(item.label)
  const hint = normalize(item.hint ?? '')
  let score = 10
  if (label === search) score = 100
  else if (label.startsWith(search)) score = 82
  else if (label.split(/[^a-z0-9]+/).some((word) => word.startsWith(search))) score = 68
  else if (label.includes(search)) score = 46
  else if (hint.includes(search)) score = 26
  // Les entrées fabriquées à partir de la frappe (« Ouvrir « historique » »)
  // ne doivent pas passer devant l'action qui porte vraiment ce mot : taper
  // « historique » puis Entrée doit ouvrir l'historique, pas une recherche.
  if (item.generated) score -= 24
  // Onglets et notes sont des destinations : à pertinence égale, ils passent
  // devant les commandes et les réglages.
  if (item.group === 'Onglets') score += 12
  if (item.group === 'Notes') score += 10
  return score
}

/**
 * Filtre puis classe. Les groupes restent des blocs contigus, ordonnés par
 * leur meilleur résultat ; le tri est stable, donc à score égal l'ordre de
 * construction est conservé.
 */
export function rankItems<T extends Rankable>(items: T[], search: string): T[] {
  if (!search) return items
  const matched = items.filter((item) => normalize(`${item.label} ${item.hint ?? ''} ${item.group}`).includes(search))
  const buckets = new Map<string, T[]>()
  for (const item of matched) {
    const list = buckets.get(item.group) ?? []
    list.push(item)
    buckets.set(item.group, list)
  }
  const ranked = [...buckets].map(([name, list]) => {
    const scored = list.map((item) => ({ item, score: scoreOf(item, search) }))
    scored.sort((a, b) => b.score - a.score)
    return { name, items: scored.map((entry) => entry.item), best: scored[0]?.score ?? 0 }
  })
  ranked.sort((a, b) => b.best - a.best)
  return ranked.flatMap((group) => group.items)
}
