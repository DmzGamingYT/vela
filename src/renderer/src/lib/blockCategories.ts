/** Catégories du bouclier : ce que l’on comprend sans connaître le domaine. */
export type BlockCategory = 'ad' | 'analytics' | 'track' | 'social' | 'other'

export const CATEGORY_LABEL: Record<BlockCategory, string> = {
  ad: 'Publicité',
  analytics: 'Analyse',
  track: 'Suivi',
  social: 'Social',
  other: 'Autre'
}

/** L’ordre de la barre de répartition : du plus parlant au plus vague. */
export const CATEGORY_ORDER: BlockCategory[] = ['ad', 'track', 'analytics', 'social', 'other']

const RULES: { test: RegExp; category: BlockCategory }[] = [
  {
    category: 'ad',
    test:
      /(^|\.)(doubleclick|googlesyndication|googleadservices|adservice|adsystem|amazon-adsystem|criteo|taboola|outbrain|pubmatic|rubiconproject|casalemedia|adnxs|moatads|2mdn|adform|smartadserver)\./
  },
  {
    category: 'analytics',
    test:
      /(^|\.)(google-analytics|analytics|segment|mixpanel|amplitude|hotjar|matomo|plausible|heapanalytics|fullstory|statcounter|scorecardresearch|quantserve|doubleverify|chartbeat|nr-data)\./
  },
  {
    category: 'social',
    test: /(^|\.)(facebook|connect\.facebook|twitter|t\.co|linkedin|tiktok|pinterest|snapchat|x\.com)\./
  },
  { category: 'track', test: /(^|\.)(track|tracker|pixel|beacon|tag|metrics|collect)/ }
]

export function categoryOf(host: string): BlockCategory {
  const value = host.trim().toLowerCase()
  for (const rule of RULES) if (rule.test.test(value)) return rule.category
  return 'other'
}

/** Suffixes à deux étiquettes : `bbc.co.uk` n’est pas le site `co.uk`. */
const TWO_PART_SUFFIXES = new Set([
  'co.uk',
  'com.au',
  'co.jp',
  'com.br',
  'co.nz',
  'com.mx',
  'co.za',
  'com.tr',
  'co.in',
  'com.cn'
])

/** Domaine parent d’un hôte : `ads.doubleclick.net` → `doubleclick.net`. */
export function parentDomain(host: string): string {
  const parts = host.trim().toLowerCase().split('.').filter(Boolean)
  if (parts.length <= 2) return parts.join('.')
  const lastTwo = parts.slice(-2).join('.')
  return TWO_PART_SUFFIXES.has(lastTwo) ? parts.slice(-3).join('.') : lastTwo
}

export interface BlockedHost {
  host: string
  count: number
  category: BlockCategory
}

export interface HostGroup {
  parent: string
  total: number
  hosts: BlockedHost[]
  /** Une seule catégorie pour tout le groupe, sinon `null`. */
  category: BlockCategory | null
}

/**
 * Regroupe les hôtes par domaine parent, du plus volumineux au plus discret.
 * Un hôte seul reste une ligne simple ; un parent à plusieurs sous-domaines
 * devient une ligne repliable.
 */
export function groupHosts(hosts: { host: string; count: number }[]): HostGroup[] {
  const buckets = new Map<string, BlockedHost[]>()
  for (const entry of hosts) {
    if (!entry.host || entry.count <= 0) continue
    const parent = parentDomain(entry.host)
    const list = buckets.get(parent) ?? []
    list.push({ host: entry.host, count: entry.count, category: categoryOf(entry.host) })
    buckets.set(parent, list)
  }
  const groups: HostGroup[] = []
  for (const [parent, list] of buckets) {
    list.sort((a, b) => b.count - a.count || a.host.localeCompare(b.host))
    const first = list[0].category
    const category = list.every((entry) => entry.category === first) ? first : null
    groups.push({
      parent,
      total: list.reduce((sum, entry) => sum + entry.count, 0),
      hosts: list,
      category
    })
  }
  return groups.sort((a, b) => b.total - a.total || a.parent.localeCompare(b.parent))
}

/** Totaux par catégorie, dans l’ordre d’affichage de la barre. */
export function categoryTotals(hosts: { host: string; count: number }[]): {
  category: BlockCategory
  count: number
}[] {
  const totals = new Map<BlockCategory, number>()
  for (const entry of hosts) {
    if (!entry.host || entry.count <= 0) continue
    const category = categoryOf(entry.host)
    totals.set(category, (totals.get(category) ?? 0) + entry.count)
  }
  return CATEGORY_ORDER.filter((category) => (totals.get(category) ?? 0) > 0).map((category) => ({
    category,
    count: totals.get(category) ?? 0
  }))
}
