import { app, ipcMain, net, type IpcMainInvokeEvent, type Session } from 'electron'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildChatRequest, providerById } from '@shared/providers'
import type { ProviderId, Settings } from '@shared/types'
import type { ComicRunResult } from '@shared/api'
import type { TabManager } from './tabs'

/**
 * Traduction de BD, côté application.
 *
 * Le script de page (userscripts/comic-translate.user.js) fait le travail visible :
 * détection des planches, OCR local, bulles. Il ne détient aucune clé. Deux
 * fonctions lui sont prêtées par le preload des pages, avec un jeton propre à
 * l'onglet et à la session :
 *  - lire une image distante (mêmes cookies et même session que l'onglet) ;
 *  - traduire une liste de répliques avec le fournisseur configuré dans Vela.
 *
 * Le jeton vit dans la fermeture du script injecté : une page ne peut pas le
 * relire, et il expire au bout de trente minutes.
 */

const SCRIPT_FILE = join('userscripts', 'comic-translate.user.js')
const TOKEN_TTL = 30 * 60_000
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_TEXTS = 80
const MAX_TEXT_LENGTH = 2000

interface Grant {
  webContentsId: number
  session: Session
  pageUrl: string
  expiresAt: number
}

interface ComicRequest {
  token?: string
  url?: string
  texts?: unknown
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'échec inconnu'
}

export class ComicBridge {
  private grants = new Map<string, Grant>()

  constructor(
    private tabs: TabManager,
    private getSettings: () => Settings,
    private getSecret: (provider: ProviderId) => string | null
  ) {}

  registerIpc(): void {
    ipcMain.handle('comic:run', (_event, payload) =>
      this.run(String((payload as { tabId?: unknown })?.tabId ?? ''))
    )
    ipcMain.handle('comic:clear', (_event, payload) => this.clear(String((payload as { tabId?: unknown })?.tabId ?? '')))
    ipcMain.handle('comic:image', (event, payload) => this.withGrant(event, payload, (grant) => this.image(grant, String((payload as ComicRequest).url ?? ''))))
    ipcMain.handle('comic:translate', (event, payload) =>
      this.withGrant(event, payload, () => this.translate((payload as ComicRequest).texts))
    )
  }

  private async withGrant(
    event: IpcMainInvokeEvent,
    payload: unknown,
    run: (grant: Grant) => Promise<unknown>
  ): Promise<unknown> {
    const token = String((payload as ComicRequest)?.token ?? '')
    const grant = this.grants.get(token)
    if (!grant || grant.webContentsId !== event.sender.id || grant.expiresAt < Date.now()) {
      throw new Error('session de traduction expirée — relancez la commande')
    }
    grant.expiresAt = Date.now() + TOKEN_TTL
    return run(grant)
  }

  private script(): string {
    return readFileSync(join(app.getAppPath(), SCRIPT_FILE), 'utf8')
  }

  async run(tabId: string): Promise<ComicRunResult> {
    const view = this.tabs.ensure(tabId, false)
    if (!view || view.webContents.isDestroyed()) return { ok: false, reason: 'ouvrez une page de lecture' }

    const contents = view.webContents
    const token = randomBytes(24).toString('hex')
    this.grants.set(token, {
      webContentsId: contents.id,
      session: contents.session,
      pageUrl: contents.getURL(),
      expiresAt: Date.now() + TOKEN_TTL
    })

    try {
      const script = this.script()
      const result = (await contents.executeJavaScript(this.wrap(script, token))) as { ok?: boolean; reason?: string }
      if (!result?.ok) {
        this.grants.delete(token)
        return { ok: false, reason: result?.reason ?? 'script refusé par la page' }
      }
      return { ok: true }
    } catch (error) {
      this.grants.delete(token)
      return { ok: false, reason: message(error) }
    }
  }

  async clear(tabId: string): Promise<void> {
    const view = this.tabs.ensure(tabId, false)
    if (!view || view.webContents.isDestroyed()) return
    await view.webContents
      .executeJavaScript(
        `(() => {
          document.querySelectorAll('.vt-layer, .vt-panel, .vt-launch').forEach((node) => node.remove())
          document.documentElement.classList.remove('vt-hidden')
          try { delete window.velaComic } catch {}
          window.__velaComicRunning = false
          return true
        })()`
      )
      .catch(() => undefined)
  }

  /** Le script + les fonctions GM fournies par Vela, dans une même fermeture. */
  private wrap(script: string, token: string): string {
    const prelude = `
      (() => {
        const bridge = window.__velaComicBridge
        if (!bridge) return { ok: false, reason: 'pont Vela indisponible' }
        if (window.__velaComicRunning) return { ok: true, reason: 'déjà lancé' }
        window.__velaComicRunning = true
        const token = ${JSON.stringify(token)}
        const storeKey = (key) => 'vela-comic:' + key
        const GM_getValue = (key, fallback) => {
          try {
            const raw = localStorage.getItem(storeKey(key))
            return raw === null ? fallback : JSON.parse(raw)
          } catch { return fallback }
        }
        const GM_setValue = (key, value) => {
          try { localStorage.setItem(storeKey(key), JSON.stringify(value)) } catch {}
        }
        const toBlob = (base64, type) => {
          const binary = atob(base64)
          const bytes = new Uint8Array(binary.length)
          for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
          return new Blob([bytes], { type: type || 'image/png' })
        }
        const GM_xmlhttpRequest = (options) => {
          const settings = options || {}
          const done = (fn, value) => { try { if (typeof fn === 'function') fn(value) } catch {} }
          const fail = (error) => done(settings.onerror, { error })
          const failMessage = (text) => done(settings.onerror, new Error(text))
          const method = String(settings.method || 'GET').toUpperCase()
          if (method === 'GET') {
            bridge.image(token, String(settings.url || '')).then((result) => {
              if (!result || !result.ok) return failMessage(result && result.error ? result.error : 'image refusée')
              done(settings.onload, { status: 200, response: toBlob(result.base64, result.type), responseText: '' })
            }).catch(() => failMessage('image inaccessible'))
            return
          }
          let texts = []
          try {
            const body = JSON.parse(settings.data || '{}')
            const user = (body.messages || []).find((entry) => entry.role === 'user')
            const parsed = JSON.parse(user ? user.content : '{}')
            texts = (parsed.repliques || []).map((item) => item.texte)
          } catch {}
          bridge.translate(token, texts).then((result) => {
            if (!result || !result.ok) return failMessage(result && result.error ? result.error : 'traduction refusée')
            const traductions = result.translations || []
            done(settings.onload, {
              status: 200,
              responseText: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ traductions }) } }] })
            })
          }).catch(() => failMessage('traduction injoignable'))
        }
        try {
          ${script}
          return { ok: true }
        } catch (error) {
          window.__velaComicRunning = false
          return { ok: false, reason: error && error.message ? error.message : 'script en échec' }
        }
      })()
    `
    return prelude
  }

