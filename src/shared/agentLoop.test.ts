import { describe, expect, it } from 'vitest'
import {
  AGENT_BUDGET,
  buildActReport,
  buildStepPrompt,
  describeAction,
  parseAgentAction,
  type AgentActionEntry
} from './agentLoop'

describe('analyse des réponses du modèle', () => {
  it('lit un objet JSON même entouré de texte et de balises de code', () => {
    const reply = 'Je commence par ouvrir la page.\n```json\n{"tool":"open","args":{"url":"https://example.com/doc"}}\n```'
    expect(parseAgentAction(reply)).toEqual({ tool: 'open', args: { url: 'https://example.com/doc' } })
  })

  it('garde la dernière action quand le modèle se répète', () => {
    const reply =
      '{"tool":"read","args":{}}\n{"tool":"click","args":{"role":"link","name":"Tarifs"}}'
    expect(parseAgentAction(reply)).toEqual({
      tool: 'click',
      args: { role: 'link', name: 'Tarifs' }
    })
  })

  it('refuse un outil inconnu plutôt que de l’exécuter', () => {
    expect(parseAgentAction('{"tool":"eval","args":{"code":"process.exit()"}}')).toBeNull()
  })

  it('refuse une adresse hors du web', () => {
    expect(parseAgentAction('{"tool":"open","args":{"url":"javascript:alert(1)"}}')).toBeNull()
    expect(parseAgentAction('{"tool":"open","args":{"url":"file:///etc/passwd"}}')).toBeNull()
  })

  it('exige une cible pour cliquer', () => {
    expect(parseAgentAction('{"tool":"click","args":{}}')).toBeNull()
    expect(parseAgentAction('{"tool":"click","args":{"name":"Panneau"}}')).toEqual({
      tool: 'click',
      args: { name: 'Panneau' }
    })
  })

  it('borne le défilement et le nombre d’extraits', () => {
    expect(parseAgentAction('{"tool":"scroll","args":{"amount":9000}}')).toEqual({
      tool: 'scroll',
      args: { direction: 'down', amount: 2000 }
    })
    expect(parseAgentAction('{"tool":"extract","args":{"what":"links","limit":400}}')).toEqual({
      tool: 'extract',
      args: { what: 'links', limit: 30 }
    })
  })

  it('s’arrête proprement quand le modèle répond en prose', () => {
    expect(parseAgentAction('Voici ce que j’ai trouvé sur la page.')).toBeNull()
    expect(parseAgentAction('')).toBeNull()
  })
})

describe('libellés du journal', () => {
  it('nomme chaque action en français, au plus près de ce qui est fait', () => {
    expect(describeAction({ tool: 'open', args: { url: 'https://www.lemonde.fr/a' } })).toBe(
      'Ouvrir lemonde.fr'
    )
    expect(describeAction({ tool: 'click', args: { name: 'Accepter' } })).toBe('Cliquer sur « Accepter »')
    expect(describeAction({ tool: 'type', args: { name: 'Recherche', text: 'vélo', submit: true } })).toBe(
      'Saisir dans « Recherche » « vélo » puis Entrée'
    )
    expect(describeAction({ tool: 'scroll', args: { direction: 'up' } })).toBe('Défiler vers le haut')
    expect(describeAction({ tool: 'extract', args: { what: 'headings' } })).toBe('Relever les titres')
    expect(describeAction({ tool: 'done', args: {} })).toBe('Conclure')
  })
})

describe('consigne de chaque tour', () => {
  it('rappelle la demande, le budget et l’état de l’onglet', () => {
    const prompt = buildStepPrompt({
      prompt: 'Trouve le prix du vélo',
      step: 3,
      steps: AGENT_BUDGET.steps,
      page: { title: 'Boutique', url: 'https://exemple.fr/velo' },
      transcript: '1. Ouvrir exemple.fr — ok'
    })
    expect(prompt).toContain('Trouve le prix du vélo')
    expect(prompt).toContain(`Étape 3 sur ${AGENT_BUDGET.steps}`)
    expect(prompt).toContain('Boutique')
    expect(prompt).toContain('1. Ouvrir exemple.fr — ok')
    expect(prompt).toContain('un seul objet JSON')
  })

  it('dit franchement qu’aucune page n’est ouverte', () => {
    const prompt = buildStepPrompt({
      prompt: 'Cherche',
      step: 1,
      steps: 10,
      page: null,
      transcript: ''
    })
    expect(prompt).toContain('Aucune page n’est ouverte')
    expect(prompt).toContain('Aucune pour l’instant.')
  })
})

describe('rapport final', () => {
  const entry = (index: number, ok: boolean): AgentActionEntry => ({
    id: `e${index}`,
    index,
    tool: 'click',
    label: `Cliquer sur « Étape ${index} »`,
    detail: ok ? 'bouton' : 'introuvable',
    ok,
    at: 0
  })

  it('liste les actions réellement exécutées et leur état', () => {
    const report = buildActReport({
      prompt: 'Ouvre la page et lis le titre',
      answer: 'Le titre est « Bonjour ».',
      journal: [entry(1, true), entry(2, false)],
      page: { title: 'Bonjour', url: 'https://exemple.fr/' },
      reason: null
    })
    expect(report).toContain('Mode agent')
    expect(report).toContain('Le titre est « Bonjour ».')
    expect(report).toContain('| 1 | Cliquer sur « Étape 1 » | Fait | bouton |')
    expect(report).toContain('| 2 | Cliquer sur « Étape 2 » | Échec | introuvable |')
    expect(report).toContain('2 actions, dont 1 en échec.')
    expect(report).toContain('[Bonjour](https://exemple.fr/)')
  })

  it('explique l’arrêt quand l’agent n’a pas conclu', () => {
    const report = buildActReport({
      prompt: 'Va au bout',
      answer: '',
      journal: [entry(1, true)],
      page: null,
      reason: 'budget'
    })
    expect(report).toContain('budget d’actions')
    expect(report).toContain('1 action exécutée, aucune en échec.')
    expect(report).not.toContain('## Page finale')
  })

  it('ne prétend rien quand rien n’a été fait', () => {
    const report = buildActReport({
      prompt: '',
      answer: '',
      journal: [],
      page: null,
      reason: 'unparsed'
    })
    expect(report).toContain('Aucune action n’a été exécutée.')
    expect(report).toContain('autre chose qu’une action')
  })
})
