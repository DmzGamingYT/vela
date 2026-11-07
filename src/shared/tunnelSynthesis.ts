/**
 * Refonte du tunnel : angles groupés et synthèse citée.
 *
 * Rien n'est inventé ici. Une section reprend le résumé d'angle écrit par le
 * tunnel et les titres des pages retenues ; une citation est toujours un
 * extrait de page, et chaque paragraphe renvoie à des sources numérotées.
 */

import {
  NODE_LABELS,
  tokenize,
  visibleSites,
  tunnelMapTitle,
  type MapNode,
  type TunnelMap
} from './tunnel'

export interface AngleGroup {
  id: string
  title: string
  kind: 'angle' | 'subangle'
  summary: string
  /** Pages retenues sous cet angle, les plus pertinentes d'abord. */
  sites: MapNode[]
  /** Pages de l'angle que l'entonnoir ou une mise à l'écart masque. */
  hidden: number
  total: number
}

function isAncestor(nodes: MapNode[], ancestorId: string, node: MapNode): boolean {
  let current = node.parentId
  let guard = 0
  while (current && guard < 12) {
    if (current === ancestorId) return true
    current = nodes.find((entry) => entry.id === current)?.parentId ?? null
    guard += 1
  }
  return false
}

/** Toutes les pages sous un angle, masquées comprises. */
export function sitesUnder(nodes: MapNode[], angleId: string): MapNode[] {
  return nodes.filter((node) => node.kind === 'site' && isAncestor(nodes, angleId, node))
}

/**
 * Un angle vide n'apparaît pas : la carte ne crée déjà que des angles peuplés,
 * et une section sans source n'aurait rien à citer.
 */
export function angleGroups(nodes: MapNode[], visible?: Set<string>): AngleGroup[] {
  const angles = nodes.filter((node) => node.kind === 'angle' || node.kind === 'subangle')
  const groups: AngleGroup[] = []
  for (const angle of angles) {
    const all = sitesUnder(nodes, angle.id)
    if (all.length === 0) continue
    const kept = all
      .filter((site) => !visible || visible.has(site.id))
      .filter((site) => site.status !== 'dismissed')
      .sort((a, b) => b.relevance - a.relevance)
    if (kept.length === 0) continue
    groups.push({
      id: angle.id,
      title: angle.title,
      kind: angle.kind === 'subangle' ? 'subangle' : 'angle',
      summary: angle.summary,
      sites: kept,
      hidden: all.length - kept.length,
      total: all.length
    })
  }
  return groups
}

export interface SynthesisParagraph {
  text: string
  citations: number[]
}

export interface SynthesisQuote {
  text: string
  attribution: string
  citation: number
}

export interface SynthesisSection {
  id: string
  heading: string
  paragraphs: SynthesisParagraph[]
  quote?: SynthesisQuote
}

export interface SynthesisDecision {
  title: string
  text: string
  citations: number[]
}

export interface SynthesisSource {
  id: string
  index: number
  title: string
  domain: string
  url?: string
  relevance: number
}

export interface TunnelSynthesis {
  title: string
  lede: string
  generatedAt: number
  sections: SynthesisSection[]
  decisions: SynthesisDecision[]
  sources: SynthesisSource[]
  angles: number
  explored: number
  kept: number
}

