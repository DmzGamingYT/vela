/**
 * Tunnel de recherche : modèle et logique pure.
 * Aucun accès réseau ici — le service vit dans `src/main/tunnel.ts`, ce qui
 * garde le scoring, la mise en page et les exports testables sans Electron.
 */

export type MapNodeKind = 'subject' | 'angle' | 'subangle' | 'detail' | 'concept' | 'site' | 'tension'

export type SourceType = 'academic' | 'news' | 'wiki' | 'discussion' | 'docs' | 'other'

export type NodeStatus = 'kept' | 'dismissed' | 'neutral'

export interface MapNode {
  id: string
  kind: MapNodeKind
  title: string
  summary: string
  url?: string
  domain?: string
  sourceType?: SourceType
  /** 0–100, calculé localement à partir de la requête. */
  relevance: number
  /** 0–100, dépend de la longueur de l'extrait et de l'accès à la page. */
  confidence: number
  publishedAt?: number
  reason: string
  status: NodeStatus
  parentId: string | null
  /** Sites liés (concepts, tensions). */
  relatedIds?: string[]
  createdAt: number
  excerpt?: string
  reachable?: boolean
  /** Étiquette du lien depuis le parent (« se décompose en », « cite »…). */
  relation?: string
  /** Langue dominante de la page, pour l’entonnoir. */
  lang?: 'fr' | 'en'
}

export interface TunnelMap {
  id: string
  spaceId: string
  query: string
  lang: 'fr' | 'en'
  nodes: MapNode[]
  createdAt: number
  updatedAt: number
  title?: string
}

export interface TunnelMapSummary {
  id: string
  spaceId: string
  query: string
  title: string
  sourceCount: number
  updatedAt: number
}

export interface TunnelFilters {
  sourceTypes: SourceType[]
  minRelevance: number
  /** Date minimale de publication (ms) ; null = pas de limite. */
  from: number | null
  lang: 'all' | 'fr' | 'en'
}

export const DEFAULT_FILTERS: TunnelFilters = {
  sourceTypes: [],
  minRelevance: 60,
  from: null,
  lang: 'all'
}

export const SOURCE_TYPES: { id: SourceType; label: string }[] = [
  { id: 'academic', label: 'Académique' },
  { id: 'news', label: 'Actualités' },
  { id: 'wiki', label: 'Wikis' },
  { id: 'discussion', label: 'Vidéos / discussions' },
  { id: 'docs', label: 'Documentation' },
  { id: 'other', label: 'Autres sites' }
]

export const NODE_LABELS: Record<MapNodeKind, string> = {
  subject: 'Sujet',
  angle: 'Angle',
  subangle: 'Sous-angle',
  detail: 'Détail',
  concept: 'Concept',
  site: 'Site',
  tension: 'Tension'
}

/* ------------------------------------------------------------------ */
/* Texte, requête, pertinence                                          */
/* ------------------------------------------------------------------ */

const STOP_WORDS = new Set([
  'le','la','les','un','une','des','du','de','d','au','aux','et','ou','mais','donc','or','ni','car',
  'pour','sur','sous','dans','avec','sans','par','vers','chez','entre','comme','que','qui','quoi',
  'dont','ou','où','quand','comment','pourquoi','est','sont','être','été','avoir','a','ai','as','ont',
  'ce','cet','cette','ces','son','sa','ses','leur','leurs','mon','ma','mes','ton','ta','tes','notre',
  'nos','votre','vos','je','tu','il','elle','on','nous','vous','ils','elles','se','s','y','en','ne',
  'pas','plus','moins','très','tout','tous','toute','toutes','aussi','encore','déjà','the','a','an',
  'of','to','in','on','for','and','or','with','without','from','by','at','is','are','was','were',
  'be','been','this','that','these','those','it','its','as','about','into','over','under','how','why'
])

export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function tokenize(value: string): string[] {
  return stripAccents(value.toLowerCase())
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token))
}

export function looksFrench(query: string): boolean {
  return /\b(le|la|les|des|du|de|un|une|pour|comment|pourquoi|est|sont|avec|sur|dans|quand)\b/i.test(query)
}

