/** Compare sans tenir compte de la casse ni des accents. */
export function foldSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/** Texte comparable : casse et accents ignorés, espaces normalisés. */
export function normalizeSearchText(value: string): string {
  return foldSearch(value).replace(/\s+/g, ' ')
}

export interface SearchQuery {
  /** Termes et expressions obligatoires, déjà normalisés. */
  include: string[]
  /** Termes et expressions exclus, déjà normalisés. */
  exclude: string[]
}

/**
 * Syntaxe : les mots séparés par des espaces sont tous obligatoires ;
 * `"expression exacte"` garde les espaces ; `-mot` ou `-"expression"` exclut.
 * Les guillemets courbes et français sont acceptés.
 */
export function parseSearchQuery(value: string): SearchQuery {
  const include: string[] = []
  const exclude: string[] = []
  const source = value.trim()
  let index = 0

  while (index < source.length) {
    while (index < source.length && /\s/.test(source[index] ?? '')) index += 1
    if (index >= source.length) break

    let negated = false
    if (source[index] === '-') {
      negated = true
      index += 1
      while (index < source.length && /\s/.test(source[index] ?? '')) index += 1
    }

    const opener = source[index]
    let token: string
    if (opener === '"' || opener === '“' || opener === '«') {
      const closer = opener === '«' ? '»' : opener === '“' ? '”' : '"'
      index += 1
      const start = index
      while (index < source.length && source[index] !== closer) index += 1
      token = source.slice(start, index)
      if (index < source.length) index += 1
    } else {
      const start = index
      while (index < source.length && !/\s/.test(source[index] ?? '')) index += 1
      token = source.slice(start, index)
    }

    const term = normalizeSearchText(token).trim()
    if (!term) continue
    const target = negated ? exclude : include
    if (!target.includes(term)) target.push(term)
  }

  return { include, exclude }
}

/** Vrai si tous les termes sont présents et aucun terme exclu ne l'est. */
export function matchesSearch(value: string, query: SearchQuery): boolean {
  const haystack = normalizeSearchText(value)
  return (
    query.include.every((term) => haystack.includes(term)) &&
    query.exclude.every((term) => !haystack.includes(term))
  )
}