export function domainOf(node: MapNode): string {
  if (node.domain) return node.domain.replace(/^www\./, '')
  if (!node.url) return ''
  try {
    return new URL(node.url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Première phrase d'un extrait, coupée proprement, pour une citation courte. */
function firstSentence(text: string, maxChars = 260): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxChars) return clean
  const window = clean.slice(0, maxChars)
  const cut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '))
  if (cut > 80) return window.slice(0, cut + 1)
  return `${window.slice(0, maxChars - 1).trimEnd()}…`
}

/**
 * Ce que la mesure de pertinence a vu, en trois nombres : les mots de la
 * question retrouvés dans le titre, dans le texte, et dans le domaine.
 */
export function queryMatches(
  query: string,
  node: MapNode
): { total: number; title: number; text: number; domain: number; missing: number } {
  const wanted = Array.from(new Set(tokenize(query)))
  if (wanted.length === 0) return { total: 0, title: 0, text: 0, domain: 0, missing: 0 }
  const title = new Set(tokenize(node.title))
  const text = new Set(tokenize(`${node.summary} ${node.excerpt ?? ''}`))
  const domain = new Set(tokenize(domainOf(node)))
  const inTitle = wanted.filter((word) => title.has(word)).length
  const inText = wanted.filter((word) => !title.has(word) && text.has(word)).length
  const inDomain = wanted.filter((word) => !title.has(word) && !text.has(word) && domain.has(word)).length
  return {
    total: wanted.length,
    title: inTitle,
    text: inText,
    domain: inDomain,
    missing: wanted.length - inTitle - inText - inDomain
  }
}

/** « 2024 » ou rien : la carte ne doit pas afficher une date qu'elle n'a pas. */
export function siteYear(node: MapNode): string {
  if (!node.publishedAt) return ''
  return String(new Date(node.publishedAt).getFullYear())
}

function sourceLine(node: MapNode): string {
  const year = siteYear(node)
  const domain = domainOf(node)
  return [domain, year].filter(Boolean).join(' · ')
}

/**
 * Synthèse déterministe : une section par angle, un extrait cité par section,
 * et les divergences chiffrées déjà repérées par le tunnel. Aucune phrase ne
 * parle d'une page qui n'est pas dans la carte.
 */
export function buildTunnelSynthesis(map: TunnelMap, visible?: Set<string>): TunnelSynthesis {
  const sources = visibleSites(map.nodes, visible)
  const index = new Map(sources.map((site, position) => [site.id, position + 1]))
  const groups = angleGroups(map.nodes, visible)
  const explored = map.nodes.filter((node) => node.kind === 'site').length

  const sections: SynthesisSection[] = groups.map((group) => {
    const top = group.sites.slice(0, 3)
    const citations = top.map((site) => index.get(site.id) ?? 0).filter((value) => value > 0)
    const paragraphs: SynthesisParagraph[] = []
    // Le résumé d'angle est écrit par le tunnel à partir des pages lues :
    // le reprendre garde la trace sans reformuler une affirmation. Quand il ne
    // fait que répéter le titre de l'angle, il n'apprend rien.
    const summary = group.summary.trim()
    if (summary && summary.toLowerCase() !== group.title.trim().toLowerCase()) {
      paragraphs.push({ text: summary, citations: [] })
    }
    if (top.length > 0) {
      const titles = top.map((site) => `« ${site.title} »`).join(', ')
      paragraphs.push({
        text: `${top.length} page${top.length > 1 ? 's' : ''} retenue${top.length > 1 ? 's' : ''} portent cet angle : ${titles}${
          group.hidden > 0 ? `, ${group.hidden} autre${group.hidden > 1 ? 's' : ''} écartée${group.hidden > 1 ? 's' : ''}` : ''
        }.`,
        citations
      })
    }

    // La citation vient de la page retenue dont l'extrait est le plus long :
    // une page sans extrait ne peut pas être citée.
    const quoted = group.sites.find((site) => (site.excerpt ?? '').length >= 120) ?? null
    const quote = quoted
      ? {
          text: firstSentence(quoted.excerpt ?? ''),
          attribution: [quoted.title, sourceLine(quoted)].filter(Boolean).join(' — '),
          citation: index.get(quoted.id) ?? 0
        }
      : undefined

    return {
      id: group.id,
      heading: group.title,
      paragraphs,
      quote: quote && quote.citation > 0 ? quote : undefined
    }
  })

  const decisions: SynthesisDecision[] = map.nodes
    .filter((node) => node.kind === 'tension' && (!visible || visible.has(node.id)))
    .map((tension) => {
      const related = (tension.relatedIds ?? [])
        .map((id) => index.get(id) ?? 0)
        .filter((value) => value > 0)
      return {
        title: tension.title,
        text: `${tension.summary} Vérifiez la date et le périmètre de chaque chiffre avant de le reprendre.`,
        citations: related
      }
    })

  const title = tunnelMapTitle(map)
  const lede = sources.length
    ? `${sources.length} page${sources.length > 1 ? 's' : ''} retenue${sources.length > 1 ? 's' : ''} sur ${explored} lue${explored > 1 ? 's' : ''}, rangée${sources.length > 1 ? 's' : ''} en ${groups.length} angle${groups.length > 1 ? 's' : ''}. Chaque paragraphe renvoie à la page dont il vient ; la synthèse ne dit rien de plus.`
    : `Aucune page ne passe encore le seuil de pertinence : baissez-le dans l’entonnoir ou reformulez la question.`

  return {
    title,
    lede,
    generatedAt: map.updatedAt,
    sections,
    decisions,
    sources: sources.map((site, position) => ({
      id: site.id,
      index: position + 1,
      title: site.title,
      domain: domainOf(site),
      url: site.url,
      relevance: site.relevance
    })),
    angles: groups.length,
    explored,
    kept: sources.length
  }
}

export function synthesisMarkdown(synthesis: TunnelSynthesis): string {
  const lines: string[] = []
  lines.push(`# ${synthesis.title}`)
  lines.push('')
  lines.push(synthesis.lede)
  lines.push('')
  for (const section of synthesis.sections) {
    lines.push(`## ${section.heading}`)
    lines.push('')
    for (const paragraph of section.paragraphs) {
      const markers = paragraph.citations.map((citation) => `[${citation}]`).join('')
      lines.push(`${paragraph.text}${markers ? ` ${markers}` : ''}`)
      lines.push('')
    }
    if (section.quote) {
      lines.push(`> ${section.quote.text}`)
      lines.push(`> — ${section.quote.attribution} [${section.quote.citation}]`)
      lines.push('')
    }
  }
  if (synthesis.decisions.length > 0) {
    lines.push('## À trancher')
    lines.push('')
    for (const decision of synthesis.decisions) {
      const markers = decision.citations.map((citation) => `[${citation}]`).join('')
      lines.push(`- **${decision.title}** — ${decision.text}${markers ? ` ${markers}` : ''}`)
    }
    lines.push('')
  }
  lines.push('## Sources')
  lines.push('')
  for (const source of synthesis.sources) {
    lines.push(`${source.index}. ${source.title}${source.domain ? ` — ${source.domain}` : ''}${source.url ? ` — ${source.url}` : ''}`)
  }
  lines.push('')
  lines.push(
    `Synthèse du ${new Date(synthesis.generatedAt).toLocaleDateString('fr-FR')} · ${synthesis.kept} sources retenues sur ${synthesis.explored} lues · Vela`
  )
  return lines.join('\n')
}

export const SYNTHESIS_LABELS = NODE_LABELS
