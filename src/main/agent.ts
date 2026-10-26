import type { BrowserWindow } from 'electron'
import { planDemoRun } from '@shared/agent'
import { newId } from '@shared/defaults'
import { buildChatRequest, parseStreamPayload, providerById, providerState } from '@shared/providers'
import type { AgentEvent, AgentMode, AgentRunRequest, ProviderId, Settings } from '@shared/types'

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

interface ActiveRun {
  id: string
  cancelled: boolean
  controller: AbortController
  request: AgentRunRequest
  title: string
  markdown: string
  mode: AgentMode
}

/** Ce qu'il faut retenir d'un travail terminé pour l'archiver dans l'atelier. */
export interface FinishedWork {
  title: string
  markdown: string
  prompt: string
  mode: AgentMode
  sources: { title: string; url: string }[]
  spaceId: string
  status: 'done' | 'error' | 'cancelled'
}

/**
 * Deux modes :
 * - démo : rapport déterministe construit localement, flux simulé ;
 * - api : streaming SSE vers un endpoint compatible OpenAI, texte des onglets joint.
 */
export class AgentRunner {
  private current: ActiveRun | null = null

  constructor(
    private getWindow: () => BrowserWindow | null,
    private getSettings: () => Settings,
    private getSecret: (provider: ProviderId) => string | null,
    private excerpt: (tabId: string) => Promise<string>,
    private onFinish: (work: FinishedWork) => void
  ) {}

  start(request: AgentRunRequest): { runId: string } {
    this.cancel()
    const run: ActiveRun = {
      id: newId(),
      cancelled: false,
      controller: new AbortController(),
      request,
      title: '',
      markdown: '',
      mode: this.getSettings().agent.mode
    }
    this.current = run
    const settings = this.getSettings()
    const definition = providerById(settings.agent.provider)
    const useApi =
      settings.agent.mode === 'api' && (definition.local || Boolean(this.getSecret(definition.id)))
    if (useApi) {
      void this.runApi(run, request, settings).catch((error: unknown) => {
        if (run.cancelled) return
        this.emit({ runId: run.id, type: 'error', message: this.describe(error) })
        this.archive(run, 'error')
        this.finish(run)
      })
    } else {
      void this.runDemo(run, request)
    }
    return { runId: run.id }
  }

  cancel(runId?: string): void {
    if (!this.current) return
    if (runId && this.current.id !== runId) return
    this.current.cancelled = true
    this.current.controller.abort()
    this.emit({ runId: this.current.id, type: 'cancelled' })
    this.archive(this.current, 'cancelled')
    this.current = null
  }

  /** Un travail n'est archivé que s'il a produit du texte. */
  private archive(run: ActiveRun, status: FinishedWork['status']): void {
    if (!run.markdown.trim()) return
    try {
      this.onFinish({
        title: run.title || run.request.prompt.slice(0, 60) || 'Rapport Vela',
        markdown: run.markdown,
        prompt: run.request.prompt,
        mode: run.mode,
        sources: run.request.sources.map((source) => ({ title: source.title, url: source.url })),
        spaceId: run.request.spaceId,
        status
      })
    } catch {
      /* l'archivage ne doit jamais faire échouer une exécution */
    }
  }

  private alive(run: ActiveRun): boolean {
    if (this.current !== run || run.cancelled) return false
    const win = this.getWindow()
    return Boolean(win && !win.isDestroyed() && !win.webContents.isDestroyed())
  }

  private finish(run: ActiveRun): void {
    if (this.current === run) this.current = null
  }

  private emit(event: AgentEvent): void {
    const win = this.getWindow()
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return
    win.webContents.send('agent:event', event)
  }

  private describe(error: unknown): string {
    if (error instanceof Error) {
      if (error.name === 'AbortError') return 'Requête interrompue.'
      return error.message
    }
    return 'Le modèle n’a pas répondu.'
  }

