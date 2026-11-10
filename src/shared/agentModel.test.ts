import { afterEach, describe, expect, it, vi } from 'vitest'
import { chatModel } from './agentModel'
import { providerById } from './providers'

const local = providerById('local')
const config = { baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' }

const sse = (payloads: unknown[]): Response =>
  new Response(payloads.map((payload) => `data: ${JSON.stringify(payload)}\n\n`).join(''), {
    status: 200
  })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('façade AgentModel', () => {
  it('envoie la consigne système puis le tour, et découpe le flux', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sse([
          { choices: [{ delta: { content: 'Bon' } }] },
          { choices: [{ delta: { content: 'jour' } }] }
        ])
      )
    vi.stubGlobal('fetch', fetchMock)
    const session = await chatModel({ definition: local, config, key: null }).create({
      system: 'Tu es Vela.'
    })
    const chunks: string[] = []
    for await (const chunk of session.promptStreaming('Salut')) chunks.push(chunk)

    expect(chunks).toEqual(['Bon', 'jour'])
    const request = fetchMock.mock.calls[0][1] as RequestInit
    expect(request.headers).not.toHaveProperty('Authorization')
    const body = JSON.parse(String(request.body))
    expect(body.stream).toBe(true)
    expect(body.messages).toEqual([
      { role: 'system', content: 'Tu es Vela.' },
      { role: 'user', content: 'Salut' }
    ])
  })

  it('recolle le texte complet et refuse une réponse vide', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(sse([{ choices: [{ delta: { content: 'Oui.' } }] }]))
        .mockResolvedValueOnce(sse([]))
    )
    const model = chatModel({ definition: local, config, key: null })
    await expect((await model.create()).prompt('Question')).resolves.toBe('Oui.')
    await expect((await model.create()).prompt('Question')).rejects.toThrow('aucun texte')
  })

  it('transmet un schéma strict au fournisseur qui sait le porter', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(sse([{ choices: [{ delta: { content: '{"tool":"click"}' } }] }]))
    vi.stubGlobal('fetch', fetchMock)
    const schema = { type: 'object', properties: { tool: { type: 'string', enum: ['click'] } } }
    const session = await chatModel({ definition: local, config, key: null }).create({ schema })
    await session.prompt('Quel outil ?')
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'reponse', strict: true, schema }
    })
  })

  it('n’impose pas de schéma à un protocole qui n’en a pas', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(`data: ${JSON.stringify({ delta: { text: 'ok' } })}\n\n`, { status: 200 })
      )
    vi.stubGlobal('fetch', fetchMock)
    const session = await chatModel({
      definition: providerById('anthropic'),
      config: { baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-5' },
      key: 'sk-ant-test'
    }).create({ schema: { type: 'object' } })
    await session.prompt('Salut')
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(body.response_format).toBeUndefined()
  })

  it('nomme le fournisseur quand il refuse la requête', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('clé refusée', { status: 401 })))
    const session = await chatModel({ definition: local, config, key: null }).create()
    await expect(session.prompt('Salut')).rejects.toThrow('Modèle indisponible (401). clé refusée')
  })

  it('transforme un silence du modèle en message clair', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError'))
            )
          })
      )
    )
    const session = await chatModel({
      definition: local,
      config,
      key: null,
      timeoutMs: 2000
    }).create()
    await expect(session.prompt('Salut')).rejects.toThrow('dans les 2 secondes')
  })

  it('sonde la disponibilité sans lever', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('{}', { status: 200 }))
        .mockResolvedValueOnce(new Response('  refusé  ', { status: 403 }))
    )
    const model = chatModel({ definition: local, config, key: null })
    await expect(model.availability()).resolves.toBe('available')
    await expect(model.probe()).resolves.toEqual({
      availability: 'unavailable',
      status: 403,
      detail: 'refusé'
    })
  })

  it('déclare indisponible un serveur injoignable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    const model = chatModel({ definition: local, config, key: null })
    await expect(model.probe()).resolves.toEqual({ availability: 'unavailable' })
  })
})