/**
 * Radical court : « navigateur » et « navigateurs » se comparent,
 * sans confondre deux mots différents. Au-delà de six lettres, la fin
 * du mot (pluriel, féminin) ne change plus le sujet.
 */
function stem(word: string): string {
  return word.length > 6 ? word.slice(0, 6) : word
}

/**
 * Verbes et tournures de demande : ils disent l’intention, pas le sujet.
 * Les ignorer évite de pénaliser « Meilleure IA pour rédiger des textes »
 * quand la requête est « utiliser l’IA pour rédiger des textes ».
 */
const INTENT_WORDS = new Set([
  'utiliser','utilise','utiliser','utilisation','comment','pourquoi','chercher','cherche','trouver',
  'trouve','faire','fais','peut','peux','veut','veux','savoir','expliquer','explique','mieux',
  'meilleur','meilleure','meilleurs','meilleures','bon','bonne','quel','quelle','quels','quelles'
])

/** Couverture des mots de la requête par le titre, l'extrait et le domaine. */
export function scoreRelevance(
  query: string,
  candidate: { title: string; excerpt?: string; domain?: string }
): number {
  const raw = Array.from(new Set(tokenize(query)
    .filter((word) => !INTENT_WORDS.has(word))))
  const wanted = Array.from(new Set((raw.length > 0 ? raw : tokenize(query)).map(stem)))
  if (wanted.length === 0) return 0
  const title = new Set(tokenize(candidate.title).map(stem))
  const excerpt = tokenize(candidate.excerpt ?? '').map(stem)
  const excerptSet = new Set(excerpt)
  const domain = new Set(tokenize(candidate.domain ?? '').map(stem))
  let score = 0
  for (const token of wanted) {
    if (title.has(token)) score += 1
    else if (excerptSet.has(token)) score += 0.6
    else if (domain.has(token)) score += 0.4
    else if (excerpt.some((word) => word.startsWith(token.slice(0, 5)))) score += 0.25
  }
  return Math.round(Math.min(100, (score / wanted.length) * 100))
}

export function scoreConfidence(input: {
  excerpt?: string
  reachable?: boolean
  sourceType?: SourceType
}): number {
  let score = input.reachable === false ? 25 : 55
  const length = (input.excerpt ?? '').length
  if (length > 400) score += 20
  else if (length > 150) score += 12
  else if (length > 60) score += 6
  if (input.sourceType === 'academic' || input.sourceType === 'wiki') score += 12
  if (input.sourceType === 'news') score += 4
  return Math.max(0, Math.min(100, score))
}

/* ------------------------------------------------------------------ */
/* Correction de requête                                               */
/* ------------------------------------------------------------------ */

/** Lexique volontairement court : il ne corrige que les fautes fréquentes. */
const LEXICON = [
  'utiliser','utilisation','utilise','rédiger','rédigé','rédaction','texte','textes','article','articles',
  'recherche','recherches','chercher','trouver','comprendre','comparer','analyse','analyser','sources',
  'source','document','documents','navigateur','navigateurs','internet','logiciel','logiciels','application',
  'applications','intelligence','artificielle','machine','apprentissage','données','sécurité','confidentialité',
  'histoire','culture','société','économie','politique','science','sciences','technique','techniques','méthode',
  'méthodes','travail','étude','études','projet','projets','gestion','performance','mémoire','vitesse',
  'réseau','réseaux','serveur','serveurs','développement','développeur','programmation','langage','langages',
  'éducation','apprendre','école','université','citation','citations','rapport',
  'présentation','résumé','synthèse','exemple','exemples','guide','tutoriel','fonctionnement','définition',
  'avantage','avantages','inconvénient','inconvénients','comparaison','différence','différences','marché',
  'monde','france','europe','futur','avenir','impact','impacts','risque','risques','enjeu','enjeux',
  'minimaliste','minimalistes','rapide','rapides','léger','légers','simple','simples','ouvert','ouverte',
  'gratuit','gratuite','privé','privée','locale','local','cloud','modèle','modèles','agent','agents'
]

/** Clé sans accent → mot affiché avec ses accents. */
const LEXICON_INDEX = new Map<string, string>()
for (const word of LEXICON) LEXICON_INDEX.set(stripAccents(word.toLowerCase()), word)

