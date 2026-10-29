import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentRunner, demoNote } from './agent'
import { DEFAULT_SETTINGS, defaultProviders } from '@shared/defaults'
import { PageDriver } from './pageDriver'

const { showMessageBox } = vi.hoisted(() => ({ showMessageBox: vi.fn() }))
vi.mock('electron', () => ({ dialog: { showMessageBox } }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('note générée sans modèle', () => {
  it('étiquette le repli et retire le Markdown des phrases reprises', () => {
    const text = demoNote({
      title: 'Projet TFE',
      url: 'https://example.org/tfe',
      text: '## Plan\n\n- [ ] Introduction avec une phrase assez longue pour être retenue.\n- [x] Corpus déjà rassemblé et documenté en détail.'
    })
    expect(text).toContain('Mode démo')
    expect(text).toContain('## Projet TFE')
    expect(text).toContain('https://example.org/tfe')
    expect(text).toContain('## Points clés')
    expect(text).toContain('## Plan d’action')
    expect(text).not.toContain('[ ]')
    expect(text).not.toContain('- [x]')
  })

  it('reste honnête quand la page est trop courte', () => {
    const text = demoNote({ title: 'Vide', text: 'Trop court.' })
    expect(text).toContain('pas assez de texte')
  })
})

describe('validation des actions de l’agent', () => {
  it('met la cible au point avant de saisir du texte', async () => {
    const events: string[] = []
    const contents = {
      isDestroyed: () => false,
      executeJavaScript: vi.fn().mockResolvedValue({ found: true, x: 50, y: 60, name: 'Recherche' }),
      focus: () => events.push('focus'),
      sendInputEvent: (event: { type: string }) => events.push(event.type),
      insertText: () => events.push('saisie'),
      getTitle: () => 'Page',
      getURL: () => 'https://example.org/'
    }
    const driver = new PageDriver({
      open: async () => 'onglet',
      go: async () => {},
      contents: () => contents as never
    }, 'espace')
    Object.assign(driver, { tabId: 'onglet' })
    await driver.run({ tool: 'type', args: { name: 'Recherche', text: 'Bonjour' } })
    expect(events).toEqual(['focus', 'mouseDown', 'mouseUp', 'saisie'])
  })

  it('ne lance pas une navigation refusée', async () => {
    showMessageBox.mockResolvedValue({ response: 0 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      'data: {"choices":[{"delta":{"content":"{\\\"tool\\\":\\\"open\\\",\\\"args\\\":{\\\"url\\\":\\\"https://example.org/\\\"}}"}}]}\n\n',
      { status: 200 }
    )))
    const open = vi.fn()
    const send = vi.fn()
    const win = { isDestroyed: () => false, webContents: { isDestroyed: () => false, send } }
    const settings = { ...DEFAULT_SETTINGS, agent: { mode: 'api' as const, provider: 'local' as const, providers: defaultProviders() } }
    const runner = new AgentRunner(
      () => win as never,
      () => settings,
      () => null,
      async () => ({ text: '', anchor: '' }),
      () => {},
      { open, go: vi.fn(), contents: () => null }
    )
    runner.start({ prompt: 'Ouvre une page', sources: [], spaceId: 'espace', mode: 'act' })
    await vi.waitFor(() => expect(showMessageBox).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('agent:event', expect.objectContaining({ type: 'cancelled' })))
    expect(open).not.toHaveBeenCalled()
    expect(showMessageBox.mock.calls[0][1].detail).toContain('https://example.org/')
  })

  it('exécute uniquement une action acceptée puis interrompt une action refusée', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 1 }).mockResolvedValueOnce({ response: 0 })
    const reply = (action: object): Response => new Response(
      `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(action) } }] })}\n\n`,
      { status: 200 }
    )
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(reply({ tool: 'open', args: { url: 'https://example.org/' } }))
      .mockResolvedValueOnce(reply({ tool: 'click', args: { name: 'Envoyer' } })))
    const send = vi.fn()
    const sendInputEvent = vi.fn()
    const contents = {
      isDestroyed: () => false, isLoading: () => false,
      getURL: () => 'https://example.org/', getTitle: () => 'Exemple', sendInputEvent
    }
    const open = vi.fn().mockResolvedValue('onglet')
    const win = { isDestroyed: () => false, webContents: { isDestroyed: () => false, send } }
    const settings = { ...DEFAULT_SETTINGS, agent: { mode: 'api' as const, provider: 'local' as const, providers: defaultProviders() } }
    const runner = new AgentRunner(
      () => win as never, () => settings, () => null,
      async () => ({ text: '', anchor: '' }), () => {},
      { open, go: vi.fn(), contents: () => contents as never }
    )
    runner.start({ prompt: 'Explore', sources: [], spaceId: 'espace', mode: 'act' })
    await vi.waitFor(() => expect(showMessageBox).toHaveBeenCalledTimes(2), { timeout: 3000 })
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('agent:event', expect.objectContaining({ type: 'cancelled' })))
    expect(open).toHaveBeenCalledOnce()
    expect(sendInputEvent).not.toHaveBeenCalled()
  })
})