  private async image(grant: Grant, url: string): Promise<{ ok: boolean; base64?: string; type?: string; error?: string }> {
    if (/^data:/i.test(url)) {
      const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/i.exec(url)
      if (!match) return { ok: false, error: 'image illisible' }
      return { ok: true, base64: match[2], type: match[1] || 'image/png' }
    }
    if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'source refusée' }
    try {
      const response = await grant.session.fetch(url, {
        headers: grant.pageUrl ? { Referer: grant.pageUrl } : {}
      })
      if (!response.ok) return { ok: false, error: `image HTTP ${response.status}` }
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.byteLength > MAX_IMAGE_BYTES) return { ok: false, error: 'image trop lourde' }
      return {
        ok: true,
        base64: buffer.toString('base64'),
        type: response.headers.get('content-type') || 'image/png'
      }
    } catch (error) {
      return { ok: false, error: message(error) }
    }
  }

  /** Traduit les répliques avec le fournisseur actif de Vela, sans streaming. */
  async translate(
    texts: unknown
  ): Promise<{ ok: boolean; translations?: { id: number; texte: string }[]; error?: string }> {
    if (!Array.isArray(texts) || !texts.length) return { ok: false, error: 'aucun texte à traduire' }
    const clean = texts
      .slice(0, MAX_TEXTS)
      .map((text) => String(text ?? '').slice(0, MAX_TEXT_LENGTH))
      .map((text) => text.trim())
    if (!clean.some(Boolean)) return { ok: false, error: 'aucun texte à traduire' }

    const settings = this.getSettings()
    const definition = providerById(settings.agent.provider)
    const key = definition.local ? null : this.getSecret(definition.id)
    if (!definition.local && !key) {
      return { ok: false, error: `ajoutez une clé ${definition.label} dans Réglages › Modèles` }
    }
    const provider = settings.agent.providers[definition.id]
    const messages = [
      {
        role: 'system' as const,
        content:
          'Tu es traducteur de bande dessinée. On te donne un tableau JSON de répliques extraites par OCR. ' +
          'Traduis chacune en français, registre parlé et naturel, phrases courtes, noms propres inchangés, ' +
          'onomatopées rendues par un équivalent français, erreurs d’OCR évidentes corrigées sans rien inventer. ' +
          'Réponds uniquement par un JSON {"traductions":[{"id":0,"texte":"…"}]}.'
      },
      {
        role: 'user' as const,
        content: JSON.stringify({ repliques: clean.map((texte, id) => ({ id, texte })) })
      }
    ]

    try {
      const request = buildChatRequest(definition, { baseUrl: provider.baseUrl, model: provider.model }, key, messages)
      const payload = JSON.parse(request.body) as Record<string, unknown>
      let url = request.url
      if (definition.protocol === 'google') {
        delete payload.stream
        url = url.replace(':streamGenerateContent?alt=sse', ':generateContent')
      } else {
        payload.stream = false
      }
      const response = await net.fetch(url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(payload)
      })
      if (!response.ok) return { ok: false, error: `traducteur HTTP ${response.status}` }
      const body = (await response.json()) as Record<string, any>
      const content = this.contentOf(definition.protocol, body)
      const match = content.match(/\{[\s\S]*\}/)
      if (!match) return { ok: false, error: 'réponse du modèle illisible' }
      const parsed = JSON.parse(match[0]) as { traductions?: { id?: unknown; texte?: unknown }[] }
      const list = Array.isArray(parsed.traductions) ? parsed.traductions : []
      const translations = clean.map((text, index) => {
        const found = list.find((item) => Number(item.id) === index)
        return { id: index, texte: typeof found?.texte === 'string' && found.texte ? found.texte : text }
      })
      return { ok: true, translations }
    } catch (error) {
      return { ok: false, error: message(error) }
    }
  }

  private contentOf(protocol: 'openai' | 'anthropic' | 'google', body: Record<string, any>): string {
    if (protocol === 'anthropic') {
      return Array.isArray(body.content) ? body.content.map((part: { text?: string }) => part.text ?? '').join('') : ''
    }
    if (protocol === 'google') {
      const parts = body.candidates?.[0]?.content?.parts
      return Array.isArray(parts) ? parts.map((part: { text?: string }) => part.text ?? '').join('') : ''
    }
    return body.choices?.[0]?.message?.content ?? ''
  }
}