function editDistance(a: string, b: string): number {
  if (a === b) return 0
  const previous = new Array<number>(b.length + 1)
  const current = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j += 1) previous[j] = j
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j]
  }
  return previous[b.length]
}

/**
 * « Vouliez-vous dire… ? » : propose une correction seulement si un mot
 * inconnu est à une faute (deux pour les mots longs) d'un mot du lexique.
 */
export function suggestQueryFix(query: string, extraWords: string[] = []): string | null {
  const words = query.split(/(\s+)/)
  const index = new Map(LEXICON_INDEX)
  for (const word of extraWords) index.set(stripAccents(word.toLowerCase()), word)
  let changes = 0
  const fixed = words.map((word) => {
    const raw = stripAccents(word.toLowerCase())
    if (!/^[a-z]{4,}$/.test(raw) || index.has(raw)) return word
    let best: string | null = null
    let bestDistance = 99
    for (const [candidate, display] of index) {
      if (Math.abs(candidate.length - raw.length) > 2) continue
      const distance = editDistance(raw, candidate)
      if (distance < bestDistance) {
        bestDistance = distance
        best = display
      }
    }
    const allowed = raw.length >= 8 ? 2 : 1
    if (best && bestDistance > 0 && bestDistance <= allowed) {
      changes += 1
      return best
    }
    return word
  })
  if (changes === 0 || changes > 2) return null
  return fixed.join('')
}

/** Étiquettes d'affinage proposées sous la barre. */
export function refineSuggestions(query: string): { label: string; query: string }[] {
  const base = query.trim()
  return [
    { label: 'histoire', query: `${base} histoire` },
    { label: 'technique', query: `${base} technique` },
    { label: 'critique', query: `${base} critique limites` },
    { label: 'exemples', query: `${base} exemples` }
  ]
}

/* ------------------------------------------------------------------ */
/* Filtres                                                             */
/* ------------------------------------------------------------------ */

export function filterMap(
  nodes: MapNode[],
  filters: TunnelFilters
): { visible: Set<string>; hiddenSites: number } {
  const sites = new Map(nodes.filter((node) => node.kind === 'site').map((node) => [node.id, node]))
  const kept = new Set<string>()
  let hiddenSites = 0
  for (const site of sites.values()) {
    if (site.status === 'dismissed') {
      hiddenSites += 1
      continue
    }
    if (site.relevance < filters.minRelevance) {
      hiddenSites += 1
      continue
    }
    if (filters.sourceTypes.length > 0 && site.sourceType && !filters.sourceTypes.includes(site.sourceType)) {
      hiddenSites += 1
      continue
    }
    if (filters.from !== null) {
      if (!site.publishedAt || site.publishedAt < filters.from) {
        hiddenSites += 1
        continue
      }
    }
    if (filters.lang !== 'all' && site.lang && site.lang !== filters.lang) {
      hiddenSites += 1
      continue
    }
    kept.add(site.id)
  }

  // Les ancêtres d'un site gardé restent visibles ; les autres branches non.
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const visible = new Set<string>(kept)
  for (const id of kept) {
    let current = byId.get(id)?.parentId ?? null
    let guard = 0
    while (current && guard < 12) {
      visible.add(current)
      current = byId.get(current)?.parentId ?? null
      guard += 1
    }
  }
  for (const node of nodes) {
    if (node.kind === 'tension') {
      const related = (node.relatedIds ?? []).filter((id) => kept.has(id))
      if (related.length >= 2) visible.add(node.id)
    }
    if (node.kind === 'concept') {
      const related = (node.relatedIds ?? []).filter((id) => kept.has(id))
      if (related.length >= 2) {
        visible.add(node.id)
        if (node.parentId) visible.add(node.parentId)
      }
    }
  }
  return { visible, hiddenSites }
}

/* ------------------------------------------------------------------ */
/* Mise en page                                                        */
/* ------------------------------------------------------------------ */

export interface NodeBox {
  x: number
  y: number
  width: number
  height: number
  depth: number
}

