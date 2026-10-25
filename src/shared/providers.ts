import type { ProviderId, ProviderSettings, Settings } from './types'

export type ProviderProtocol = 'openai' | 'anthropic' | 'google'

export interface ProviderDefinition {
  id: ProviderId
  label: string
  detail: string
  protocol: ProviderProtocol
  baseUrl: string
  model: string
  keyLabel: string
  /** Page officielle où créer la clé. */
  keyUrl: string
  mark: string
  color: string
  /** Un serveur local (Ollama, LM Studio…) n'exige pas de clé. */
  local?: boolean
}

/**
 * Même promesse que la page Modèles de Zephium : un fournisseur par ligne,
 * sa clé, son état, et le modèle actif. Tout est compatible OpenAI sauf
 * Anthropic et Google, qui ont leur propre protocole.
 */
export const PROVIDERS: ProviderDefinition[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    detail: 'Modèles GPT, via l’API officielle.',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    keyLabel: 'sk-…',
    keyUrl: 'https://platform.openai.com/api-keys',
    mark: 'OA',
    color: '#74aa9c'
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    detail: 'Modèles Claude, longs contextes.',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-5',
    keyLabel: 'sk-ant-…',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    mark: 'A',
    color: '#d97757'
  },
  {
    id: 'google',
    label: 'Google',
    detail: 'Gemini, via Google AI Studio.',
    protocol: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.5-flash',
    keyLabel: 'AIza…',
    keyUrl: 'https://aistudio.google.com/apikey',
    mark: 'G',
    color: '#8ab4f8'
  },
  {
    id: 'xai',
    label: 'xAI',
    detail: 'Modèles Grok.',
    protocol: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    model: 'grok-4',
    keyLabel: 'xai-…',
    keyUrl: 'https://console.x.ai',
    mark: 'x',
    color: '#f4f4f6'
  },
  {
    id: 'mistral',
    label: 'Mistral',
    detail: 'Modèles Mistral, hébergés en Europe.',
    protocol: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-large-latest',
    keyLabel: 'Clé Mistral',
    keyUrl: 'https://console.mistral.ai/api-keys',
    mark: 'M',
    color: '#ff7000'
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    detail: 'DeepSeek, à coût réduit.',
    protocol: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    keyLabel: 'sk-…',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    mark: 'D',
    color: '#4d6bfe'
  },
  {
    id: 'groq',
    label: 'Groq',
    detail: 'Inférence très rapide.',
    protocol: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    keyLabel: 'gsk_…',
    keyUrl: 'https://console.groq.com/keys',
    mark: 'Gq',
    color: '#f55036'
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    detail: 'Inférence accélérée sur wafer.',
    protocol: 'openai',
    baseUrl: 'https://api.cerebras.ai/v1',
    model: 'llama-3.3-70b',
    keyLabel: 'csk-…',
    keyUrl: 'https://cloud.cerebras.ai',
    mark: 'C',
    color: '#f0a03c'
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    detail: 'Une clé, tous les modèles.',
    protocol: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
    keyLabel: 'sk-or-…',
    keyUrl: 'https://openrouter.ai/keys',
    mark: 'OR',
    color: '#a9b4ff'
  },
  {
    id: 'local',
    label: 'Local',
    detail: 'Ollama, LM Studio ou tout serveur compatible OpenAI.',
    protocol: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.2',
    keyLabel: 'Facultative',
    keyUrl: 'https://ollama.com',
    mark: '⌂',
    color: '#88d0b3',
    local: true
  }
]

const BY_ID = new Map(PROVIDERS.map((provider) => [provider.id, provider]))

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && BY_ID.has(value as ProviderId)
}

export function providerById(id: ProviderId): ProviderDefinition {
  return BY_ID.get(id) ?? PROVIDERS[0]
}

export function providerState(settings: Settings): ProviderSettings {
  const id = settings.agent.provider
  return settings.agent.providers[id] ?? providerDefaults(id)
}

