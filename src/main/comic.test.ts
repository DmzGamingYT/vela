import { afterEach, describe, expect, it, vi } from 'vitest'
import { ComicBridge } from './comic'
import { DEFAULT_SETTINGS } from '@shared/defaults'
import type { Settings } from '@shared/types'

const { fetchMock, confirmRemote } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  confirmRemote: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/vela-comic-test', getAppPath: () => '/tmp/vela-comic-test' },
  ipcMain: { handle: vi.fn() },
  net: { fetch: fetchMock }
}))

/** Réponse d'un modèle compatible OpenAI, au format attendu par la traduction. */
function translated(): Response {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"traductions":[{"id":0,"texte":"Bonjour."}]}' } }] })
  } as unknown as Response
}

/**
 * Pont avec le fournisseur « Local » (aucune clé requise) dont l'endpoint peut
 * bouger entre deux appels, comme après un réglage modifié dans l'interface.
 */
function bridge(baseUrl = 'http://localhost:11434/v1') {
  const state = { baseUrl }
  const settings = (): Settings => {
    const clone = structuredClone(DEFAULT_SETTINGS)
    clone.agent.provider = 'local'
    clone.agent.providers.local = { ...clone.agent.providers.local, baseUrl: state.baseUrl }
    return clone
  }
  const comic = new ComicBridge({ ensure: () => null } as never, settings, () => null, () => true, confirmRemote)
  return { comic, move: (next: string) => (state.baseUrl = next) }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('accord avant que la planche ne quitte l’appareil', () => {
  it('ne demande rien à un serveur local', async () => {
    fetchMock.mockResolvedValue(translated())
    const { comic } = bridge('http://localhost:11434/v1')
    await expect(comic.translate(['Hello'])).resolves.toMatchObject({ ok: true })
    expect(confirmRemote).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('nomme l’hôte avant le premier envoi vers lui', async () => {
    confirmRemote.mockResolvedValue(true)
    fetchMock.mockResolvedValue(translated())
    const { comic } = bridge('https://translate.example.org/v1')
    await comic.translate(['Hello'])
    expect(confirmRemote).toHaveBeenCalledWith('translate.example.org')
    // L'accord est pris avant la requête, pas après : rien n'est parti au moment
    // où l'utilisateur lit la demande.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('ne redemande pas une fois l’hôte approuvé', async () => {
    confirmRemote.mockResolvedValue(true)
    fetchMock.mockResolvedValue(translated())
    const { comic } = bridge('https://translate.example.org/v1')
    for (const text of ['Hello', 'Bye', 'Again']) await comic.translate([text])
    expect(confirmRemote).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('rien ne part quand l’utilisateur refuse', async () => {
    confirmRemote.mockResolvedValue(false)
    const { comic } = bridge('https://api.autre-hote.dev/v1')
    const result = await comic.translate(['Hello'])
    expect(result.ok).toBe(false)
    expect(result.error).toContain('api.autre-hote.dev')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('un refus n’est pas définitif, mais se redemande à chaque fois', async () => {
    confirmRemote.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    fetchMock.mockResolvedValue(translated())
    const { comic } = bridge('https://translate.example.org/v1')
    await expect(comic.translate(['Hello'])).resolves.toMatchObject({ ok: false })
    await expect(comic.translate(['Hello'])).resolves.toMatchObject({ ok: true })
    expect(confirmRemote).toHaveBeenCalledTimes(2)
  })

  it('un changement d’hôte recommence l’accord', async () => {
    confirmRemote.mockResolvedValue(true)
    fetchMock.mockResolvedValue(translated())
    const { comic, move } = bridge('https://un.example.org/v1')
    await comic.translate(['Hello'])
    move('https://deux.example.org/v1')
    await comic.translate(['Hello'])
    expect(confirmRemote.mock.calls.map((call) => call[0])).toEqual(['un.example.org', 'deux.example.org'])
  })

  it('un accord qui ne peut pas être demandé refuse la requête', async () => {
    // Châssis détruit, dialogue impossible : le doute profite à la confidentialité.
    confirmRemote.mockRejectedValue(new Error('plus de fenêtre'))
    const { comic } = bridge('https://fuite.example.org/v1')
    await expect(comic.translate(['Hello'])).resolves.toMatchObject({ ok: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('un endpoint qui n’est pas une URL ne déclenche aucun dialogue', async () => {
    fetchMock.mockResolvedValue(translated())
    const { comic } = bridge('pas-une-url')
    await comic.translate(['Hello'])
    expect(confirmRemote).not.toHaveBeenCalled()
  })
})