export interface LayoutResult {
  boxes: Record<string, NodeBox>
  width: number
  height: number
}

const COLUMN_WIDTH = 268
const NODE_WIDTH = 212
const NODE_HEIGHT = 58
const ROW_GAP = 16

/**
 * Arbre horizontal : chaque niveau occupe une colonne, chaque sous-arbre
 * réserve sa hauteur. Par construction, deux nœuds ne se chevauchent jamais.
 */
export function layoutMap(
  nodes: MapNode[],
  options: { nodeHeight?: number; rowGap?: number; columnWidth?: number; nodeWidth?: number } = {}
): LayoutResult {
  const nodeHeight = options.nodeHeight ?? NODE_HEIGHT
  const rowGap = options.rowGap ?? ROW_GAP
  const columnWidth = options.columnWidth ?? COLUMN_WIDTH
  const nodeWidth = options.nodeWidth ?? NODE_WIDTH

  const present = new Set(nodes.map((node) => node.id))
  const children = new Map<string, string[]>()
  const roots: string[] = []
  for (const node of nodes) {
    const parent = node.parentId && present.has(node.parentId) ? node.parentId : null
    if (!parent) roots.push(node.id)
    else {
      const bucket = children.get(parent)
      if (bucket) bucket.push(node.id)
      else children.set(parent, [node.id])
    }
  }
  // Le sujet d'abord, puis les autres racines éventuelles.
  roots.sort((a, b) => {
    const kindA = nodes.find((node) => node.id === a)?.kind
    const kindB = nodes.find((node) => node.id === b)?.kind
    return Number(kindB === 'subject') - Number(kindA === 'subject')
  })

  const depths = new Map<string, number>()
  const heights = new Map<string, number>()
  const box = new Map<string, NodeBox>()

  const measure = (id: string, depth: number): number => {
    depths.set(id, depth)
    const kids = children.get(id) ?? []
    if (kids.length === 0) {
      heights.set(id, nodeHeight)
      return nodeHeight
    }
    let total = 0
    for (const kid of kids) {
      total += measure(kid, depth + 1)
      total += rowGap
    }
    total -= rowGap
    const own = Math.max(nodeHeight, total)
    heights.set(id, own)
    return own
  }

  const place = (id: string, top: number): void => {
    const depth = depths.get(id) ?? 0
    const own = heights.get(id) ?? nodeHeight
    const kids = children.get(id) ?? []
    box.set(id, { x: depth * columnWidth, y: top + own / 2 - nodeHeight / 2, width: nodeWidth, height: nodeHeight, depth })
    if (kids.length === 0) return
    const total = kids.reduce((sum, kid) => sum + (heights.get(kid) ?? nodeHeight) + rowGap, -rowGap)
    let cursor = top + own / 2 - total / 2
    for (const kid of kids) {
      const kidHeight = heights.get(kid) ?? nodeHeight
      place(kid, cursor)
      cursor += kidHeight + rowGap
    }
  }

  let cursor = 0
  for (const root of roots) {
    const height = measure(root, 0)
    place(root, cursor)
    cursor += height + rowGap * 2
  }

  const boxes: Record<string, NodeBox> = {}
  let width = 0
  let height = 0
  for (const [id, value] of box) {
    boxes[id] = value
    width = Math.max(width, value.x + value.width)
    height = Math.max(height, value.y + value.height)
  }
  return { boxes, width: width || nodeWidth, height: height || nodeHeight }
}

