import { app, ipcMain, net, type IpcMainInvokeEvent, type Session } from 'electron'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildChatRequest, endpointHost, isLoopbackEndpoint, providerById } from '@shared/providers'
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
 * Le jeton vit dans la fermeture du script injecté et sur rien d'autre : posé
 * sur `window`, un script tiers pouvait appeler la vision et écrire dans les
 * corrections pendant les trente minutes de validité. Il n'est donc jamais
 * exposé globalement, et chaque canal repasse par la politique IPC.
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
  contexte?: unknown
  dataUrl?: unknown
  key?: unknown
  value?: unknown
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'échec inconnu'
}

export class ComicBridge {
  private grants = new Map<string, Grant>()
  /** Hôtes distants déjà approuvés par l'utilisateur pendant ce lancement. */
  private remoteConsent = new Map<string, boolean>()

  constructor(
    private tabs: TabManager,
    private getSettings: () => Settings,
    private getSecret: (provider: ProviderId) => string | null,
    /** Même barrière que les canaux du châssis : émetteur connu, cadre principal. */
    private allow: (event: IpcMainInvokeEvent, channel: string) => boolean,
    /** Accord explicite avant que le contenu d'une planche quitte l'appareil. */
    private confirmRemote: (host: string) => Promise<boolean>
  ) {}