  private async runDemo(run: ActiveRun, request: AgentRunRequest): Promise<void> {
    const plan = planDemoRun(request.prompt, request.sources)
    run.title = plan.title
    run.mode = 'demo'
    this.emit({ runId: run.id, type: 'plan', title: plan.title, steps: plan.steps, mode: 'demo' })

    for (let index = 0; index < plan.steps.length; index += 1) {
      await wait(240)
      if (!this.alive(run)) return
      this.emit({ runId: run.id, type: 'step', index, state: 'active' })
      await wait(340)
      if (!this.alive(run)) return
      this.emit({ runId: run.id, type: 'step', index, state: 'done' })
    }

    const tokens = plan.markdown.match(/\S+\s*/g) ?? []
    let buffer = ''
    for (const token of tokens) {
      if (!this.alive(run)) return
      buffer += token
      if (buffer.length >= 26) {
        run.markdown += buffer
        this.emit({ runId: run.id, type: 'delta', text: buffer })
        buffer = ''
        await wait(14)
      }
    }
    if (buffer) {
      run.markdown += buffer
      this.emit({ runId: run.id, type: 'delta', text: buffer })
    }
    if (!this.alive(run)) return
    this.emit({ runId: run.id, type: 'done' })
    this.archive(run, 'done')
    this.finish(run)
  }

  private async runApi(run: ActiveRun, request: AgentRunRequest, settings: Settings): Promise<void> {
    const definition = providerById(settings.agent.provider)
    const state = providerState(settings)
    const key = this.getSecret(definition.id)
    if (!key && !definition.local) throw new Error('Aucune clé API enregistrée pour ce fournisseur.')

    const sources = await Promise.all(
      request.sources.map(async (source) => ({
        ...source,
        excerpt: source.tabId ? (await this.excerpt(source.tabId)).slice(0, 5000) : ''
      }))
    )

    run.title = request.prompt.slice(0, 60) || 'Rapport Vela'
    run.mode = 'api'
    this.emit({
      runId: run.id,
      type: 'plan',
      title: run.title,
      steps: ['Connexion au modèle', `Lecture de ${sources.length || 0} source(s)`, 'Rédaction de la synthèse'],
      mode: 'api'
    })

    const context = sources
      .map((source, index) => `### Source ${index + 1} — ${source.title}\n${source.url}\n${source.excerpt}`)
      .join('\n\n')

    const messages = [
      {
        role: 'system',
        content:
          'Tu es Vela, un assistant de recherche intégré à un navigateur. Réponds en français, en Markdown, avec des titres courts, des listes et un tableau si tu compares. Appuie-toi uniquement sur les sources fournies et signale ce qui manque.'
      },
      {
        role: 'user',
        content: `Demande : ${request.prompt || 'Synthétise les pages ouvertes.'}\n\nSources :\n${context || 'Aucune source fournie.'}`
      }
    ]

    const chat = buildChatRequest(
      definition,
      { baseUrl: state.baseUrl, model: state.model },
      key,
      messages as { role: 'system' | 'user'; content: string }[]
    )
    const response = await fetch(chat.url, {
      method: 'POST',
      headers: chat.headers,
      body: chat.body,
      signal: run.controller.signal
    })

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '')
      throw new Error(
        `Modèle indisponible (${response.status}). ${detail.slice(0, 160) || 'Vérifiez l’URL et la clé.'}`
      )
    }

    this.emit({ runId: run.id, type: 'step', index: 0, state: 'done' })
    this.emit({ runId: run.id, type: 'step', index: 1, state: 'active' })
    await wait(300)
    if (!this.alive(run)) return
    this.emit({ runId: run.id, type: 'step', index: 1, state: 'done' })
    this.emit({ runId: run.id, type: 'step', index: 2, state: 'active' })

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let sawDelta = false

    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      if (!this.alive(run)) {
        await reader.cancel().catch(() => {})
        return
      }
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (!data || data === '[DONE]') continue
        const delta = parseStreamPayload(definition.protocol, data)
        if (delta) {
          sawDelta = true
          run.markdown += delta
          this.emit({ runId: run.id, type: 'delta', text: delta })
        }
      }
    }

    if (!this.alive(run)) return
    if (!sawDelta) throw new Error('Le modèle n’a renvoyé aucun texte.')
    this.emit({ runId: run.id, type: 'step', index: 2, state: 'done' })
    this.emit({ runId: run.id, type: 'done' })
    this.archive(run, 'done')
    this.finish(run)
  }
}