export function boxesOverlap(a: NodeBox, b: NodeBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/* ------------------------------------------------------------------ */
/* Tensions                                                            */
/* ------------------------------------------------------------------ */

const CLAIM = /(\b(?:19|20)\d{2}\b|\d{1,3}(?:[.,]\d+)?\s?%)/g

interface Claim {
  siteId: string
  context: string
  value: string
  sentence: string
}

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

/**
 * Contradictions repérables sans modèle : deux pages qui avancent un chiffre
 * ou une année différente pour le même contexte. Chaque tension cite les deux
 * phrases, jamais une déduction non sourcée.
 */
export function detectTensions(sites: MapNode[]): MapNode[] {
  const claims: Claim[] = []
  for (const site of sites) {
    if (!site.excerpt) continue
    for (const sentence of sentences(`${site.title}. ${site.excerpt}`).slice(0, 24)) {
      CLAIM.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = CLAIM.exec(sentence))) {
        const words = tokenize(sentence).slice(0, 6)
        const context = words.slice(0, 3).join(' ')
        if (!context) continue
        claims.push({
          siteId: site.id,
          context,
          value: match[1].replace(/\s+/g, ''),
          sentence
        })
      }
    }
  }

  const groups = new Map<string, Claim[]>()
  for (const claim of claims) {
    const bucket = groups.get(claim.context)
    if (bucket) bucket.push(claim)
    else groups.set(claim.context, [claim])
  }

  const tensions: MapNode[] = []
  for (const [context, group] of groups) {
    const bySite = new Map<string, Claim>()
    for (const claim of group) if (!bySite.has(claim.siteId)) bySite.set(claim.siteId, claim)
    if (bySite.size < 2) continue
    const values = new Set(Array.from(bySite.values(), (claim) => claim.value))
    if (values.size < 2) continue
    const entries = Array.from(bySite.values()).slice(0, 2)
    const excerpts = entries.map((claim) => {
      const site = sites.find((item) => item.id === claim.siteId)
      return `${site?.domain ?? 'Source'} : « ${claim.sentence.slice(0, 220)} »`
    })
    tensions.push({
      id: `tension-${context.replace(/\s+/g, '-')}-${entries[0].value}`,
      kind: 'tension',
      title: `Divergence sur « ${context} »`,
      summary: `Deux sources avancent une valeur différente : ${entries.map((entry) => entry.value).join(' et ')}.`,
      relevance: Math.min(...entries.map((entry) => sites.find((site) => site.id === entry.siteId)?.relevance ?? 0)),
      confidence: 60,
      reason: 'Chiffres ou dates divergents dans des phrases comparables.',
      status: 'neutral',
      parentId: null,
      relatedIds: entries.map((entry) => entry.siteId),
      excerpt: excerpts.join('\n'),
      createdAt: Date.now(),
      relation: 'contredit'
    })
    if (tensions.length >= 4) break
  }
  return tensions
}

/* ------------------------------------------------------------------ */
/* Rapport et exports                                                  */
/* ------------------------------------------------------------------ */

export function visibleSites(nodes: MapNode[], visible?: Set<string>): MapNode[] {
  return nodes
    .filter((node) => node.kind === 'site' && node.status !== 'dismissed')
    .filter((node) => !visible || visible.has(node.id))
    .sort((a, b) => b.relevance - a.relevance)
}

export function buildTunnelReport(map: TunnelMap, visible?: Set<string>): string {
  const sites = visibleSites(map.nodes, visible)
  const index = new Map(sites.map((site, position) => [site.id, position + 1]))
  const lines: string[] = []
  lines.push(`# Tunnel de recherche — ${map.query}`)
  lines.push('')
  lines.push(`${sites.length} source${sites.length > 1 ? 's' : ''} de la carte, numérotées.`)
  lines.push('')

  const angles = map.nodes.filter((node) => node.kind === 'angle')
  for (const angle of angles) {
    const own = sites.filter((site) => {
      let current = map.nodes.find((node) => node.id === site.parentId)
      let guard = 0
      while (current && guard < 8) {
        if (current.id === angle.id) return true
        current = map.nodes.find((node) => node.id === current?.parentId)
        guard += 1
      }
      return false
    })
    if (own.length === 0) continue
    lines.push(`## ${angle.title}`)
    if (angle.summary) lines.push('', angle.summary)
    lines.push('')
    for (const site of own) {
      lines.push(`### [${index.get(site.id)}] ${site.title}`)
      lines.push('')
      lines.push(`- Domaine : ${site.domain ?? 'inconnu'}`)
      lines.push(`- Pertinence : ${site.relevance} % · Confiance : ${site.confidence} %`)
      if (site.publishedAt) lines.push(`- Publication : ${new Date(site.publishedAt).toLocaleDateString('fr-FR')}`)
      lines.push(`- URL : ${site.url ?? 'inconnue'}`)
      if (site.excerpt) lines.push('', `> ${site.excerpt.replace(/\n+/g, ' ').slice(0, 400)}`)
      lines.push('')
    }
  }

  const tensions = map.nodes.filter((node) => node.kind === 'tension')
  if (tensions.length > 0) {
    lines.push('## Tensions entre sources')
    lines.push('')
    for (const tension of tensions) {
      lines.push(`### ${tension.title}`)
      lines.push('', tension.summary, '')
      for (const related of tension.relatedIds ?? []) {
        const site = map.nodes.find((node) => node.id === related)
        if (site) lines.push(`- [${index.get(site.id) ?? '—'}] ${site.title} — ${site.url ?? ''}`)
      }
      lines.push('')
    }
  }

  lines.push('---')
  lines.push(`Carte générée le ${new Date().toLocaleDateString('fr-FR')} · ${sites.length} sources · ${map.nodes.length} nœuds.`)
  return lines.join('\n')
}

