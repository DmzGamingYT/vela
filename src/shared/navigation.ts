/**
 * Réglages de navigation : moteurs ajoutés à la main, mots-clés rapides,
 * conservation de l'historique, page de démarrage, langue et zoom des pages.
 *
 * Tout ce qui est validé ici l'est aussi à l'entrée : une valeur bricolée dans
 * vela.json ne doit jamais produire une adresse exécutable, ni un départ de
 * requête vers un schéma inattendu.
 */

import {
  HOME_URL,
  type CustomSearchEngine,
  type HistoryRetention,
  type SearchEngineId,
  type SearchKeyword,
  type StartupBehavior
} from './types'
import { isBuiltinEngine, searchUrl, type EngineOptions } from './url'

export const MAX_CUSTOM_ENGINES = 12
export const MAX_KEYWORDS = 20

/** Nom lisible d'un moteur personnalisé : borné, sans balise ni retour ligne. */
export function sanitizeEngineName(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40)
}

/**
 * Modèle d'adresse d'un moteur : https uniquement, un seul %s, jamais de
 * javascript:, data: ou file:, ni d'identifiants dans l'URL.
 */
export function sanitizeEngineTemplate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (!text || text.length > 400) return null
  if (!/^https:\/\//i.test(text)) return null
  if (/[\s"'<>`]/.test(text)) return null
  const placeholders = text.match(/%s/g) ?? []
  if (placeholders.length !== 1) return null
  try {
    const probe = new URL(text.replace('%s', 'verre'))
    if (probe.protocol !== 'https:') return null
    if (!probe.hostname || probe.username || probe.password) return null
    if (!/^[a-z0-9.-]+$/i.test(probe.hostname)) return null
    return text
  } catch {
    return null
  }
}

/** Adresse complète pour une requête : le %s est encodé une seule fois. */
export function customSearchUrl(template: string, query: string): string | null {
  const clean = sanitizeEngineTemplate(template)
  if (!clean) return null
  return clean.replace('%s', encodeURIComponent(query))
}

export function sanitizeCustomEngines(raw: unknown): CustomSearchEngine[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: CustomSearchEngine[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const item = entry as { id?: unknown; name?: unknown; template?: unknown }
    const id = typeof item.id === 'string' ? item.id.replace(/[^a-z0-9-]/gi, '').slice(0, 40) : ''
    const name = sanitizeEngineName(item.name)
    const template = sanitizeEngineTemplate(item.template)
    if (!id || !name || !template || seen.has(id)) continue
    seen.add(id)
    out.push({ id, name, template })
    if (out.length >= MAX_CUSTOM_ENGINES) break
  }
  return out
}

/** Identifiant stable pour un moteur ajouté : lisible et sans collision. */
export function customEngineId(name: string, taken: string[]): string {
  const base =
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'moteur'
  let id = `custom-${base}`
  let index = 2
  while (taken.includes(id)) {
    id = `custom-${base}-${index}`
    index += 1
  }
  return id
}

/**
 * Mots-clés rapides : une lettre ou un mot court, en minuscules, unique.
 * Le premier gagne : un doublon ne doit pas changer le moteur en silence.
 */
export function sanitizeKeywords(raw: unknown, engines: CustomSearchEngine[]): SearchKeyword[] {
  if (!Array.isArray(raw)) return []
  const known = new Set<string>([...BUILTIN_IDS, ...engines.map((engine) => engine.id)])
  const seen = new Set<string>()
  const out: SearchKeyword[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const item = entry as { keyword?: unknown; engineId?: unknown }
    const keyword =
      typeof item.keyword === 'string'
        ? item.keyword
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .slice(0, 12)
        : ''
    const engineId = typeof item.engineId === 'string' ? item.engineId : ''
    if (!keyword || seen.has(keyword) || !known.has(engineId)) continue
    seen.add(keyword)
    out.push({ keyword, engineId })
    if (out.length >= MAX_KEYWORDS) break
  }
  return out
}

const BUILTIN_IDS = [
  'duckduckgo',
  'brave',
  'startpage',
  'google',
  'bing',
  'ecosia',
  'qwant',
  'searxng'
]

export interface NavigationSettingsLike {
  searchEngine: SearchEngineId
  customEngineId?: string
  customEngines?: CustomSearchEngine[]
  searchKeywords?: SearchKeyword[]
  searxInstance?: string
}

/** Moteur retenu, ramené à un moteur existant : jamais d'identifiant orphelin. */
export function resolveEngine(settings: NavigationSettingsLike): {
  engine: SearchEngineId
  template: string | null
} {
  const custom = settings.customEngines ?? []
  if (settings.searchEngine === 'custom') {
    const chosen = custom.find((item) => item.id === settings.customEngineId) ?? custom[0]
    if (chosen) return { engine: 'custom', template: chosen.template }
    return { engine: 'duckduckgo', template: null }
  }
  return { engine: settings.searchEngine, template: null }
}

/** Contexte complet attendu par `normalizeInput` : moteur, instance, mots-clés. */
export function searchOptionsOf(settings: NavigationSettingsLike): EngineOptions {
  const { engine, template } = resolveEngine(settings)
  return {
    engine,
    searxInstance: settings.searxInstance ?? '',
    customTemplate: template,
    keywords: (settings.searchKeywords ?? []).map((rule) => {
      const custom = (settings.customEngines ?? []).find((item) => item.id === rule.engineId)
      return {
        keyword: rule.keyword,
        engine: custom ? ('custom' as const) : (rule.engineId as SearchEngineId),
        customTemplate: custom?.template ?? null
      }
    })
  }
}

/** Adresse de départ commune : pages de démarrage et de recherche. */
export function searchAddressOf(settings: NavigationSettingsLike, query: string): string {
  const { engine, template } = resolveEngine(settings)
  return searchUrl(query, engine, settings.searxInstance, template)
}

/* ------------------------------------------------------------------ */
/* Historique                                                          */
/* ------------------------------------------------------------------ */

export const HISTORY_RETENTIONS: { id: HistoryRetention; label: string; detail: string }[] = [
  { id: 'forever', label: 'Toujours', detail: 'Rien ne part tout seul.' },
  { id: '90', label: '90 jours', detail: 'Le trimestre en cours.' },
  { id: '30', label: '30 jours', detail: 'Le mois en cours.' },
  { id: '7', label: '7 jours', detail: 'La semaine en cours.' },
  { id: 'never', label: 'Jamais', detail: 'Rien n’est gardé.' }
]

export function isHistoryRetention(value: unknown): value is HistoryRetention {
  return (
    value === 'forever' || value === '90' || value === '30' || value === '7' || value === 'never'
  )
}

/** Date plancher de conservation : null quand tout est gardé. */
export function retentionFloor(retention: HistoryRetention, now: number): number | null {
  if (retention === 'never') return Number.POSITIVE_INFINITY
  if (retention === 'forever') return null
  const days = Number(retention)
  if (!Number.isFinite(days)) return null
  return now - days * 86_400_000
}

export function keepByRetention(
  visitedAt: number,
  retention: HistoryRetention,
  now: number
): boolean {
  const floor = retentionFloor(retention, now)
  return floor === null ? true : visitedAt >= floor
}

export type HistoryRange = 'hour' | 'today' | 'week' | 'all'

export const HISTORY_RANGES: { id: HistoryRange; label: string }[] = [
  { id: 'hour', label: 'Dernière heure' },
  { id: 'today', label: 'Aujourd’hui' },
  { id: 'week', label: 'Sept derniers jours' },
  { id: 'all', label: 'Tout l’historique' }
]

export function isHistoryRange(value: unknown): value is HistoryRange {
  return value === 'hour' || value === 'today' || value === 'week' || value === 'all'
}

export function historyRangeFloor(range: HistoryRange, now: number): number {
  if (range === 'hour') return now - 3_600_000
  if (range === 'week') return now - 7 * 86_400_000
  if (range === 'today') {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    return start.getTime()
  }
  return 0
}

/* ------------------------------------------------------------------ */
/* Démarrage et pages                                                  */
/* ------------------------------------------------------------------ */

export function isStartupBehavior(value: unknown): value is StartupBehavior {
  return value === 'restore' || value === 'home' || value === 'url'
}

/** Page de démarrage : https uniquement, ramenée à son adresse propre. */
export function sanitizeStartupUrl(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const text = raw.trim()
  if (!text || text.length > 2000) return ''
  // Un schéma explicite autre que https (file:, javascript:, data:…) : refusé.
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^https:\/\//i.test(text)) return ''
  try {
    const parsed = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    if (parsed.protocol !== 'https:') return ''
    if (!parsed.hostname || parsed.username || parsed.password) return ''
    return parsed.toString().slice(0, 2000)
  } catch {
    return ''
  }
}

/** Adresse au lancement : accueil, page choisie, ou rien (reprise de session). */
export function startupAddress(behavior: StartupBehavior, url: string): string | null {
  if (behavior === 'home') return HOME_URL
  if (behavior === 'url') return sanitizeStartupUrl(url) || null
  return null
}

export const WEB_LANGUAGES: { id: string; label: string }[] = [
  { id: 'fr', label: 'Français' },
  { id: 'en', label: 'Anglais' },
  { id: 'de', label: 'Allemand' },
  { id: 'es', label: 'Espagnol' },
  { id: 'it', label: 'Italien' },
  { id: 'pt', label: 'Portugais' },
  { id: 'nl', label: 'Néerlandais' },
  { id: 'ja', label: 'Japonais' },
  { id: 'zh', label: 'Chinois' }
]

export function isWebLanguage(value: unknown): value is string {
  return typeof value === 'string' && WEB_LANGUAGES.some((language) => language.id === value)
}

/** En-tête Accept-Language correspondant à la langue choisie. */
export function acceptLanguage(language: string): string {
  const clean = isWebLanguage(language) ? language : 'fr'
  return `${clean},${clean};q=0.9,en;q=0.6`
}

export const ZOOM_LEVELS = [0.75, 0.9, 1, 1.1, 1.25, 1.5] as const

export function sanitizeDefaultZoom(raw: unknown): number {
  return typeof raw === 'number' && (ZOOM_LEVELS as readonly number[]).includes(raw) ? raw : 1
}

/** Bornes du zoom mémorisé (niveau Chromium : 0 = 100 %). */
export const MIN_HOST_ZOOM = -3
export const MAX_HOST_ZOOM = 4
/** Domaines retenus ; au-delà, les plus anciens sortent. */
export const HOST_ZOOM_LIMIT = 200

/**
 * Niveaux de zoom mémorisés par domaine. Un fichier abîmé ne doit jamais
 * empêcher le démarrage : tout ce qui n'est pas un nombre fini dans les
 * bornes est ignoré, et les clés sont ramenées en minuscules.
 */
export function sanitizeZoomByHost(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const host = key.trim().toLowerCase()
    if (!host || host.length > 253) continue
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < MIN_HOST_ZOOM ||
      value > MAX_HOST_ZOOM
    ) {
      continue
    }
    out[host] = Math.round(value * 100) / 100
    if (Object.keys(out).length >= HOST_ZOOM_LIMIT) break
  }
  return out
}

/** Niveau Chromium → pourcentage affiché (même échelle que la barre de statut). */
export function zoomPercentOfLevel(level: number): number {
  return Math.round(1.2 ** level * 100)
}

/** Hôte d'une URL web, ou null pour l'accueil et les schémas internes. */
export function zoomHostOf(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.host.toLowerCase() || null
  } catch {
    return null
  }
}

export function describeZoom(value: number): string {
  return `${Math.round(value * 100)} %`
}

export { isBuiltinEngine }

/* Règle d'ouverture des demandes de fenêtres web, partagée par tabs.ts et
   peek.ts : une vraie popup de site arrive en `new-window` avec des features,
   un ⇧ + clic en `new-window` vide, un ⌘⌥ + clic en `other`. */
export function shouldOpenAsPopup(disposition: string, features = ''): boolean {
  return disposition === 'new-window' && features.trim() !== ''
}

export function opensPeek(disposition: string, features = ''): boolean {
  return disposition === 'other' || (disposition === 'new-window' && features.trim() === '')
}
