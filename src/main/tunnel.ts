import { randomUUID } from 'node:crypto'
import { net } from 'electron'
import type { SourceType, TunnelFilters, TunnelMap } from '@shared/tunnel'
import {
  detectTensions,
  looksFrench,
  scoreConfidence,
  scoreRelevance,
  suggestQueryFix,
  summarizeMap,
  tokenize,
  type MapNode
} from '@shared/tunnel'

/**
 * Service de recherche du tunnel.
 * Chaque source vient d'une API publique et d'une page réellement récupérée :
 * aucune URL n'est inventée. Les fournisseurs sont remplaçables (interface
 * `TunnelProvider`), ce qui permettra d'ajouter un moteur web plus tard.
 */

export interface TunnelProvider {
  id: string
  label: string
  type: SourceType
  /** Recherche brute ; la vérification des pages est faite par le service. */
  search(query: string, signal: AbortSignal): Promise<RawSource[]>
}

interface RawSource {
  title: string
  url: string
  snippet?: string
  publishedAt?: number
  sourceType?: SourceType
  provider: string
  /** true quand l'API fournit déjà le texte (Wikipédia, arXiv). */
  verified?: boolean
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

async function fetchText(url: string, signal: AbortSignal): Promise<string> {
  const response = await net.fetch(url, {
    signal,
    headers: { 'user-agent': UA, accept: 'text/html,application/json,application/atom+xml,*/*' }
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.text()
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const text = await fetchText(url, signal)
  return JSON.parse(text) as T
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
}

function firstMatch(value: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(value)
  return match?.[1] ? decodeEntities(match[1]).trim() : undefined
}

function isoDate(value?: string | null): number | undefined {
  if (!value) return undefined
  const stamp = Date.parse(value)
  return Number.isFinite(stamp) ? stamp : undefined
}

/* ------------------------------------------------------------------ */
/* Fournisseurs                                                        */
/* ------------------------------------------------------------------ */

const wikipedia: TunnelProvider = {
  id: 'wikipedia',
  label: 'Wikis',
  type: 'wiki',
  async search(query, signal) {
    const lang = looksFrench(query) ? 'fr' : 'en'
    // L’API de recherche REST renvoie toujours un extrait, contrairement au
    // générateur `extracts` qui laisse `extract` vide au-delà d’une page.
    const url = `https://${lang}.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=6`
    const data = await fetchJson<{
      pages?: { key: string; title: string; excerpt?: string; description?: string }[]
    }>(url, signal)
    return (data.pages ?? [])
      .filter((page) => page.key && page.title)
      .map((page) => ({
        title: page.title,
        url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.key)}`,
        snippet: `${page.description ? `${page.description}. ` : ''}${(page.excerpt ?? '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()}`.trim(),
        sourceType: 'wiki' as const,
        provider: 'wikipedia'
      }))
  }
}

interface HnHit {
  title?: string
  url?: string | null
  story_text?: string | null
  objectID: string
  created_at?: string
}

const hn: TunnelProvider = {
  id: 'hn',
  label: 'Discussions',
  type: 'discussion',
  async search(query, signal) {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&hitsPerPage=6&tags=story`
    const data = await fetchJson<{ hits?: HnHit[] }>(url, signal)
    const out: RawSource[] = []
    for (const hit of data.hits ?? []) {
      const title = (hit.title ?? '').trim()
      if (!title) continue
      const target =
        hit.url && /^https?:/i.test(hit.url) ? hit.url : `https://news.ycombinator.com/item?id=${hit.objectID}`
      out.push({
        title,
        url: target,
        snippet: (hit.story_text ?? '').replace(/<[^>]+>/g, ' ').slice(0, 400),
        publishedAt: isoDate(hit.created_at),
        sourceType: 'discussion',
        provider: 'hn'
      })
    }
    return out
  }
}

function parseArxiv(xml: string): RawSource[] {
  const out: RawSource[] = []
  for (const entry of xml.split('<entry>').slice(1, 7)) {
    const title = firstMatch(entry, /<title>([\s\S]*?)<\/title>/)
    const summary = firstMatch(entry, /<summary>([\s\S]*?)<\/summary>/)
    const url = firstMatch(entry, /<id>([\s\S]*?)<\/id>/)
    const published = firstMatch(entry, /<published>([\s\S]*?)<\/published>/)
    if (!title || !url || !/^https?:\/\//.test(url)) continue
    out.push({
      title: title.replace(/\s+/g, ' '),
      url,
      snippet: summary?.replace(/\s+/g, ' ').slice(0, 900),
      publishedAt: isoDate(published),
      sourceType: 'academic',
      provider: 'arxiv',
      verified: true
    })
  }
  return out
}

const arxiv: TunnelProvider = {
  id: 'arxiv',
  label: 'Travaux',
  type: 'academic',
  async search(query, signal) {
    const terms = tokenize(query).slice(0, 6).map((token) => `all:${token}`)
    if (terms.length === 0) return []
    const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(terms.join('+AND+'))}&max_results=5&sortBy=relevance`
    return parseArxiv(await fetchText(url, signal))
  }
}

let lastGdelt = 0

const gdelt: TunnelProvider = {
  id: 'gdelt',
  label: 'Actualité',
  type: 'news',
  async search(query, signal) {
    // GDELT limite à une requête toutes les 5 secondes : on respecte la règle.
    const wait = Math.max(0, 5200 - (Date.now() - lastGdelt))
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    lastGdelt = Date.now()
    const url =
      'https://api.gdeltproject.org/api/v2/doc/doc?query=' +
      `${encodeURIComponent(`"${query}"`)}&mode=artlist&format=json&maxrecords=6&sort=hybridrel`
    const text = await fetchText(url, signal)
    if (!text.trim().startsWith('{')) return []
    let data: { articles?: { title?: string; url?: string; domain?: string; seendate?: string; language?: string }[] }
    try {
      data = JSON.parse(text) as typeof data
    } catch {
      return []
    }
    const french = looksFrench(query)
    return (data.articles ?? [])
      .filter((article) => article.url && article.title)
      .filter((article) => !article.language || (french ? article.language === 'French' : article.language === 'English'))
      .map((article) => ({
        title: decodeEntities(article.title as string),
        url: article.url as string,
        snippet: article.domain ? `Article publié sur ${article.domain}.` : '',
        publishedAt: article.seendate
          ? isoDate(
              `${article.seendate.slice(0, 4)}-${article.seendate.slice(4, 6)}-${article.seendate.slice(6, 8)}`
            )
          : undefined,
        sourceType: 'news' as const,
        provider: 'gdelt'
      }))
  }
}

/* ------------------------------------------------------------------ */
/* Web : DuckDuckGo HTML, sans clé d’API ni compte                     */
/* ------------------------------------------------------------------ */

/** DuckDuckGo encapsule les liens de résultats : on garde l’URL réelle. */
function decodeDdgUrl(href: string): string | null {
  if (!href) return null
  const clean = href.replace(/&amp;/g, '&')
  if (/ad_domain=|duckduckgo\.com\/y\.js/.test(clean)) return null
  try {
    const url = new URL(clean, 'https://duckduckgo.com')
    const target = url.searchParams.get('uddg')
    if (target) return /^https?:/i.test(target) ? target : null
    return /^https?:/i.test(clean) && !url.hostname.endsWith('duckduckgo.com') ? clean : null
  } catch {
    return null
  }
}

function ddgResults(html: string): RawSource[] {
  const out: RawSource[] = []
  const pattern = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  const snippets = Array.from(
    html.matchAll(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g),
    (match) => match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  )
  let match: RegExpExecArray | null
  let index = 0
  while ((match = pattern.exec(html)) && out.length < 8) {
    const url = decodeDdgUrl(match[1])
    const title = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const snippet = snippets[index] ?? ''
    index += 1
    if (!url || !title) continue
    out.push({ title, url, snippet, sourceType: 'other', provider: 'ddg' })
  }
  return out
}

const ddg: TunnelProvider = {
  id: 'ddg',
  label: 'Sites',
  type: 'other',
  async search(query, signal) {
    const response = await net.fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      signal,
      headers: {
        'user-agent': UA,
        'content-type': 'application/x-www-form-urlencoded',
        'accept-language': looksFrench(query) ? 'fr-FR,fr;q=0.9' : 'en-US,en;q=0.9',
        accept: 'text/html,application/xhtml+xml',
        referer: 'https://duckduckgo.com/'
      },
      body: new URLSearchParams({ q: query, kl: looksFrench(query) ? 'fr-fr' : 'wt-wt' }).toString()
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return ddgResults(await response.text())
  }
}

const PROVIDERS: TunnelProvider[] = [ddg, wikipedia, arxiv, hn, gdelt]

/** Thèmes de sous-angle repérables dans le texte des pages. */
const FACETS: { title: string; match: RegExp }[] = [
  { title: 'Outils', match: /\b(outils?|générateurs?|generateurs?|logiciels?|plateformes?|applications?)\b/i },
  { title: 'Comparatifs', match: /\b(comparatif|comparaison|meilleurs?|top \d|classement|palmarès)\b/i },
  { title: 'Guides', match: /\b(guide|tutoriel|comment|débuter|apprendre|méthode|pas à pas)\b/i },
  { title: 'Limites', match: /\b(limites?|risques?|erreurs?|inconvénients?|biais|dérives?)\b/i },
  { title: 'Exemples', match: /\b(exemples?|cas d’usage|cas d'usage|retour d’expérience|témoignage)\b/i }
]

const DOC_HOSTS = ['developer.mozilla.org', 'docs.', 'devdocs.io', 'github.com', 'gitlab.com', 'readthedocs.io']

function refineType(type: SourceType | undefined, url: string): SourceType {
  try {
    const host = new URL(url).hostname
    if (DOC_HOSTS.some((pattern) => host === pattern || host.startsWith('docs.') || host.includes(pattern))) {
      return 'docs'
    }
  } catch {
    /* URL invalide : type d’origine */
  }
  return type ?? 'other'
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/* ------------------------------------------------------------------ */
/* Vérification des pages                                              */
/* ------------------------------------------------------------------ */

interface PageSnapshot {
  ok: boolean
  title?: string
  excerpt?: string
  reachable: boolean
}

function readableText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanText(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/** Paragraphes utiles d’une page : évite les menus, formulaires et bandeaux. */
function mainParagraphs(html: string): string {
  const paragraphs = Array.from(html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi), (match) => cleanText(match[1]))
    .filter((text) => text.length > 90)
    .filter(
      (text) =>
        !/cookie|consentement|newsletter|abonnez|s’inscrire|s'inscrire|mentions légales|tous droits réservés/i.test(
          text
        )
    )
  return paragraphs.slice(0, 3).join(' ').slice(0, 1200)
}

async function snapshotPage(url: string, signal: AbortSignal): Promise<PageSnapshot> {
  try {
    const response = await net.fetch(url, {
      signal,
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' }
    })
    const type = response.headers.get('content-type') ?? ''
    if (!response.ok) return { ok: false, reachable: false }
    if (!/text\/html|application\/xhtml/i.test(type)) {
      return { ok: false, reachable: false }
    }
    const html = (await response.text()).slice(0, 400_000)
    const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i)
    const description = firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    const body = readableText(html)
    const excerpt = mainParagraphs(html) || body.slice(0, 900)
    return {
      ok: true,
      reachable: true,
      title: title?.replace(/\s+/g, ' ').trim(),
      excerpt: (description ? `${description} ` : '') + excerpt.slice(0, 900)
    }
  } catch {
    return { ok: false, reachable: false }
  }
}

/* ------------------------------------------------------------------ */
/* Orchestration                                                       */
/* ------------------------------------------------------------------ */

export interface TunnelRunOptions {
  query: string
  spaceId: string
  parentId?: string
  mapId?: string
  filters?: TunnelFilters
}

export interface TunnelEvents {
  send(channel: string, payload: unknown): void
}

export interface TunnelHost {
  saveMap(map: TunnelMap): void
  getMap(id: string): TunnelMap | null
}

interface RunState {
  controller: AbortController
  spaceId: string
  query: string
}

const ANGLE_COPY: Record<string, { title: string; summary: string }> = {
  ddg: { title: 'Sites web', summary: 'Pages trouvées sur le web, vérifiées une par une.' },
  wikipedia: { title: 'Panorama', summary: 'Définitions et synthèses encyclopédiques.' },
  arxiv: { title: 'Travaux', summary: 'Articles et recherches académiques.' },
  gdelt: { title: 'Actualité', summary: 'Articles de presse récents.' },
  hn: { title: 'Débats', summary: 'Discussions et retours d’expérience.' }
}

export class TunnelService {
  private runs = new Map<string, RunState>()

  constructor(private host: TunnelHost) {}

  cancel(runId: string): void {
    const run = this.runs.get(runId)
    if (!run) return
    run.controller.abort()
    this.runs.delete(runId)
  }

  async start(runId: string, options: TunnelRunOptions, emit: (payload: unknown) => void): Promise<void> {
    const controller = new AbortController()
    this.runs.set(runId, { controller, spaceId: options.spaceId, query: options.query })
    const query = options.query.trim().slice(0, 300)
    if (!query) {
      emit({ runId, type: 'error', message: 'Décrivez un sujet pour lancer le tunnel.' })
      return
    }

    const now = Date.now()
    const existing = options.mapId ? this.host.getMap(options.mapId) : null
    const parent = options.parentId
    const root: MapNode = parent
      ? (existing?.nodes.find((node) => node.id === parent) as MapNode)
      : {
          id: randomUUID(),
          kind: 'subject',
          title: query,
          summary: `Carte de sources réelles sur « ${query} ».`,
          relevance: 100,
          confidence: 100,
          reason: 'Requête de départ.',
          status: 'neutral',
          parentId: null,
          createdAt: now
        }

    const mapId = existing?.id ?? randomUUID()
    const nodes: MapNode[] = existing ? [...existing.nodes] : [root]
    if (parent && existing) {
      nodes.push({
        id: randomUUID(),
        kind: 'angle',
        title: `Depuis ${root.title}`,
        summary: query,
        relevance: 100,
        confidence: 90,
        reason: 'Exploration lancée depuis ce nœud.',
        status: 'neutral',
        parentId: parent,
        createdAt: now,
        relation: 'explore'
      })
    }
    const containerParent = parent ? nodes[nodes.length - 1].id : root.id

    const suggested = suggestQueryFix(query)
    emit({
      runId,
      type: 'start',
      mapId,
      query,
      suggestedQuery: suggested && suggested !== query ? suggested : null,
      privacy: 'local-analysis'
    })
    // Le sujet est le seul nœud créé avant la boucle : il doit aussi arriver
    // au renderer, sinon la carte commence à l’angle et perd sa racine.
    if (!existing) emit({ runId, type: 'node', node: root })

    const seen = new Set(nodes.filter((node) => node.url).map((node) => node.url as string))
    let siteCount = 0
    let totalNodes = 0

    const pushNode = (node: MapNode): void => {
      nodes.push(node)
      emit({ runId, type: 'node', node })
      totalNodes += 1
    }

    const searchOne = async (provider: TunnelProvider): Promise<void> => {
      const copy = ANGLE_COPY[provider.id] ?? { title: provider.label, summary: '' }
      const angleId = randomUUID()
      const angle: MapNode = {
        id: angleId,
        kind: 'angle',
        title: parent ? `${copy.title} · ${query}` : copy.title,
        summary: copy.summary,
        relevance: 100,
        confidence: 80,
        reason: `Recherche ${provider.label.toLowerCase()} pour « ${query} ».`,
        status: 'neutral',
        parentId: containerParent,
        createdAt: Date.now(),
        relation: 'se décompose en'
      }
      pushNode(angle)
      emit({ runId, type: 'phase', message: `Recherche ${copy.title.toLowerCase()}…` })

      let raw: RawSource[] = []
      try {
        raw = await provider.search(query, controller.signal)
      } catch (error) {
        emit({
          runId,
          type: 'phase',
          message: `${copy.title} indisponible (${error instanceof Error ? error.message : 'réseau'}).`
        })
      }
      if (controller.signal.aborted) return
      raw = raw.filter((source) => /^https?:/i.test(source.url)).slice(0, 6)

      const fresh = raw.filter((source) => !seen.has(source.url))
      for (const source of fresh) seen.add(source.url)
      const verified: { source: RawSource; page: PageSnapshot }[] = await Promise.all(
        fresh.map(async (source) => ({
          source,
          page: source.verified
            ? { ok: true, reachable: true, title: source.title, excerpt: source.snippet ?? '' }
            : await snapshotPage(source.url, controller.signal)
        }))
      )
      if (controller.signal.aborted) return

      const withPages = verified.map(({ source, page }) => ({
        source,
        page,
        title: (page.title || source.title || '').trim().slice(0, 180) || source.url,
        excerpt: (page.excerpt || source.snippet || '').trim().slice(0, 1200),
        domain: domainOf(source.url)
      }))

      // Pertinence d’abord : un hors-sujet franc ne crée aucun nœud et ne
      // compte pas dans la densité qui décide des sous-angles.
      const scored = withPages
        .map((entry) => ({
          ...entry,
          relevance: scoreRelevance(query, {
            title: entry.title,
            excerpt: entry.excerpt,
            domain: entry.domain
          })
        }))
        .filter((entry) => entry.relevance >= 35)

      // Diversité : deux pages maximum par domaine, les mieux classées d’abord.
      const perDomain = new Map<string, number>()
      const diverse = scored.filter((entry) => {
        const count = perDomain.get(entry.domain) ?? 0
        if (count >= 2) return false
        perDomain.set(entry.domain, count + 1)
        return true
      })

      // Sous-angles réels : un thème commun aux pages (« Outils », « Guides »,
      // « Comparatifs », « Limites »), jamais un nom de domaine.
      const facets = new Map<string, typeof diverse>()
      for (const entry of diverse) {
        const facet = FACETS.find((candidate) => candidate.match.test(`${entry.title} ${entry.excerpt.slice(0, 400)}`))
        if (!facet) continue
        const bucket = facets.get(facet.title)
        if (bucket) bucket.push(entry)
        else facets.set(facet.title, [entry])
      }
      const keptFacets = new Map(
        Array.from(facets.entries())
          .filter(([, entries]) => entries.length >= 2)
          .sort((a, b) => b[1].length - a[1].length)
          .slice(0, 3)
      )
      const facetOf = new Map<string, string>()
      for (const [title, entries] of keptFacets) {
        const subId = `sub-${angleId}-${title.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}`
        pushNode({
          id: subId,
          kind: 'subangle',
          title,
          summary: `Sources classées « ${title} » pour « ${query} ».`,
          relevance: 100,
          confidence: 75,
          reason: 'Thème commun aux pages récupérées.',
          status: 'neutral',
          parentId: angleId,
          createdAt: Date.now(),
          relation: 'précise'
        })
        for (const entry of entries) facetOf.set(entry.source.url, subId)
      }

      for (const entry of diverse) {
        if (controller.signal.aborted) return
        const parentId: string = facetOf.get(entry.source.url) ?? angleId
        const relevance = entry.relevance
        const sourceType = refineType(entry.source.sourceType ?? provider.type, entry.source.url)
        const confidence = scoreConfidence({
          excerpt: entry.excerpt,
          reachable: entry.page.reachable,
          sourceType
        })
        const node: MapNode = {
          id: randomUUID(),
          kind: 'site',
          title: entry.title,
          summary: entry.excerpt ? entry.excerpt.slice(0, 300) : 'Page inaccessible : contenu non récupéré.',
          url: entry.source.url,
          domain: entry.domain,
          sourceType,
          relevance,
          confidence,
          publishedAt: entry.source.publishedAt,
          reason: `Trouvé par ${provider.label.toLowerCase()} pour « ${query} »${entry.page.reachable ? '' : ', page inaccessible'}.`,
          status: 'neutral',
          parentId,
          createdAt: Date.now(),
          excerpt: entry.excerpt,
          reachable: entry.page.reachable,
          relation: 'cite',
          lang: looksFrench(`${entry.title} ${entry.excerpt.slice(0, 400)}`) ? 'fr' : 'en'
        }
        pushNode(node)
        siteCount += 1
        if (nodes.length >= 200) return
      }
    }

    try {
      await Promise.all(PROVIDERS.map((provider) => searchOne(provider)))
    } catch (error) {
      emit({
        runId,
        type: 'error',
        message: error instanceof Error ? error.message : 'Recherche interrompue.'
      })
      return
    }

    if (controller.signal.aborted) return

    // Concepts : mots présents dans au moins deux titres de sources.
    const sites = nodes.filter((node) => node.kind === 'site')
    const counts = new Map<string, string[]>()
    const queryTokens = new Set(tokenize(query))
    for (const site of sites) {
      for (const token of new Set(tokenize(`${site.title} ${site.excerpt ?? ''}`))) {
        if (token.length < 5 || queryTokens.has(token)) continue
        const bucket = counts.get(token)
        if (bucket) bucket.push(site.id)
        else counts.set(token, [site.id])
      }
    }
    const concepts = Array.from(counts)
      .filter(([, ids]) => ids.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 3)
    for (const [token, ids] of concepts) {
      pushNode({
        id: `concept-${mapId}-${token}`,
        kind: 'concept',
        title: token,
        summary: `Présent dans ${ids.length} sources de la carte.`,
        relevance: 100,
        confidence: 65,
        reason: 'Mot-clé récurrent dans les pages récupérées.',
        status: 'neutral',
        parentId: root.id,
        relatedIds: ids.slice(0, 6),
        createdAt: Date.now(),
        relation: 'relie'
      })
    }

    // Tensions : uniquement appuyées sur les extraits récupérés.
    const tensions = detectTensions(sites).slice(0, 4)
    for (const tension of tensions) {
      pushNode({
        ...tension,
        id: tension.id ? `${tension.id}-${mapId.slice(0, 6)}` : randomUUID(),
        parentId: root.id
      })
    }

    const map: TunnelMap = {
      id: mapId,
      spaceId: options.spaceId,
      query: existing?.query && parent ? existing.query : query,
      lang: looksFrench(query) ? 'fr' : 'en',
      nodes: nodes.slice(0, 200),
      createdAt: existing?.createdAt ?? now,
      updatedAt: Date.now(),
      title: existing?.title
    }
    this.host.saveMap(map)
    this.runs.delete(runId)
    emit({
      runId,
      type: 'done',
      mapId,
      summary: summarizeMap(map),
      sources: siteCount,
      nodes: totalNodes
    })
  }
}

export type { RawSource }