  registerIpc(): void {
    const handle = (channel: string, run: (event: IpcMainInvokeEvent, payload: unknown) => unknown): void => {
      ipcMain.handle(channel, (event, payload) => {
        if (!this.allow(event, channel)) throw new Error(`Canal IPC refusé : ${channel}`)
        return run(event, payload)
      })
    }

    handle('comic:run', (_event, payload) =>
      this.run(String((payload as { tabId?: unknown })?.tabId ?? ''))
    )
    handle('comic:clear', (_event, payload) => this.clear(String((payload as { tabId?: unknown })?.tabId ?? '')))
    handle('comic:image', (event, payload) =>
      this.withGrant(event, payload, (grant) => this.image(grant, String((payload as ComicRequest).url ?? '')))
    )
    handle('comic:translate', (event, payload) =>
      this.withGrant(event, payload, () =>
        this.translate((payload as ComicRequest).texts, (payload as ComicRequest).contexte)
      )
    )
    handle('comic:vision', (event, payload) =>
      this.withGrant(event, payload, () => this.vision(String((payload as ComicRequest).dataUrl ?? '')))
    )
    handle('comic:edits', (event, payload) =>
      this.withGrant(event, payload, async () =>
        this.saveEdits(String((payload as ComicRequest).key ?? ''), (payload as ComicRequest).value)
      )
    )
    handle('comic:load-edits', (event, payload) =>
      this.withGrant(event, payload, async () => this.loadEdits(String((payload as ComicRequest).key ?? '')))
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
        // Le jeton reste dans cette fermeture et ne passe jamais par window :
        // un script de page ne peut ni le lire ni appeler ces fonctions. Le script
        // de traduction, inliné plus bas dans la même portée, les voit directement.
        const velaComicVision = (dataUrl) => bridge.vision(token, dataUrl)
        const velaComicEdits = (key, value) => bridge.saveEdits(token, key, value)
        const velaComicLoadEdits = (key) => bridge.loadEdits(token, key)
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
              try {
                done(settings.onload, { status: 200, response: toBlob(result.base64, result.type), responseText: '' })
              } catch (error) {
                // Enveloppe illisible (base64 tronqué, type vide…) : on dit quoi,
                // plutôt que de laisser un « image inaccessible » sans cause.
                failMessage(\`image illisible — \${error && error.message ? error.message : 'octets refusés'}\`)
              }
            }).catch((error) => {
              // La raison réelle de l'IPC (jeton expiré, canal refusé, page
              // détruite…) disparaissait ici : on la transmet telle quelle.
              const detail = error && error.message ? error.message : 'échec interne'
              failMessage(\`image inaccessible — \${detail}\`)
            })
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

  /** Une ligne par planche dans le journal du processus principal. */
  private diag(line: string): void {
    process.stdout.write(`[BD][main] ${line}\n`)
  }

  private async image(grant: Grant, url: string): Promise<{ ok: boolean; base64?: string; type?: string; error?: string }> {
    if (/^data:/i.test(url)) {
      const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/i.exec(url)
      if (!match) return { ok: false, error: 'image illisible' }
      this.diag(`url=data: type=${match[1] || 'image/png'} octets=${match[2].length}`)
      return { ok: true, base64: match[2], type: match[1] || 'image/png' }
    }
    if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'source refusée — URL ni http ni data' }

    // Essais de Referer, dans l'ordre : sans Referer, puis avec le « Referer
    // racine » du site de la page. Mesuré sur Electron : dès que le Referer
    // porte un chemin (page de lecture, /viewer?…), le réseau renvoie
    // net::ERR_BLOCKED_BY_CLIENT et chaque planche échoue — c'était la cause
    // des « image inaccessible » sur Webtoons. Le chemin complet de la page ne
    // part donc jamais ; la racine du site suffit aux protections anti-lien
    // direct, et l'agent fourni par Electron lève le doute sur le reste.
    const essais: { label: string; referer?: string }[] = [{ label: 'sans Referer' }]
    try {
      const racine = `${new URL(grant.pageUrl).origin}/`
      essais.push({ label: racine, referer: racine })
    } catch {
      /* page sans URL lisible : l'essai sans Referer seul */
    }

    const tentatives: string[] = []
    for (const essai of essais) {
      try {
        const response = await grant.session.fetch(url, {
          headers: essai.referer ? { Referer: essai.referer } : {}
        })
        const type = response.headers.get('content-type') ?? ''
        const length = response.headers.get('content-length') ?? ''
        this.diag(`url=${url} referer=${essai.label} statut=${response.status} content-type=${type || '(vide)'} content-length=${length || '?'}`)
        if (!response.ok) {
          tentatives.push(`${essai.label} → HTTP ${response.status}`)
          continue
        }
        if (!/^image\//i.test(type) && !/octet-stream/i.test(type)) {
          this.diag(`avertissement : content-type inattendu ${type || '(vide)'} pour ${url}`)
        }
        const declared = Number(length || 0)
        if (declared > MAX_IMAGE_BYTES) return { ok: false, error: 'image trop lourde' }
        // Lecture bornée : arrayBuffer() chargeait la planche entière avant que le
        // plafond ne s'applique, comme le tunnel avant sa correction.
        const reader = response.body?.getReader()
        let buffer: Buffer
        if (!reader) {
          buffer = Buffer.from(await response.arrayBuffer())
        } else {
          const chunks: Uint8Array[] = []
          let total = 0
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            total += value.byteLength
            if (total > MAX_IMAGE_BYTES) {
              await reader.cancel().catch(() => undefined)
              return { ok: false, error: 'image trop lourde' }
            }
            chunks.push(value)
          }
          buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
        }
        if (buffer.byteLength > MAX_IMAGE_BYTES) return { ok: false, error: 'image trop lourde' }
        this.diag(`ok ${buffer.byteLength} octets base64=${Math.round((buffer.byteLength * 4) / 3)} pour ${url}`)
        return {
          ok: true,
          base64: buffer.toString('base64'),
          type: type || 'image/png'
        }
      } catch (error) {
        // `tentatives` garde la chronologie, pour dire sur chaque essai ce qui
        // a réellement tourné (fermeture réseau, jeton, CDN…).
        tentatives.push(`${essai.label} → ${message(error)}`)
        this.diag(`échec réseau : ${message(error)}`)
      }
    }
    return {
      ok: false,
      error:
        tentatives.some((line) => /HTTP \d+/.test(line))
          ? `image HTTP ${tentatives.join(' · ')}`
          : `image inaccessible — ${tentatives.join(' · ')}`
    }
  }

  /**
   * Le fournisseur actif peut viser une machine hors de l'appareil : répliques
   * et images de bulles partent alors tels quels. Choisir OpenAI dans les réglages
   * n'a jamais porté sur le contenu d'une planche — un seul accord par hôte et par
   * lancement, demandé avant la première requête sortante. Retourne null quand on
   * peut partir, sinon la raison de l'arrêt.
   */
  private async consentFor(baseUrl: string): Promise<string | null> {
    if (!/^https?:\/\//i.test(baseUrl) || isLoopbackEndpoint(baseUrl)) return null
    const host = endpointHost(baseUrl) ?? baseUrl
    if (this.remoteConsent.get(host)) return null
    const agreed = await this.confirmRemote(host).catch(() => false)
    this.remoteConsent.set(host, agreed)
    return agreed ? null : `traduction non envoyée — ${host} n’est pas approuvé`
  }

  /**
   * Lit un éclat que Tesseract n'a pas su déchiffrer. Restreint aux fournisseurs
   * compatibles OpenAI : c'est le seul protocole dont on sait envoyer une image
   * sans changer de forme de requête.
   */
  private async vision(dataUrl: string): Promise<{ ok: boolean; texte?: string; error?: string }> {
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(dataUrl)) return { ok: false, error: 'image illisible' }
    const settings = this.getSettings()
    const definition = providerById(settings.agent.provider)
    const key = definition.local ? null : this.getSecret(definition.id)
    if (!definition.local && !key) {
      return { ok: false, error: `ajoutez une clé ${definition.label} dans Réglages › Modèles` }
    }
    if (definition.protocol !== 'openai') {
      return { ok: false, error: 'lecture d’image : fournisseur compatible OpenAI requis' }
    }
    const provider = settings.agent.providers[definition.id]
    const refused = await this.consentFor(provider.baseUrl)
    if (refused) return { ok: false, error: refused }
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Lis le texte de cette case de bande dessinée. Réponds uniquement par {"texte":"…"}.' },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ] as unknown as Parameters<typeof buildChatRequest>[3]
    try {
      const request = buildChatRequest(definition, { baseUrl: provider.baseUrl, model: provider.model }, key, messages)
      const payload = JSON.parse(request.body) as Record<string, unknown>
      payload.stream = false
      const response = await net.fetch(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(payload)
      })
      if (!response.ok) return { ok: false, error: `vision HTTP ${response.status}` }
      const body = (await response.json()) as Record<string, unknown>
      const content = this.contentOf('openai', body)
      const match = content.match(/\{[\s\S]*\}/)
      if (!match) return { ok: false, error: 'réponse de vision illisible' }
      const texte = String((JSON.parse(match[0]) as { texte?: unknown }).texte ?? '').trim()
      return texte ? { ok: true, texte } : { ok: false, error: 'aucun texte lu' }
    } catch (error) {
      return { ok: false, error: message(error) }
    }
  }

  /** Relit le fichier de corrections d'une planche, s'il existe. */
  private loadEdits(key: string): { ok: boolean; value?: unknown; error?: string } {
    if (!/^[a-z0-9]{1,32}$/.test(key)) return { ok: false, error: 'clé invalide' }
    try {
      const file = join(app.getPath('userData'), 'comic-edits', `${key}.json`)
      if (!existsSync(file)) return { ok: false, error: 'aucune correction' }
      return { ok: true, value: JSON.parse(readFileSync(file, 'utf8')) }
    } catch (error) {
      return { ok: false, error: message(error) }
    }
  }

  /** Une correction manuelle par planche, dans son propre fichier JSON. */
  private saveEdits(key: string, value: unknown): { ok: boolean; file?: string; error?: string } {
    if (!/^[a-z0-9]{1,32}$/.test(key)) return { ok: false, error: 'clé invalide' }
    try {
      const body = JSON.stringify(value, null, 2)
      if (body.length > 200_000) return { ok: false, error: 'corrections trop volumineuses' }
      const dir = join(app.getPath('userData'), 'comic-edits')
      mkdirSync(dir, { recursive: true })
      const file = join(dir, `${key}.json`)
      writeFileSync(file, body)
      return { ok: true, file }
    } catch (error) {
      return { ok: false, error: message(error) }
    }
  }

  /** Traduit les répliques avec le fournisseur actif de Vela, sans streaming. */
  async translate(
    texts: unknown,
    contexte?: unknown
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
    const refused = await this.consentFor(provider.baseUrl)
    if (refused) return { ok: false, error: refused }
    const messages = [
      {
        role: 'system' as const,
        content:
          'Tu es traducteur de bande dessinée. On te donne un JSON {"contexte":"…","repliques":[…]} : ' +
          '« contexte » décrit l’œuvre (genre, personnages, registre) et vaut pour toute la planche. ' +
          'Traduis chaque réplique en français, en cohérence avec les répliques voisines du même envoi ' +
          '(mêmes personnes, mêmes tutoiements, mêmes noms), registre parlé et naturel, phrases courtes ' +
          'qui tiennent dans une bulle, noms propres inchangés, onomatopées rendues par un équivalent ' +
          'français, erreurs d’OCR évidentes corrigées sans rien inventer. ' +
          'Réponds uniquement par un JSON {"traductions":[{"id":0,"texte":"…"}]}.'
      },
      {
        role: 'user' as const,
        content: JSON.stringify({
          contexte: typeof contexte === 'string' ? contexte.slice(0, 400) : '',
          repliques: clean.map((texte, id) => ({ id, texte }))
        })
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
      const body = (await response.json()) as Record<string, unknown>
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

  private contentOf(protocol: 'openai' | 'anthropic' | 'google', body: Record<string, unknown>): string {
    if (protocol === 'anthropic') {
      const parts = Array.isArray(body.content) ? (body.content as { text?: string }[]) : []
      return parts.map((part) => part.text ?? '').join('')
    }
    if (protocol === 'google') {
      const candidates = body.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined
      const parts = candidates?.[0]?.content?.parts
      return Array.isArray(parts) ? parts.map((part) => part.text ?? '').join('') : ''
    }
    const choices = body.choices as { message?: { content?: string } }[] | undefined
    return choices?.[0]?.message?.content ?? ''
  }
}