/** Vrai si l’agent peut réellement joindre le fournisseur actif. */
export function providerReady(settings: Settings): boolean {
  if (settings.agent.mode !== 'api') return false
  const definition = providerById(settings.agent.provider)
  const state = providerState(settings)
  return definition.local || state.hasKey
}

export function providerDefaults(id: ProviderId): ProviderSettings {
  const definition = providerById(id)
  return {
    model: definition.model,
    baseUrl: definition.baseUrl,
    hasKey: false,
    status: 'none'
  }
}

export interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

export interface ChatRequest {
  url: string
  headers: Record<string, string>
  body: string
}

function trimBase(baseUrl: string, fallback: string): string {
  const value = (baseUrl || fallback).trim().replace(/\/+$/, '')
  return value || fallback
}

/**
 * Construit une requête de chat en streaming pour les trois protocoles.
 * Fonction pure : testée sans réseau, réutilisée par le processus principal.
 */
export function buildChatRequest(
  definition: ProviderDefinition,
  config: { baseUrl: string; model: string },
  key: string | null,
  messages: ChatMessage[]
): ChatRequest {
  const base = trimBase(config.baseUrl, definition.baseUrl)
  const model = config.model.trim() || definition.model
  const system = messages.find((message) => message.role === 'system')?.content ?? ''
  const user = messages
    .filter((message) => message.role === 'user')
    .map((message) => message.content)
    .join('\n\n')

  if (definition.protocol === 'anthropic') {
    return {
      url: `${base}/messages`,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key ?? '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        stream: true,
        system,
        messages: [{ role: 'user', content: user }]
      })
    }
  }

  if (definition.protocol === 'google') {
    return {
      url: `${base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key ?? '')}`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents: [{ role: 'user', parts: [{ text: user }] }]
      })
    }
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (key) headers.Authorization = `Bearer ${key}`
  return {
    url: `${base}/chat/completions`,
    headers,
    body: JSON.stringify({ model, stream: true, messages })
  }
}

/** Extrait le texte d’une charge SSE, quel que soit le protocole. */
export function parseStreamPayload(protocol: ProviderProtocol, payload: string): string {
  let data: unknown
  try {
    data = JSON.parse(payload)
  } catch {
    return ''
  }
  if (!data || typeof data !== 'object') return ''
  const record = data as Record<string, unknown>

  if (protocol === 'anthropic') {
    const delta = record.delta as { text?: unknown } | undefined
    return typeof delta?.text === 'string' ? delta.text : ''
  }

  if (protocol === 'google') {
    const candidates = record.candidates as { content?: { parts?: { text?: unknown }[] } }[] | undefined
    const parts = candidates?.[0]?.content?.parts ?? []
    return parts.map((part) => (typeof part.text === 'string' ? part.text : '')).join('')
  }

  const choices = record.choices as { delta?: { content?: unknown }; text?: unknown }[] | undefined
  const delta = choices?.[0]?.delta?.content
  if (typeof delta === 'string') return delta
  return typeof choices?.[0]?.text === 'string' ? (choices[0].text as string) : ''
}

/** Requête légère utilisée par le bouton « Tester ». */
export function buildTestRequest(
  definition: ProviderDefinition,
  config: { baseUrl: string; model: string },
  key: string | null
): { url: string; headers: Record<string, string> } {
  const base = trimBase(config.baseUrl, definition.baseUrl)
  if (definition.protocol === 'anthropic') {
    return {
      url: `${base}/models`,
      headers: { 'x-api-key': key ?? '', 'anthropic-version': '2023-06-01' }
    }
  }
  if (definition.protocol === 'google') {
    return { url: `${base}/models?key=${encodeURIComponent(key ?? '')}`, headers: {} }
  }
  const headers: Record<string, string> = {}
  if (key) headers.Authorization = `Bearer ${key}`
  return { url: `${base}/models`, headers }
}
