import type { WebContents } from 'electron'
import type { AgentAction } from '@shared/agentLoop'

/**
 * Pilote d'un onglet de travail : il ne fait que ce que la boucle lui demande,
 * avec des scripts fixes. Le modèle ne fournit jamais de code, seulement une
 * cible (rôle + nom accessible, comme un lecteur d'écran) ou du texte.
 */
export interface DriverWorkspace {
  /** Ouvre l'adresse dans un onglet neuf de l'espace, puis le ramène au premier plan. */
  open(spaceId: string, url: string): Promise<string>
  /** Navigue l'onglet de travail déjà ouvert. */
  go(tabId: string, url: string): Promise<void>
  /** Contenu vivant de l'onglet, `null` s'il a été fermé ou mis en veille. */
  contents(tabId: string): WebContents | null
}

export interface DriveResult {
  ok: boolean
  /** Une ligne pour le journal. */
  detail: string
  /** Ce que le modèle reçoit au tour suivant. */
  observation: string
}

const CLICKABLE_SELECTOR =
  'a[href],button,input,textarea,select,summary,[role="button"],[role="link"],[role="textbox"],[role="checkbox"],[role="tab"],[role="menuitem"],[contenteditable="true"]'

/**
 * Script unique, exécuté dans la page. Trois modes : `find` (position d'une
 * cible), `read` (titre, texte et éléments actionnables), `extract` (liste).
 */
const PAGE_SCRIPT = `(input) => {
  const clean = (value) => (value || '').replace(/\\s+/g, ' ').trim()
  const norm = (value) => clean(value).toLowerCase()
  const visible = (el) => {
    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return false
    const style = getComputedStyle(el)
    return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0'
  }
  const roleOf = (el) => {
    const explicit = el.getAttribute('role')
    if (explicit) return explicit
    const tag = el.tagName.toLowerCase()
    if (tag === 'a') return el.hasAttribute('href') ? 'link' : 'generic'
    if (tag === 'button') return 'button'
    if (tag === 'select') return 'combobox'
    if (tag === 'textarea') return 'textbox'
    if (tag === 'summary') return 'button'
    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase()
      if (type === 'submit' || type === 'button' || type === 'reset') return 'button'
      if (type === 'checkbox') return 'checkbox'
      if (type === 'radio') return 'radio'
      return 'textbox'
    }
    return 'generic'
  }
  const nameOf = (el) => {
    const labelledBy = el.getAttribute('aria-labelledby')
    const labelled = labelledBy
      ? labelledBy
          .split(/\\s+/)
          .map((id) => document.getElementById(id)?.textContent || '')
          .join(' ')
      : ''
    const candidates = [
      el.getAttribute('aria-label'),
      labelled,
      el.getAttribute('alt'),
      el.getAttribute('title'),
      el.getAttribute('placeholder'),
      el.tagName === 'INPUT' ? el.value : '',
      el.innerText,
      el.textContent
    ]
    for (const candidate of candidates) {
      const value = clean(candidate)
      if (value) return value
    }
    return ''
  }
  const entries = () => {
    const seen = new Set()
    const list = []
    for (const el of Array.from(document.querySelectorAll(${JSON.stringify(CLICKABLE_SELECTOR)}))) {
      if (!visible(el)) continue
      const role = roleOf(el)
      const name = nameOf(el)
      if (!name && role !== 'textbox') continue
      const key = role + '|' + norm(name)
      if (seen.has(key)) continue
      seen.add(key)
      list.push({ el: el, role: role, name: name })
    }
    return list
  }
  const target = input.target || {}
  const findEntry = (pool) => {
    const wantedName = norm(target.name)
    const wantedText = norm(target.text)
    const wantedRole = norm(target.role)
    const exact = pool.filter((entry) => {
      if (wantedRole && entry.role !== wantedRole) return false
      if (wantedName) return norm(entry.name) === wantedName
      return wantedText ? norm(entry.name).includes(wantedText) : false
    })
    if (exact.length) return exact[0]
    if (!wantedName) return null
    return (
      pool.find((entry) => {
        if (wantedRole && entry.role !== wantedRole) return false
        return norm(entry.name).includes(wantedName)
      }) || null
    )
  }

  if (input.mode === 'find') {
    const pool = entries()
    const chosen = findEntry(pool)
    if (!chosen) {
      return {
        found: false,
        candidates: pool.slice(0, 12).map((entry) => ({ role: entry.role, name: entry.name.slice(0, 60) }))
      }
    }
    const rect = chosen.el.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const top = document.elementFromPoint(x, y)
    if (!top || (top !== chosen.el && !chosen.el.contains(top))) return { found: false, candidates: [] }
    return {
      found: true,
      x,
      y,
      role: chosen.role,
      name: chosen.name.slice(0, 80)
    }
  }

  if (input.mode === 'extract') {
    const limit = input.limit || 12
    if (input.what === 'headings') {
      const headings = Array.from(document.querySelectorAll('h1,h2,h3'))
        .filter(visible)
        .map((el) => clean(el.innerText))
        .filter(Boolean)
        .slice(0, limit)
      return { title: document.title, url: location.href, items: headings }
    }
    if (input.what === 'links') {
      const links = entries()
        .filter((entry) => entry.role === 'link')
        .slice(0, limit)
        .map((entry) => {
          const href = entry.el instanceof HTMLAnchorElement ? entry.el.href : ''
          return entry.name + (href ? ' — ' + href : '')
        })
      return { title: document.title, url: location.href, items: links }
    }
    const body = document.body
    const text = body ? clean(body.innerText) : ''
    return { title: document.title, url: location.href, items: [text.slice(0, 4000)] }
  }

  // read : le texte lisible, puis les éléments actionnables.
  const limit = input.limit || 5000
  const body = document.body
  let pageText = ''
  if (body) {
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
    let total = 0
    let node
    while ((node = walker.nextNode()) && total < limit) {
      const parent = node.parentElement
      if (!node.textContent || !node.textContent.trim() || !parent) continue
      if (parent.closest('script,style,noscript,svg,[hidden],[aria-hidden="true"]')) continue
      const style = getComputedStyle(parent)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      const chunk = node.textContent.slice(0, limit - total)
      pageText += chunk + ' '
      total += chunk.length
    }
  }
  return {
    title: document.title,
    url: location.href,
    text: clean(pageText),
    elements: entries()
      .slice(0, 40)
      .map((entry) => entry.role + ' : ' + entry.name.slice(0, 70))
  }
}`