export function tunnelMapTitle(map: TunnelMap): string {
  return map.title?.trim() || map.query.trim() || 'Tunnel sans titre'
}

export function toJsonExport(map: TunnelMap): string {
  return JSON.stringify(map, null, 2)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Document autonome pour l'export PDF. */
export function buildTunnelHtml(map: TunnelMap, visible?: Set<string>): string {
  const sites = visibleSites(map.nodes, visible)
  const index = new Map(sites.map((site, position) => [site.id, position + 1]))
  const angles = map.nodes.filter((node) => node.kind === 'angle')
  const sections = angles
    .map((angle) => {
      const own = sites.filter((site) => {
        let current = map.nodes.find((node) => node.id === site.parentId)
        let guard = 0
        while (current && guard < 8) {
          if (current.id === angle.id) return true
          current = map.nodes.find((node) => node.id === current?.parentId)
          guard += 1
        }
        return false
      })
      if (own.length === 0) return ''
      const items = own
        .map(
          (site) => `<li>
            <h3>[${index.get(site.id)}] ${escapeHtml(site.title)}</h3>
            <p class="meta">${escapeHtml(site.domain ?? '')} · pertinence ${site.relevance} % · confiance ${site.confidence} %</p>
            ${site.excerpt ? `<blockquote>${escapeHtml(site.excerpt.slice(0, 500))}</blockquote>` : ''}
            <p class="url">${escapeHtml(site.url ?? '')}</p>
          </li>`
        )
        .join('')
      return `<section><h2>${escapeHtml(angle.title)}</h2><ul>${items}</ul></section>`
    })
    .join('')
  const tensions = map.nodes
    .filter((node) => node.kind === 'tension')
    .map((tension) => {
      const related = (tension.relatedIds ?? [])
        .map((id) => {
          const site = map.nodes.find((node) => node.id === id)
          return site ? `<li>[${index.get(site.id) ?? '—'}] ${escapeHtml(site.title)} — ${escapeHtml(site.url ?? '')}</li>` : ''
        })
        .join('')
      return `<section><h2>${escapeHtml(tension.title)}</h2><p>${escapeHtml(tension.summary)}</p><pre>${escapeHtml(
        tension.excerpt ?? ''
      )}</pre><ul>${related}</ul></section>`
    })
    .join('')

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Tunnel — ${escapeHtml(
    map.query
  )}</title><style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, "Segoe UI", sans-serif; margin: 48px; color: #1b1a18; line-height: 1.55; }
  h1 { font-family: "Iowan Old Style", Palatino, serif; font-weight: 400; font-size: 30px; }
  h2 { font-size: 18px; margin-top: 28px; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
  h3 { font-size: 14px; margin-bottom: 2px; }
  .meta, .url { color: #666; font-size: 11px; }
  blockquote { margin: 6px 0; padding-left: 12px; border-left: 2px solid #ccc; color: #444; font-size: 12px; }
  ul { padding-left: 18px; } li { margin-bottom: 16px; }
  pre { white-space: pre-wrap; background: #f7f5f2; padding: 10px; font-size: 11px; }
  footer { margin-top: 32px; color: #666; font-size: 11px; }
  </style></head><body>
  <h1>Tunnel de recherche — ${escapeHtml(map.query)}</h1>
  <p class="meta">${sites.length} source${sites.length > 1 ? 's' : ''} · carte du ${new Date(
    map.updatedAt
  ).toLocaleDateString('fr-FR')}</p>
  ${sections}${tensions}
  <footer>Généré par Vela. Sources numérotées : la bibliographie renvoie aux URL ci-dessus.</footer>
  </body></html>`
}

export function exportFileName(query: string, extension: string): string {
  const base = stripAccents(query)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${base || 'tunnel'}-vela.${extension}`
}

/* ------------------------------------------------------------------ */
/* Persistance                                                         */
/* ------------------------------------------------------------------ */

export function summarizeMap(map: TunnelMap): TunnelMapSummary {
  return {
    id: map.id,
    spaceId: map.spaceId,
    query: map.query,
    title: tunnelMapTitle(map),
    sourceCount: map.nodes.filter((node) => node.kind === 'site').length,
    updatedAt: map.updatedAt
  }
}

const KINDS: MapNodeKind[] = ['subject', 'angle', 'subangle', 'detail', 'concept', 'site', 'tension']
const TYPES: SourceType[] = ['academic', 'news', 'wiki', 'discussion', 'docs', 'other']

/** Normalise une carte venue du disque : aucune donnée non reconnue n'entre. */
export function sanitizeMap(raw: unknown): TunnelMap | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Partial<TunnelMap>
  if (typeof input.id !== 'string' || typeof input.query !== 'string' || !Array.isArray(input.nodes)) return null
  const nodes: MapNode[] = []
  for (const entry of input.nodes) {
    if (!entry || typeof entry !== 'object') continue
    const node = entry as Partial<MapNode>
    if (typeof node.id !== 'string' || typeof node.title !== 'string') continue
    if (!node.kind || !KINDS.includes(node.kind)) continue
    nodes.push({
      id: node.id,
      kind: node.kind,
      title: node.title.slice(0, 200),
      summary: typeof node.summary === 'string' ? node.summary.slice(0, 1200) : '',
      url: typeof node.url === 'string' ? node.url.slice(0, 2000) : undefined,
      domain: typeof node.domain === 'string' ? node.domain.slice(0, 200) : undefined,
      sourceType: node.sourceType && TYPES.includes(node.sourceType) ? node.sourceType : undefined,
      relevance: clampScore(node.relevance),
      confidence: clampScore(node.confidence),
      publishedAt: typeof node.publishedAt === 'number' ? node.publishedAt : undefined,
      reason: typeof node.reason === 'string' ? node.reason.slice(0, 600) : '',
      status: node.status === 'kept' || node.status === 'dismissed' ? node.status : 'neutral',
      parentId: typeof node.parentId === 'string' ? node.parentId : null,
      relatedIds: Array.isArray(node.relatedIds)
        ? node.relatedIds.filter((id): id is string => typeof id === 'string').slice(0, 8)
        : undefined,
      createdAt: typeof node.createdAt === 'number' ? node.createdAt : Date.now(),
      excerpt: typeof node.excerpt === 'string' ? node.excerpt.slice(0, 2000) : undefined,
      reachable: typeof node.reachable === 'boolean' ? node.reachable : undefined,
      relation: typeof node.relation === 'string' ? node.relation.slice(0, 60) : undefined,
      lang: node.lang === 'en' || node.lang === 'fr' ? node.lang : undefined
    })
    if (nodes.length >= 200) break
  }
  return {
    id: input.id,
    spaceId: typeof input.spaceId === 'string' ? input.spaceId : '',
    query: input.query.slice(0, 300),
    lang: input.lang === 'en' ? 'en' : 'fr',
    nodes,
    createdAt: typeof input.createdAt === 'number' ? input.createdAt : Date.now(),
    updatedAt: typeof input.updatedAt === 'number' ? input.updatedAt : Date.now(),
    title: typeof input.title === 'string' ? input.title.slice(0, 160) : undefined
  }
}

function clampScore(value: unknown): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return Math.max(0, Math.min(100, Math.round(number)))
}

export type { MapNode as TunnelNode }
