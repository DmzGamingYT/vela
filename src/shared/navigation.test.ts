import { describe, expect, it } from 'vitest'
import {
  HISTORY_RANGES,
  acceptLanguage,
  customEngineId,
  customSearchUrl,
  describeZoom,
  historyRangeFloor,
  keepByRetention,
  resolveEngine,
  sanitizeCustomEngines,
  sanitizeDefaultZoom,
  sanitizeEngineName,
  sanitizeEngineTemplate,
  sanitizeKeywords,
  sanitizeStartupUrl,
  searchAddressOf,
  searchOptionsOf,
  startupAddress
} from './navigation'
import { normalizeInput, searchUrl } from './url'

const NOW = new Date('2026-11-05T12:00:00Z').getTime()

describe('modèle d’adresse d’un moteur ajouté', () => {
  it('accepte une adresse https avec un seul %s', () => {
    expect(sanitizeEngineTemplate('https://exemple.org/?q=%s')).toBe('https://exemple.org/?q=%s')
    expect(sanitizeEngineTemplate('  https://exemple.org/search?q=%s&lang=fr  ')).toBe(
      'https://exemple.org/search?q=%s&lang=fr'
    )
  })

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd?q=%s',
    'http://exemple.org/?q=%s',
    'https://exemple.org/sans-modele',
    'https://exemple.org/?q=%s&r=%s',
    'https://user:pass@exemple.org/?q=%s',
    'https://exemple.org/?q=%s<script>',
    'ftp://exemple.org/?q=%s',
    ''
  ])('refuse %s', (value) => {
    expect(sanitizeEngineTemplate(value)).toBeNull()
  })

  it('encode la requête une seule fois', () => {
    expect(customSearchUrl('https://exemple.org/?q=%s', 'a b&c')).toBe('https://exemple.org/?q=a%20b%26c')
  })
})

describe('moteurs ajoutés', () => {
  it('garde des identifiants stables, bornés et uniques', () => {
    expect(customEngineId('Mon Moteur', [])).toBe('custom-mon-moteur')
    expect(customEngineId('Mon Moteur', ['custom-mon-moteur'])).toBe('custom-mon-moteur-2')
    expect(customEngineId('Été', [])).toBe('custom-ete')
  })

  it('nettoie une liste bricolée sans perdre les entrées valides', () => {
    const engines = sanitizeCustomEngines([
      { id: 'custom-a', name: 'A <b>', template: 'https://a.example/?q=%s' },
      { id: 'custom-b', name: 'B', template: 'javascript:alert(1)' },
      { id: 'custom-a', name: 'Doublon', template: 'https://a.example/?q=%s' }
    ])
    expect(engines).toEqual([{ id: 'custom-a', name: 'A b', template: 'https://a.example/?q=%s' }])
    expect(sanitizeEngineName('  Trop   d’espaces  ')).toBe('Trop d’espaces')
  })

  it('ramène un moteur « custom » orphelin sur un moteur intégré', () => {
    expect(resolveEngine({ searchEngine: 'custom', customEngines: [] })).toEqual({
      engine: 'duckduckgo',
      template: null
    })
    expect(
      resolveEngine({
        searchEngine: 'custom',
        customEngineId: 'custom-a',
        customEngines: [{ id: 'custom-a', name: 'A', template: 'https://a.example/?q=%s' }]
      })
    ).toEqual({ engine: 'custom', template: 'https://a.example/?q=%s' })
  })
})

describe('mots-clés rapides', () => {
  const options = searchOptionsOf({
    searchEngine: 'duckduckgo',
    searxInstance: '',
    searchKeywords: [
      { keyword: 'g', engineId: 'google' },
      { keyword: 'm', engineId: 'custom-a' }
    ],
    customEngines: [{ id: 'custom-a', name: 'A', template: 'https://a.example/?q=%s' }]
  })

  it('envoie « g verre » sur le moteur du mot-clé', () => {
    expect(normalizeInput('g verre', options)).toEqual({
      url: 'https://www.google.com/search?q=verre',
      kind: 'search'
    })
  })

  it('suit un moteur ajouté', () => {
    expect(normalizeInput('m verre', options)).toEqual({
      url: 'https://a.example/?q=verre',
      kind: 'search'
    })
  })

  it('ne prend pas une adresse pour un mot-clé', () => {
    expect(normalizeInput('arc.net', options).kind).toBe('url')
    expect(normalizeInput('g', options).kind).toBe('search')
  })

  it('nettoie les doublons et les moteurs inconnus', () => {
    expect(
      sanitizeKeywords(
        [
          { keyword: 'G', engineId: 'google' },
          { keyword: 'g', engineId: 'bing' },
          { keyword: 'x', engineId: 'inexistant' }
        ],
        []
      )
    ).toEqual([{ keyword: 'g', engineId: 'google' }])
  })

  it('produit l’adresse du moteur choisi', () => {
    expect(searchAddressOf({ searchEngine: 'brave', searxInstance: '' }, 'verre')).toBe(
      'https://search.brave.com/search?q=verre'
    )
    expect(searchUrl('verre', 'custom', '', 'https://a.example/?q=%s')).toBe('https://a.example/?q=verre')
    expect(searchUrl('verre', 'custom', '', 'javascript:alert(1)')).toBe('https://duckduckgo.com/?q=verre')
  })
})

describe('historique', () => {
  it('garde selon la durée choisie', () => {
    expect(keepByRetention(NOW - 1000, 'never', NOW)).toBe(false)
    expect(keepByRetention(NOW - 8 * 86_400_000, '7', NOW)).toBe(false)
    expect(keepByRetention(NOW - 20 * 86_400_000, '30', NOW)).toBe(true)
    expect(keepByRetention(NOW - 400 * 86_400_000, 'forever', NOW)).toBe(true)
  })

  it('borne chaque période d’effacement', () => {
    expect(historyRangeFloor('hour', NOW)).toBe(NOW - 3_600_000)
    expect(historyRangeFloor('week', NOW)).toBe(NOW - 7 * 86_400_000)
    expect(historyRangeFloor('all', NOW)).toBe(0)
    const today = new Date(historyRangeFloor('today', NOW))
    expect(today.getHours()).toBe(0)
    expect(HISTORY_RANGES.map((entry) => entry.id)).toEqual(['hour', 'today', 'week', 'all'])
  })
})

describe('démarrage, langue et zoom', () => {
  it('n’accepte qu’une page https pour le démarrage', () => {
    expect(sanitizeStartupUrl('exemple.fr')).toBe('https://exemple.fr/')
    expect(sanitizeStartupUrl('javascript:alert(1)')).toBe('')
    expect(sanitizeStartupUrl('http://exemple.fr')).toBe('')
    expect(sanitizeStartupUrl('file:///etc/passwd')).toBe('')
    expect(startupAddress('restore', 'https://exemple.fr')).toBeNull()
    expect(startupAddress('home', '')).toBe('vela://home')
    expect(startupAddress('url', 'exemple.fr')).toBe('https://exemple.fr/')
  })

  it('construit l’en-tête de langue et bornes le zoom', () => {
    expect(acceptLanguage('fr')).toBe('fr,fr;q=0.9,en;q=0.6')
    expect(acceptLanguage('xx')).toBe('fr,fr;q=0.9,en;q=0.6')
    expect(sanitizeDefaultZoom(1.25)).toBe(1.25)
    expect(sanitizeDefaultZoom(3)).toBe(1)
    expect(describeZoom(1.25)).toBe('125 %')
  })
})