interface LookupHit {
  found: boolean
  x?: number
  y?: number
  role?: string
  name?: string
  candidates?: { role: string; name: string }[]
}

interface ReadHit {
  title: string
  url: string
  text: string
  elements: string[]
}

interface ExtractHit {
  title: string
  url: string
  items: string[]
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export class PageDriver {
  private tabId: string | null = null

  constructor(
    private workspace: DriverWorkspace,
    private spaceId: string
  ) {}

  /** Onglet piloté, vide tant que l'agent n'a pas ouvert d'adresse. */
  get tab(): string | null {
    return this.tabId
  }

  async run(action: AgentAction): Promise<DriveResult> {
    switch (action.tool) {
      case 'open':
        return this.open(action.args.url ?? '')
      case 'click':
        return this.click(action)
      case 'type':
        return this.type(action)
      case 'scroll':
        return this.scroll(action)
      case 'read':
        return this.read()
      case 'extract':
        return this.extract(action)
      default:
        return { ok: false, detail: 'Action inconnue.', observation: 'Action inconnue.' }
    }
  }

  /** Titre et adresse de la page de travail, pour le rapport. */
  page(): { title: string; url: string } | null {
    const wc = this.active()
    if (!wc) return null
    return { title: wc.getTitle(), url: wc.getURL() }
  }

  private active(): WebContents | null {
    if (!this.tabId) return null
    const wc = this.workspace.contents(this.tabId)
    if (!wc || wc.isDestroyed()) return null
    return wc
  }

  private missing(): DriveResult {
    const observation = 'Aucune page n’est ouverte dans l’onglet de travail : commence par « open ».'
    return { ok: false, detail: 'Aucune page ouverte.', observation }
  }

  private async open(url: string): Promise<DriveResult> {
    if (!url) return { ok: false, detail: 'Adresse vide.', observation: 'Adresse vide.' }
    try {
      if (this.tabId && this.workspace.contents(this.tabId)) await this.workspace.go(this.tabId, url)
      else this.tabId = await this.workspace.open(this.spaceId, url)
    } catch {
      return { ok: false, detail: 'Ouverture impossible.', observation: `Impossible d’ouvrir ${url}.` }
    }
    const wc = this.active()
    if (!wc) {
      return {
        ok: false,
        detail: 'Page non chargée.',
        observation: `L’adresse ${url} n’a pas pu être chargée.`
      }
    }
    await this.waitForPage(wc)
    const title = wc.getTitle() || this.page()?.url || url
    return {
      ok: true,
      detail: title.slice(0, 80),
      observation: `Page ouverte : « ${title} » — ${wc.getURL()}`
    }
  }

  private async click(action: AgentAction): Promise<DriveResult> {
    const wc = this.active()
    if (!wc) return this.missing()
    const hit = (await this.lookup(wc, {
      role: action.args.role,
      name: action.args.name,
      text: action.args.text
    })) as LookupHit | null
    if (!hit || !hit.found) {
      const candidates = (hit?.candidates ?? []).map((entry) => `${entry.role} : ${entry.name}`).join(' · ')
      const detail = candidates ? `Introuvable. Présents : ${candidates}` : 'Élément introuvable.'
      return { ok: false, detail: detail.slice(0, 240), observation: detail }
    }
    wc.focus()
    const x = Math.round(hit.x ?? 0)
    const y = Math.round(hit.y ?? 0)
    wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
    wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
    await this.settle(wc, 600)
    const after = this.page()
    const observation = `Clic sur « ${hit.name} » (${hit.role}). Page : « ${after?.title ?? ''} » — ${
      after?.url ?? ''
    }`
    return { ok: true, detail: `« ${hit.name} » (${hit.role})`.slice(0, 160), observation }
  }

  private async type(action: AgentAction): Promise<DriveResult> {
    const wc = this.active()
    if (!wc) return this.missing()
    const text = action.args.text ?? ''
    if (!text) return { ok: false, detail: 'Texte vide.', observation: 'Aucun texte à saisir.' }
    let field = 'le champ actif'
    let target: LookupHit | null = null
    // Le texte à saisir n'est pas une cible : seul le nom (ou le rôle) du champ l'est.
    if (action.args.name || action.args.role) {
      const hit = (await this.lookup(wc, { role: action.args.role, name: action.args.name })) as LookupHit | null
      if (!hit || !hit.found) {
        const detail = hit?.candidates?.length
          ? `Champ introuvable. Présents : ${hit.candidates.map((c) => c.name).join(' · ')}`
          : 'Champ introuvable.'
        return { ok: false, detail: detail.slice(0, 240), observation: detail }
      }
      field = `« ${hit.name} »`
      target = hit
    }
    wc.focus()
    if (target) {
      const x = Math.round(target.x ?? 0)
      const y = Math.round(target.y ?? 0)
      wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
      wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
    }
    wc.insertText(text)
    await wait(120)
    const after = this.page()
    return {
      ok: true,
      detail: `${field} ← « ${text.slice(0, 60)} »`.slice(0, 200),
      observation: `Saisie dans ${field} : « ${text.slice(0, 200)} ». Page : « ${after?.title ?? ''} » — ${after?.url ?? ''}`
    }
  }

  /** La soumission est distincte de la saisie et exige une validation dédiée. */
  async submit(): Promise<DriveResult> {
    const wc = this.active()
    if (!wc) return this.missing()
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
    await this.settle(wc, 700)
    return { ok: true, detail: 'Entrée envoyée', observation: 'Saisie soumise avec Entrée.' }
  }

  private async scroll(action: AgentAction): Promise<DriveResult> {
    const wc = this.active()
    if (!wc) return this.missing()
    const amount = action.args.amount ?? 700
    const before = Number(await wc.executeJavaScript('window.scrollY')) || 0
    const size = (await wc.executeJavaScript('[window.innerWidth, window.innerHeight]')) as number[]
    const [width, height] = Array.isArray(size) ? size : [1200, 800]
    wc.sendInputEvent({
      type: 'mouseWheel',
      x: Math.round(width / 2),
      y: Math.round(height / 2),
      deltaX: 0,
      deltaY: action.args.direction === 'up' ? amount : -amount,
      canScroll: true
    })
    await wait(450)
    const after = Number(await wc.executeJavaScript('window.scrollY')) || 0
    const delta = Math.round(after - before)
    if (delta === 0) {
      const detail = 'La page ne défile pas davantage.'
      return { ok: false, detail, observation: detail }
    }
    return {
      ok: true,
      detail: `${delta > 0 ? 'Bas' : 'Haut'} · ${Math.abs(delta)} px`,
      observation: `Défilement de ${Math.abs(delta)} px vers ${delta > 0 ? 'le bas' : 'le haut'} (position ${after}).`
    }
  }

  private async read(): Promise<DriveResult> {
    const wc = this.active()
    if (!wc) return this.missing()
    const hit = (await this.evaluate(wc, { mode: 'read' })) as ReadHit | null
    if (!hit) return { ok: false, detail: 'Lecture impossible.', observation: 'Lecture impossible.' }
    const elements = hit.elements.slice(0, 24).join('\n')
    const observation = [
      `Titre : ${hit.title || '(sans titre)'}`,
      `Adresse : ${hit.url}`,
      `Texte : ${hit.text.slice(0, 2600) || '(aucun texte)'}`,
      `Éléments actionnables :\n${elements || '(aucun)'}`
    ].join('\n')
    return {
      ok: true,
      detail: `${hit.text.length} caractères · ${hit.elements.length} élément(s)`,
      observation
    }
  }

  private async extract(action: AgentAction): Promise<DriveResult> {
    const wc = this.active()
    if (!wc) return this.missing()
    const hit = (await this.evaluate(wc, {
      mode: 'extract',
      what: action.args.what ?? 'links',
      limit: action.args.limit ?? 12
    })) as ExtractHit | null
    if (!hit) return { ok: false, detail: 'Extraction impossible.', observation: 'Extraction impossible.' }
    const items = hit.items.filter((item) => item.trim())
    if (items.length === 0) {
      return { ok: false, detail: 'Rien à relever.', observation: 'Cette page ne contient rien à relever.' }
    }
    return {
      ok: true,
      detail: `${items.length} élément(s)`,
      observation: items.map((item, index) => `${index + 1}. ${item.slice(0, 220)}`).join('\n')
    }
  }

  private async lookup(
    wc: WebContents,
    target: { role?: string; name?: string; text?: string }
  ): Promise<LookupHit | null> {
    return (await this.evaluate(wc, {
      mode: 'find',
      target: {
        ...(target.role ? { role: target.role } : {}),
        ...(target.name ? { name: target.name } : {}),
        ...(target.text ? { text: target.text } : {})
      }
    })) as LookupHit | null
  }

  private async evaluate(wc: WebContents, input: Record<string, unknown>): Promise<unknown> {
    try {
      return await wc.executeJavaScript(
        `(${PAGE_SCRIPT})(${JSON.stringify(input)})`,
        true
      )
    } catch {
      return null
    }
  }

  /** Attend qu'une adresse web soit réellement chargée, ou abandonne. */
  private async waitForPage(wc: WebContents): Promise<void> {
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      if (!wc.isLoading() && /^https?:/i.test(wc.getURL())) break
      await wait(120)
    }
    await wait(300)
  }

  /** Laisse la page réagir, et attend une navigation éventuelle. */
  private async settle(wc: WebContents, pause = 350): Promise<void> {
    await wait(pause)
    const started = Date.now()
    while (wc.isLoading() && Date.now() - started < 15_000) await wait(120)
  }
}
