import { describe, expect, it } from 'vitest'
import { HOME_URL } from './types'
import {
  displayTitle,
  engineHost,
  hostOf,
  isHomeUrl,
  isLoadableUrl,
  isPublicHost,
  normalizeInput,
  prettyUrl,
  searchUrl,
  titleBadge
} from './url'

describe('normalizeInput', () => {
  it('renvoie l’accueil pour une saisie vide', () => {
    expect(normalizeInput('   ')).toEqual({ url: HOME_URL, kind: 'url' })
  })

  it('conserve les URL http et https', () => {
    expect(normalizeInput('https://exemple.fr/a?b=1')).toEqual({
      url: 'https://exemple.fr/a?b=1',
      kind: 'url'
    })
  })

  it('ajoute https à un domaine seul', () => {
    expect(normalizeInput('arc.net')).toEqual({ url: 'https://arc.net', kind: 'url' })
    expect(normalizeInput('www.zephium.app/work')).toEqual({
      url: 'https://www.zephium.app/work',
      kind: 'url'
    })
  })

  it('passe localhost en http', () => {
    expect(normalizeInput('localhost:5173')).toEqual({
      url: 'http://localhost:5173',
      kind: 'url'
    })
  })

  it('transforme une phrase en recherche', () => {
    expect(normalizeInput('le meilleur navigateur', 'duckduckgo')).toEqual({
      url: searchUrl('le meilleur navigateur', 'duckduckgo'),
      kind: 'search'
    })
  })

  it.each([
    'duckduckgo',
    'brave',
    'startpage',
    'google',
    'bing',
    'ecosia',
    'qwant',
    'searxng'
  ] as const)('construit une recherche pour %s', (engine) => {
    const result = normalizeInput('Bruxelles Charleroi', engine)
    expect(result.kind).toBe('search')
    expect(result.url).toBe(searchUrl('Bruxelles Charleroi', engine))
  })

  it('ne laisse pas passer les schémas dangereux', () => {
    const result = normalizeInput('javascript:alert(1)')
    expect(result.kind).toBe('search')
    expect(result.url.startsWith('https://duckduckgo.com')).toBe(true)
  })
})

describe('helpers', () => {
  it('reconnaît l’accueil', () => {
    expect(isHomeUrl('')).toBe(true)
    expect(isHomeUrl(HOME_URL)).toBe(true)
    expect(isHomeUrl('https://arc.net')).toBe(false)
  })

  it('extrait le domaine', () => {
    expect(hostOf('https://www.lemonde.fr/article')).toBe('lemonde.fr')
    expect(hostOf('pas une url')).toBe('')
  })

  it('affiche une adresse courte', () => {
    expect(prettyUrl('https://www.notion.so/page/')).toBe('notion.so/page')
    expect(prettyUrl(HOME_URL)).toBe('Nouvel onglet')
  })
})

describe('isPublicHost', () => {
  it('accepte les hôtes du web', () => {
    expect(isPublicHost('example.com')).toBe(true)
    expect(isPublicHost('cdn.jsdelivr.net')).toBe(true)
    expect(isPublicHost('8.8.8.8')).toBe(true)
  })

  it('refuse les adresses du réseau local', () => {
    expect(isPublicHost('localhost')).toBe(false)
    expect(isPublicHost('app.localhost')).toBe(false)
    expect(isPublicHost('box.local')).toBe(false)
    expect(isPublicHost('127.0.0.1')).toBe(false)
    expect(isPublicHost('10.0.0.5')).toBe(false)
    expect(isPublicHost('172.16.4.2')).toBe(false)
    expect(isPublicHost('192.168.1.1')).toBe(false)
    expect(isPublicHost('169.254.169.254')).toBe(false)
    expect(isPublicHost('::1')).toBe(false)
    expect(isPublicHost('fd00::1')).toBe(false)
    expect(isPublicHost('fe80::1')).toBe(false)
  })
})

describe('isLoadableUrl', () => {
  it('accepte le web, la page blanche et l’accueil', () => {
    expect(isLoadableUrl('https://example.com')).toBe(true)
    expect(isLoadableUrl('http://example.com')).toBe(true)
    expect(isLoadableUrl('about:blank')).toBe(true)
    expect(isLoadableUrl(HOME_URL)).toBe(true)
  })

  it('refuse les schémas qui ouvriraient le disque ou le navigateur', () => {
    expect(isLoadableUrl('file:///Users/velo/.ssh/id_rsa')).toBe(false)
    expect(isLoadableUrl('data:text/html,<h1>salut</h1>')).toBe(false)
    expect(isLoadableUrl('devtools://devtools/bundled/inspector.html')).toBe(false)
    expect(isLoadableUrl('javascript:alert(1)')).toBe(false)
    expect(isLoadableUrl('')).toBe(false)
  })

  it('ne se laisse pas tromper par la casse ni par les espaces', () => {
    expect(isLoadableUrl('  HTTPS://example.com  ')).toBe(true)
    expect(isLoadableUrl('FILE:///etc/passwd')).toBe(false)
  })
})

describe('compteur de titre', () => {
  it('lit un compteur en tête de titre', () => {
    expect(titleBadge('(12) Gmail')).toBe(12)
    expect(titleBadge('[3] Slack')).toBe(3)
    expect(displayTitle('(1109) YouTube')).toBe('YouTube')
  })

  it('ne confond pas une année avec un compteur', () => {
    expect(titleBadge('(2024) Le film')).toBeNull()
    expect(displayTitle('(2024) Le film')).toBe('(2024) Le film')
  })

  it('ignore zéro et les titres sans compteur', () => {
    expect(titleBadge('(0) Boîte')).toBeNull()
    expect(titleBadge('Le Monde')).toBeNull()
    expect(displayTitle('')).toBe('')
    expect(displayTitle('(7)')).toBe('(7)')
  })
})

describe('engineHost', () => {
  it('renvoie l’hôte pré-connectable de chaque moteur', () => {
    expect(engineHost('duckduckgo')).toBe('duckduckgo.com')
    expect(engineHost('brave')).toBe('search.brave.com')
    expect(engineHost('startpage')).toBe('www.startpage.com')
    expect(engineHost('searxng')).toBe('searx.be')
  })

  it('suit l’instance SearXNG choisie', () => {
    expect(engineHost('searxng', 'https://searx.example.org/')).toBe('searx.example.org')
    expect(searchUrl('verre', 'searxng', 'searx.example.org')).toBe(
      'https://searx.example.org/search?q=verre'
    )
    expect(engineHost('searxng', 'pas une url')).toBe('searx.be')
  })
})
