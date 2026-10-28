import type { SearchEngineId } from '@shared/types'

/**
 * Teinte de chaque moteur, prise sur sa marque. Elle sert au fond du logo et à
 * l'anneau de sélection, dans l'accueil comme dans les réglages.
 */
export const ENGINE_LOOK: Record<SearchEngineId, { tint: string; host: string }> = {
  duckduckgo: { tint: '#de5833', host: 'duckduckgo.com' },
  brave: { tint: '#fb542b', host: 'search.brave.com' },
  startpage: { tint: '#6a73d8', host: 'www.startpage.com' },
  google: { tint: '#4285f4', host: 'www.google.com' },
  bing: { tint: '#0ca6a6', host: 'www.bing.com' },
  ecosia: { tint: '#2f6b3f', host: 'www.ecosia.org' },
  qwant: { tint: '#4957d6', host: 'www.qwant.com' },
  searxng: { tint: '#62a583', host: 'searx.be' }
}
