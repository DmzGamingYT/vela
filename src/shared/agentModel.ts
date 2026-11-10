import {
  buildChatRequest,
  buildTestRequest,
  parseStreamPayload,
  type ChatMessage,
  type ChatRequest,
  type ProviderDefinition
} from './providers'

/**
 * Façade d'inférence : la même forme que les API Web AI des navigateurs
 * (`availability()`, `create()`, `promptStreaming()`), pour que la boucle
 * d'agent ne dépende pas de la façon dont le modèle est joint. Aujourd'hui
 * l'implémentation parle HTTP et SSE ; un moteur embarqué dans l'application
 * pourra se glisser derrière la même interface sans toucher aux appelants.
 */
export type ModelAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable'

/** Réponse d'une sonde : l'état, et de quoi expliquer un refus. */
export interface ModelProbe {
  availability: ModelAvailability
  /** Code HTTP quand le serveur a répondu autre chose que 2xx. */
  status?: number
  /** Texte court renvoyé par le fournisseur, déjà nettoyé. */
  detail?: string
}

export interface ModelSessionOptions {
  /** Consigne système du tour ; vide pour un appel sans rôle. */
  system?: string
  /**
   * Forme attendue de la réponse. Un fournisseur compatible OpenAI la reçoit
   * en `response_format` strict : il ne peut plus répondre autre chose. Les
   * protocoles Anthropic et Google n'ont pas d'équivalent, la consigne reste
   * en prose pour eux.
   */
  schema?: Record<string, unknown>
}

export interface AgentModelSession {
  prompt(text: string): Promise<string>
  promptStreaming(text: string): AsyncIterable<string>
  destroy(): void
}

export interface AgentModel {
  readonly id: string
  readonly label: string
  probe(): Promise<ModelProbe>
  availability(): Promise<ModelAvailability>
  create(options?: ModelSessionOptions): Promise<AgentModelSession>
}

export interface ChatModelOptions {
  definition: ProviderDefinition
  config: { baseUrl: string; model: string }
  key: string | null
  /** Signal de l'exécution : annuler l'agent coupe le tour en cours. */
  signal?: AbortSignal
  /** Durée maximale d'un tour ; 0 pour aucune limite (flux long). */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 60_000
const PROBE_TIMEOUT_MS = 9000

/** Ajoute la contrainte de forme à la requête, quand le protocole sait la porter. */
function constrained(
  request: ChatRequest,
  schema: Record<string, unknown> | undefined,
  definition: ProviderDefinition
): ChatRequest {
  if (!schema || definition.protocol !== 'openai') return request
  try {
    const body = JSON.parse(request.body) as Record<string, unknown>
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: 'reponse', strict: true, schema }
    }
    return { ...request, body: JSON.stringify(body) }
  } catch {
    // Corps inattendu : on préfère une requête libre à une requête cassée.
    return request
  }
}

function timeoutMessage(ms: number): string {
  if (ms <= 0) return 'Le modèle n’a pas répondu.'
  if (ms === DEFAULT_TIMEOUT_MS) return 'Le modèle n’a pas répondu dans la minute.'
  const seconds = Math.max(1, Math.round(ms / 1000))
  return `Le modèle n’a pas répondu dans les ${seconds} secondes.`
}

/**
 * Modèle branché sur un fournisseur compatible (OpenAI, Anthropic, Google,
 * serveur local). Une session ne garde pas d'historique : la mémoire de
 * l'agent vit dans son journal d'actions, pas dans le modèle.
 */
export function chatModel(options: ChatModelOptions): AgentModel {
  const { definition, config, key, signal } = options
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const probe = async (): Promise<ModelProbe> => {
    const request = buildTestRequest(definition, config, key)
    try {
      const response = await fetch(request.url, {
        headers: request.headers,
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
      })
      if (response.ok) return { availability: 'available', status: response.status }
      const detail = (await response.text().catch(() => '')).replace(/\s+/g, ' ').trim()
      return {
        availability: 'unavailable',
        status: response.status,
        ...(detail ? { detail: detail.slice(0, 120) } : {})
      }
    } catch {
      // Endpoint muet, DNS, TLS : rien à distinguer pour l'appelant.
      return { availability: 'unavailable' }
    }
  }

  const create = async ({
    system = '',
    schema
  }: ModelSessionOptions = {}): Promise<AgentModelSession> => {
    let closed = false
    const instruction = system.trim()

    const promptStreaming = async function* (text: string): AsyncGenerator<string> {
      if (closed) throw new Error('Session fermée.')
      const messages: ChatMessage[] = []
      if (instruction) messages.push({ role: 'system', content: instruction })
      messages.push({ role: 'user', content: text })
      const chat = constrained(
        buildChatRequest(definition, config, key, messages),
        schema,
        definition
      )

      const controller = new AbortController()
      const relay = (): void => controller.abort()
      signal?.addEventListener('abort', relay)
      const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
      try {
        const response = await fetch(chat.url, {
          method: 'POST',
          headers: chat.headers,
          body: chat.body,
          signal: controller.signal
        })
        if (!response.ok || !response.body) {
          const detail = await response.text().catch(() => '')
          throw new Error(
            `Modèle indisponible (${response.status}). ${detail.slice(0, 160) || 'Vérifiez l’URL et la clé.'}`
          )
        }
        reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue
            const data = trimmed.slice(5).trim()
            if (!data || data === '[DONE]') continue
            const delta = parseStreamPayload(definition.protocol, data)
            if (delta) yield delta
          }
        }
      } catch (error) {
        // Une annulation venue de l'exécution n'est pas une panne : on la
        // laisse remonter telle quelle, la boucle d'agent sait l'ignorer.
        if (signal?.aborted) throw error
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error(timeoutMessage(timeoutMs), { cause: error })
        }
        throw error
      } finally {
        if (timer) clearTimeout(timer)
        signal?.removeEventListener('abort', relay)
        // Sortie anticipée (agent arrêté) : libère la réponse HTTP. Annuler un
        // flux déjà terminé ne fait rien.
        if (reader) await reader.cancel().catch(() => {})
      }
    }

    const prompt = async (text: string): Promise<string> => {
      const chunks: string[] = []
      for await (const chunk of promptStreaming(text)) chunks.push(chunk)
      const answer = chunks.join('').trim()
      if (!answer) throw new Error('Le modèle n’a renvoyé aucun texte.')
      return answer
    }

    return {
      prompt,
      promptStreaming,
      destroy: () => {
        closed = true
      }
    }
  }

  return {
    id: definition.id,
    label: `${definition.label} · ${config.model.trim() || definition.model}`,
    probe,
    availability: async () => (await probe()).availability,
    create
  }
}
