import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, defaultProviders } from './defaults'
import {
  buildChatRequest,
  buildTestRequest,
  endpointHost,
  isLoopbackEndpoint,
  parseStreamPayload,
  providerById,
  providerDefaults,
  providerReady
} from './providers'

const openai = providerById('openai')
const anthropic = providerById('anthropic')
const google = providerById('google')
const local = providerById('local')

describe('endpoint local ou distant', () => {
  it('reconnaît la boucle locale', () => {
    for (const url of ['http://localhost:11434/v1', 'http://127.0.0.1:8080', 'https://localhost', 'http://[::1]:11434']) {
      expect(isLoopbackEndpoint(url), url).toBe(true)
    }
  })

  it('ne prend pas un hôte distant pour la machine', () => {
    for (const url of ['https://exemple.fr/v1', 'http://192.168.1.20:11434', 'https://localhost.exemple.fr']) {
      expect(isLoopbackEndpoint(url), url).toBe(false)
    }
    expect(isLoopbackEndpoint('pas une url')).toBe(false)
    expect(isLoopbackEndpoint('file:///tmp/x')).toBe(false)
  })

  it('donne l’hôte à afficher', () => {
    expect(endpointHost('https://exemple.fr:8443/v1')).toBe('exemple.fr:8443')
    expect(endpointHost('nope')).toBeNull()
  })
})

describe('catalogue', () => {
  it('couvre les dix fournisseurs de la page Modèles', () => {
    expect(Object.keys(providerDefaults('openai')).sort()).toEqual(['baseUrl', 'hasKey', 'model', 'status'])
    expect(defaultProviders().local.model).toBe(local.model)
    expect(providerById('local').local).toBe(true)
    expect(providerById('groq').baseUrl).toContain('groq.com')
  })

  it('prépare un état par défaut par fournisseur', () => {
    const state = providerDefaults('anthropic')
    expect(state.model).toBe(anthropic.model)
    expect(state.status).toBe('none')
    expect(state.hasKey).toBe(false)
  })
})

describe('requêtes de chat', () => {
  const messages = [
    { role: 'system' as const, content: 'Tu es Vela.' },
    { role: 'user' as const, content: 'Résume cette page.' }
  ]

  it('construit une requête OpenAI compatible', () => {
    const request = buildChatRequest(openai, { baseUrl: 'https://api.openai.com/v1/', model: 'gpt-4o-mini' }, 'sk-test', messages)
    expect(request.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(request.headers.Authorization).toBe('Bearer sk-test')
    const body = JSON.parse(request.body)
    expect(body.model).toBe('gpt-4o-mini')
    expect(body.stream).toBe(true)
    expect(body.messages).toHaveLength(2)
  })

  it('n’envoie pas d’en-tête Authorization sans clé', () => {
    const request = buildChatRequest(local, { baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' }, null, messages)
    expect(request.headers.Authorization).toBeUndefined()
    expect(request.url).toBe('http://localhost:11434/v1/chat/completions')
  })

  it('parle le protocole d’Anthropic', () => {
    const request = buildChatRequest(anthropic, { baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-5' }, 'sk-ant-x', messages)
    expect(request.url).toBe('https://api.anthropic.com/v1/messages')
    expect(request.headers['x-api-key']).toBe('sk-ant-x')
    expect(request.headers['anthropic-version']).toBe('2023-06-01')
    const body = JSON.parse(request.body)
    expect(body.system).toBe('Tu es Vela.')
    expect(body.messages).toEqual([{ role: 'user', content: 'Résume cette page.' }])
    expect(body.max_tokens).toBeGreaterThan(0)
  })

  it('parle le protocole de Google sans mettre la clé dans l’URL', () => {
    const request = buildChatRequest(google, { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash' }, 'AIza-key', messages)
    expect(request.url).toContain('/models/gemini-2.5-flash:streamGenerateContent')
    expect(request.url).toContain('alt=sse')
    expect(request.url).not.toContain('AIza-key')
    expect(request.url).not.toContain('key=')
    expect(request.headers['x-goog-api-key']).toBe('AIza-key')
    const body = JSON.parse(request.body)
    expect(body.contents[0].parts[0].text).toBe('Résume cette page.')
    expect(body.systemInstruction.parts[0].text).toBe('Tu es Vela.')
  })

  it('garde la clé Google hors de l’URL de test', () => {
    const request = buildTestRequest(google, { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'x' }, 'AIza-key')
    expect(request.url).toBe('https://generativelanguage.googleapis.com/v1beta/models')
    expect(request.url).not.toContain('key=')
    expect(request.headers['x-goog-api-key']).toBe('AIza-key')
  })
})

describe('test de clé', () => {
  it('interroge /models pour les fournisseurs compatibles OpenAI', () => {
    const request = buildTestRequest(openai, { baseUrl: 'https://api.openai.com/v1', model: 'x' }, 'sk-1')
    expect(request.url).toBe('https://api.openai.com/v1/models')
    expect(request.headers.Authorization).toBe('Bearer sk-1')
  })

  it('utilise les en-têtes natifs d’Anthropic et de Google', () => {
    const anth = buildTestRequest(anthropic, { baseUrl: 'https://api.anthropic.com/v1', model: 'x' }, 'sk-ant')
    expect(anth.headers['x-api-key']).toBe('sk-ant')
    const goog = buildTestRequest(google, { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'x' }, 'AIza')
    expect(goog.url).not.toContain('key=')
    expect(goog.headers['x-goog-api-key']).toBe('AIza')
  })
})

describe('flux SSE', () => {
  it('lit OpenAI, Anthropic et Google', () => {
    expect(parseStreamPayload('openai', '{"choices":[{"delta":{"content":"Bonjour"}}]}')).toBe('Bonjour')
    expect(parseStreamPayload('anthropic', '{"type":"content_block_delta","delta":{"text":"Salut"}}')).toBe('Salut')
    expect(
      parseStreamPayload('google', '{"candidates":[{"content":{"parts":[{"text":"Hi"},{"text":" there"}]}}]}')
    ).toBe('Hi there')
  })

  it('ignore les fragments incomplets', () => {
    expect(parseStreamPayload('openai', '{"choices":')).toBe('')
    expect(parseStreamPayload('openai', '[DONE]')).toBe('')
  })
})

describe('état actif', () => {
  it('exige une clé sauf pour un serveur local', () => {
    const ready = {
      ...DEFAULT_SETTINGS,
      agent: {
        mode: 'api' as const,
        provider: 'local' as const,
        providers: { ...defaultProviders(), local: providerDefaults('local') }
      }
    }
    expect(providerReady(ready)).toBe(true)
    const withoutKey = {
      ...DEFAULT_SETTINGS,
      agent: { ...ready.agent, provider: 'openai' as const }
    }
    expect(providerReady(withoutKey)).toBe(false)
  })
})
