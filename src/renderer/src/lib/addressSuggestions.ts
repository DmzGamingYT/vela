import type { AppView } from '@shared/types'
import {
  canonicalUrl,
  engineLabel,
  hostOf,
  isHomeUrl,
  isLoginUrl,
  normalizeInput,
  prettyUrl,
  readableTitle
} from '@shared/url'
import { searchOptionsOf } from '@shared/navigation'

export type AddressSuggestionKind = 'tab' | 'history' | 'bookmark' | 'search' | 'address'

export interface AddressSuggestion {
  id: string
  kind: AddressSuggestionKind
  title: string
  host: string
  url: string
  /** Valeur posée dans le champ par Tab. */
  complete: string
  tabId?: string
  favicon?: string
  spaceId?: string
}

export interface AddressSuggestionGroup {
  id: string
  title: string
  rows: AddressSuggestion[]
}

export interface AddressSuggestionModel {
  groups: AddressSuggestionGroup[]
  rows: AddressSuggestion[]
}

const GROUP_LIMIT = 5
const HOST_TOKEN =
  /\b((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})(?::\d+)?\b/i

/**
 * Un titre de suggestion ne doit jamais usurper un autre domaine. Si le titre
 * contient une adresse qui n'est pas celle de la page, ou si la page est une
 * page de connexion, seul le domaine réel reste lisible.
 */
export function suggestionTitle(
  raw: string | null | undefined,
  url: string,
  host: string
): string {
  if (!host) return (raw ?? '').trim() || url
  if (isLoginUrl(url)) return host
  const text = readableTitle(raw, url)
    .replace(/\s+/g, ' ')
    .trim()
  if (!text || text === host || text.startsWith(`${host}/`)) return host
  if (/^(?:[a-z][a-z0-9+.-]*:\/\/|www\.)/i.test(text)) return host
  const token = text.match(HOST_TOKEN)?.[1]?.toLowerCase()
  if (token && token.replace(/^www\./, '') !== host.toLowerCase()) return host
  return text
}

/**
 * Suggestions de la barre d'adresse.
 *
 * Champ vide : les onglets ouverts, puis les pages récentes et les favoris.
 * Champ rempli : d'abord ce que ↵ ouvrira (adresse ou recherche), puis les
 * correspondances connues. Une adresse canonique ne figure qu'une fois.
 */
export function buildAddressSuggestions(
  view: AppView,
  currentTabId: string,
  draft: string
): AddressSuggestionModel {
  const query = draft.replace(/\s+/g, ' ').trim()
  const needle = query.toLowerCase()
  const seen = new Set<string>()
  const groups: AddressSuggestionGroup[] = []

  const group = (id: string, title: string): AddressSuggestionGroup => {
    const existing = groups.find((entry) => entry.id === id)
    if (existing) return existing
    const created: AddressSuggestionGroup = { id, title, rows: [] }
    groups.push(created)
    return created
  }

  const add = (groupId: string, title: string, row: AddressSuggestion): void => {
    if (!row.url) return
    const key = canonicalUrl(row.url)
    if (seen.has(key)) return
    const target = group(groupId, title)
    if (target.rows.length >= GROUP_LIMIT) return
    seen.add(key)
    target.rows.push(row)
  }

  const matches = (row: AddressSuggestion): boolean =>
    !needle || `${row.title} ${row.host} ${row.url}`.toLowerCase().includes(needle)

  const tabRows: AddressSuggestion[] = view.tabs
    .filter(
      (tab) =>
        tab.id !== currentTabId && !isHomeUrl(tab.url) && /^https?:/i.test(tab.url)
    )
    .map((tab) => {
      const host = hostOf(tab.url)
      return {
        id: `tab:${tab.id}`,
        kind: 'tab',
        tabId: tab.id,
        title: suggestionTitle(tab.title, tab.url, host),
        host,
        url: tab.url,
        complete: tab.url,
        favicon: tab.favicon,
        spaceId: tab.spaceId
      }
    })

  const historyRows: AddressSuggestion[] = view.history
    .filter((entry) => /^https?:/i.test(entry.url) && !isHomeUrl(entry.url))
    .map((entry) => {
      const host = hostOf(entry.url)
      return {
        id: `history:${entry.id}`,
        kind: 'history',
        title: suggestionTitle(entry.title, entry.url, host),
        host,
        url: entry.url,
        complete: entry.url,
        favicon: entry.favicon,
        spaceId: entry.spaceId
      }
    })

  const bookmarkRows: AddressSuggestion[] = view.bookmarks
    .filter((entry) => /^https?:/i.test(entry.url) && !isHomeUrl(entry.url))
    .map((entry) => {
      const host = hostOf(entry.url)
      return {
        id: `bookmark:${entry.id}`,
        kind: 'bookmark',
        title: suggestionTitle(entry.title, entry.url, host),
        host,
        url: entry.url,
        complete: entry.url,
        favicon: entry.favicon
      }
    })

  if (!query) {
    for (const row of tabRows) add('tabs', 'Onglets ouverts', row)
    for (const row of historyRows) add('history', 'Récents', row)
    for (const row of bookmarkRows) add('bookmarks', 'Favoris', row)
  } else {
    const target = normalizeInput(query, searchOptionsOf(view.settings))
    const engine = engineLabel(
      view.settings.searchEngine,
      view.settings.customEngines.find((entry) => entry.id === view.settings.customEngineId)?.name
    )
    const primary: AddressSuggestion =
      target.kind === 'search'
        ? {
            id: 'primary',
            kind: 'search',
            title: `Rechercher « ${query} »`,
            host: engine,
            url: target.url,
            complete: query
          }
        : {
            id: 'primary',
            kind: 'address',
            title: prettyUrl(target.url),
            host: 'Adresse',
            url: target.url,
            complete: target.url
          }
    add('primary', 'Aller', primary)

    for (const row of tabRows) {
      if (matches(row)) add('tabs', 'Onglets ouverts', row)
    }
    for (const row of historyRows) {
      if (matches(row)) add('history', 'Historique', row)
    }
    for (const row of bookmarkRows) {
      if (matches(row)) add('bookmarks', 'Favoris', row)
    }
  }

  const visible = groups.filter((entry) => entry.rows.length > 0)
  return { groups: visible, rows: visible.flatMap((entry) => entry.rows) }
}
