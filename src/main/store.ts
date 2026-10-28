import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { safeStorage } from 'electron'
import {
  migrateBookmarkOrder,
  moveBookmark as moveBookmarkList,
  orderBookmarks,
  reorderBookmarks as reorderBookmarkList
} from '@shared/bookmarkOrder'
import { createDefaultState, createTab, defaultProviders, SPACE_COLORS } from '@shared/defaults'
import { isProviderId, PROVIDERS, providerDefaults } from '@shared/providers'
import type {
  Bookmark,
  HistoryEntry,
  PersistedState,
  ProviderId,
  ProviderSettings,
  ProviderStatus,
  SearchEngineId,
  Settings,
  Space,
  TabGroup,
  TabState
} from '@shared/types'
import { HOME_URL } from '@shared/types'
import { sanitizeMap, summarizeMap, type TunnelMap, type TunnelMapSummary } from '@shared/tunnel'
import { isThemeId, sanitizeAppearance } from '@shared/theme'
import {
  avatarFile,
  partitionFor,
  sanitizeSpaceAvatar,
  sanitizeSpaceBackground,
  sanitizeSpaceShortcuts
} from '@shared/space'
import { saveAvatarDataUrl } from './avatars'

function isSpace(value: unknown): value is Space {
  const space = value as Space
  return Boolean(space && typeof space.id === 'string' && typeof space.name === 'string' && typeof space.color === 'string')
}

function isTab(value: unknown): value is TabState {
  const tab = value as TabState
  return Boolean(
    tab &&
      typeof tab.id === 'string' &&
      typeof tab.spaceId === 'string' &&
      typeof tab.url === 'string' &&
      typeof tab.title === 'string'
  )
}

function isGroup(value: unknown): value is TabGroup {
  const group = value as TabGroup
  return Boolean(
    group && typeof group.id === 'string' && typeof group.spaceId === 'string' && typeof group.name === 'string'
  )
}

function isHistory(value: unknown): value is HistoryEntry {
  const entry = value as HistoryEntry
  return Boolean(entry && typeof entry.url === 'string' && typeof entry.visitedAt === 'number')
}

const SEARCH_ENGINES: SearchEngineId[] = [
  'duckduckgo',
  'brave',
  'startpage',
  'google',
  'bing',
  'ecosia',
  'qwant',
  'searxng'
]

function isSearchEngine(value: unknown): value is SearchEngineId {
  return typeof value === 'string' && SEARCH_ENGINES.includes(value as SearchEngineId)
}

function mergeProvider(raw: unknown, id: ProviderId): ProviderSettings {
  const defaults = providerDefaults(id)
  const input = (raw ?? {}) as Partial<ProviderSettings>
  const status: ProviderStatus =
    input.status === 'ok' || input.status === 'error' || input.status === 'stored' ? input.status : 'none'
  return {
    model: typeof input.model === 'string' && input.model.trim() ? input.model.trim() : defaults.model,
    baseUrl: typeof input.baseUrl === 'string' && input.baseUrl.trim() ? input.baseUrl.trim() : defaults.baseUrl,
    hasKey: Boolean(input.hasKey),
    status: input.hasKey ? status : 'none',
    detail: typeof input.detail === 'string' ? input.detail.slice(0, 160) : undefined
  }
}

function mergeSettings(raw: unknown): Settings {
  const input = (raw ?? {}) as Partial<Settings>
  const agent = (input.agent ?? {}) as Partial<Settings['agent']> & { baseUrl?: string; model?: string; hasKey?: boolean }
  const mode = agent.mode === 'api' ? 'api' : 'demo'
  const provider = isProviderId(agent.provider) ? agent.provider : 'openai'
  const rawProviders = (agent.providers ?? {}) as Partial<Record<ProviderId, unknown>>
  const providers = defaultProviders()

  for (const definition of PROVIDERS) {
    providers[definition.id] = mergeProvider(rawProviders[definition.id], definition.id)
  }

  // Migration des versions à clé unique : l’ancien endpoint devient OpenAI.
  if (!rawProviders.openai && (agent.baseUrl || agent.model)) {
    providers.openai.model = agent.model || providers.openai.model
    providers.openai.baseUrl = agent.baseUrl || providers.openai.baseUrl
    providers.openai.hasKey = Boolean(agent.hasKey)
    providers.openai.status = agent.hasKey ? 'stored' : 'none'
  }

  return {
    theme: input.theme === 'light' || input.theme === 'dark' ? input.theme : 'system',
    searchEngine: isSearchEngine(input.searchEngine) ? input.searchEngine : 'duckduckgo',
    searxInstance: typeof input.searxInstance === 'string' ? input.searxInstance.trim().slice(0, 200) : '',
    ...sanitizeAppearance(input),
    blockTrackers: input.blockTrackers !== false,
    thumbnails: input.thumbnails === true,
    sidebarCollapsed: Boolean(input.sidebarCollapsed),
    onboarded: Boolean(input.onboarded),
    agent: { mode, provider, providers }
  }
}

export function normalizeState(raw: unknown): PersistedState {
  const fallback = createDefaultState()
  if (!raw || typeof raw !== 'object') return fallback
  const input = raw as Partial<PersistedState>
  const spaces = (Array.isArray(input.spaces) ? input.spaces.filter(isSpace) : []).map((space) => ({
    ...space,
    // Un fichier ancien ou bricolé peut omettre la partition : sans elle,
    // Chromium refuse la session et l'ouverture d'un onglet plante l'app.
    partition: partitionFor(space),
    theme: isThemeId(space.theme) ? space.theme : null,
    avatar: sanitizeSpaceAvatar(space.avatar),
    background: sanitizeSpaceBackground(space.background),
    shortcuts: sanitizeSpaceShortcuts(space.shortcuts),
    blockTrackers: space.blockTrackers !== false
  }))
  if (spaces.length === 0) return fallback

  const spaceIds = new Set(spaces.map((space) => space.id))
  const tabs = (Array.isArray(input.tabs) ? input.tabs.filter(isTab) : []).filter((tab) =>
    spaceIds.has(tab.spaceId)
  )

  const now = Date.now()
  for (const space of spaces) {
    if (!tabs.some((tab) => tab.spaceId === space.id)) tabs.push(createTab(space.id, now))
  }

  const groups = (Array.isArray(input.groups) ? input.groups.filter(isGroup) : [])
    .filter((group) => spaceIds.has(group.spaceId))
    .map((group) => ({
      id: group.id,
      spaceId: group.spaceId,
      name: group.name.trim().slice(0, 40) || 'Dossier',
      color: /^#[0-9a-f]{6}$/i.test(group.color) ? group.color : SPACE_COLORS[0],
      collapsed: Boolean(group.collapsed),
      createdAt: typeof group.createdAt === 'number' ? group.createdAt : now
    }))
  const groupById = new Map(groups.map((group) => [group.id, group]))

  for (const tab of tabs) {
    const group = tab.groupId ? groupById.get(tab.groupId) : undefined
    if (tab.pinned || !group || group.spaceId !== tab.spaceId) tab.groupId = null
  }

  const activeSpaceId =
    typeof input.activeSpaceId === 'string' && spaceIds.has(input.activeSpaceId) ? input.activeSpaceId : spaces[0].id

  const activeTabBySpace: Record<string, string> = {}
  const secondTabBySpace: Record<string, string | null> = {}
  for (const space of spaces) {
    const own = tabs.filter((tab) => tab.spaceId === space.id)
    const wanted = input.activeTabBySpace?.[space.id]
    const active = own.find((tab) => tab.id === wanted) ?? own[0]
    activeTabBySpace[space.id] = active.id
    const second = input.secondTabBySpace?.[space.id]
    secondTabBySpace[space.id] = second && own.some((tab) => tab.id === second) && second !== active.id ? second : null
  }

  const history = (Array.isArray(input.history) ? input.history.filter(isHistory) : [])
    .filter((entry) => entry.url !== HOME_URL)
    .slice(0, 2000)

  const bookmarks = (Array.isArray(input.bookmarks) ? input.bookmarks : [])
    .filter(
      (entry): entry is Bookmark =>
        Boolean(entry && typeof (entry as Bookmark).id === 'string' && typeof (entry as Bookmark).url === 'string')
    )
    .map((entry, index) => ({
      id: entry.id,
      url: entry.url.slice(0, 2000),
      title: typeof entry.title === 'string' ? entry.title.slice(0, 200) : entry.url,
      createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : now,
      favicon: typeof entry.favicon === 'string' ? entry.favicon.slice(0, 2000) : undefined,
      order: Number.isInteger(entry.order) && entry.order >= 0 ? entry.order : index
    }))
    .slice(0, 500)
    .sort((a, b) => a.order - b.order)
    .map((entry, order) => ({ ...entry, order }))

  const closed = (Array.isArray(input.closed) ? input.closed : [])
    .filter((entry) => entry && typeof entry.url === 'string' && typeof entry.spaceId === 'string')
    .map((entry) => {
      const group = entry.groupId ? groupById.get(entry.groupId) : undefined
      return {
        spaceId: entry.spaceId,
        url: entry.url,
        title: typeof entry.title === 'string' ? entry.title : '',
        pinned: Boolean(entry.pinned),
        groupId: group && group.spaceId === entry.spaceId ? group.id : null
      }
    })
    .slice(0, 25)

    const tasks = (Array.isArray((input as { tasks?: unknown }).tasks) ? (input as { tasks: unknown[] }).tasks : [])
      .filter(
        (entry): entry is { id: string; title: string; done?: unknown; createdAt?: unknown; dueAt?: unknown } =>
          Boolean(entry && typeof (entry as { id?: unknown }).id === 'string' && typeof (entry as { title?: unknown }).title === 'string')
      )
      .map((entry) => ({
        id: entry.id,
        title: entry.title.slice(0, 200),
        done: Boolean(entry.done),
        createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : now,
        dueAt: typeof entry.dueAt === 'number' ? entry.dueAt : null
      }))
      .slice(0, 200)

    const works = (Array.isArray((input as { works?: unknown }).works) ? (input as { works: unknown[] }).works : [])
      .filter(
        (entry): entry is {
          id: string
          title: string
          prompt?: unknown
          markdown?: unknown
          preview?: unknown
          mode?: unknown
          sources?: unknown
          spaceId?: unknown
          createdAt?: unknown
          updatedAt?: unknown
          archived?: unknown
        } => Boolean(entry && typeof (entry as { id?: unknown }).id === 'string' && typeof (entry as { title?: unknown }).title === 'string')
      )
      .map((entry) => ({
        id: entry.id,
        title: entry.title.slice(0, 160),
        prompt: typeof entry.prompt === 'string' ? entry.prompt.slice(0, 2000) : '',
        markdown: typeof entry.markdown === 'string' ? entry.markdown.slice(0, 200_000) : '',
        preview: typeof entry.preview === 'string' ? entry.preview.slice(0, 180) : '',
        mode: entry.mode === 'api' ? ('api' as const) : ('demo' as const),
        sources: (Array.isArray(entry.sources) ? entry.sources : [])
          .filter((source): source is { title?: unknown; url?: unknown } => Boolean(source && typeof (source as { url?: unknown }).url === 'string'))
          .map((source) => ({
            title: typeof source.title === 'string' ? source.title.slice(0, 200) : '',
            url: String(source.url).slice(0, 2000)
          }))
          .slice(0, 12),
        spaceId: typeof entry.spaceId === 'string' ? entry.spaceId : '',
        createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : now,
        updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : now,
        archived: Boolean(entry.archived)
      }))
      .slice(0, 120)

    const tunnelMaps = (Array.isArray((input as { tunnelMaps?: unknown }).tunnelMaps)
      ? ((input as { tunnelMaps: unknown[] }).tunnelMaps)
      : [])
      .map((entry) => sanitizeMap(entry))
      .filter((entry): entry is TunnelMap => Boolean(entry))
      .slice(0, 20)

    return {
      version: 1,
      spaces,
      tabs,
      groups,
      activeSpaceId,
      activeTabBySpace,
      secondTabBySpace,
      split: Boolean(input.split),
      splitRatio:
        typeof input.splitRatio === 'number' && input.splitRatio >= 0.25 && input.splitRatio <= 0.75
          ? input.splitRatio
          : 0.5,
      settings: mergeSettings(input.settings),
      history,
      closed,
      bookmarks,
      privacyExemptions: (Array.isArray(input.privacyExemptions) ? input.privacyExemptions : [])
        .filter((host): host is string => typeof host === 'string' && /^[a-z0-9.-]+$/i.test(host))
        .map((host) => host.toLowerCase())
        .slice(0, 200),
      tasks,
      works,
      tunnelMaps
    }
}

export class Store {
  readonly dir: string
  private readonly file: string
  private readonly secretsFile: string
  private readonly legacySecretFile: string
  private state: PersistedState
  private secrets: Record<string, string>
  private timer: NodeJS.Timeout | null = null
  /** Dernier contenu écrit : évite de réécrire le même fichier inutilement. */
  private lastPayload: string | null = null

  constructor(dir: string) {
    this.dir = dir
    mkdirSync(dir, { recursive: true })
    this.file = join(dir, 'vela.json')
    this.secretsFile = join(dir, 'secrets.json')
    this.legacySecretFile = join(dir, 'secret.bin')
    let raw: unknown = null
    if (existsSync(this.file)) {
      try {
        raw = JSON.parse(readFileSync(this.file, 'utf8'))
      } catch {
        raw = null
      }
    }
    const migratedBookmarks = this.migrateBookmarks(raw)
    const migratedAvatars = this.migrateAvatars(migratedBookmarks)
    this.state = normalizeState(migratedAvatars)
    // Écrit tout de suite : le fichier reste lisible par une version antérieure
    // (les favoris gardent leur ordre) et les migrations ne sont jamais rejouées.
    if (migratedAvatars !== raw) this.flush()
    this.secrets = this.readSecrets()
    this.migrateLegacySecret()
    this.syncKeyFlags()
  }

  /**
   * Ajoute le champ d'ordre aux favoris de la 0.3.7. Le fichier est copié
   * avant toute écriture ; un échec est journalisé et l'app démarre quand même.
   */
  private migrateBookmarks(raw: unknown): unknown {
    let result
    try {
      result = migrateBookmarkOrder(raw)
    } catch (error) {
      this.journal('Migration de l’ordre des favoris impossible : fichier conservé tel quel.', error)
      return raw
    }
    if (!result.changed) return raw

    let backup = 'aucune (fichier absent)'
    try {
      if (existsSync(this.file)) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        backup = join(this.dir, `vela-backup-${stamp}.json`)
        copyFileSync(this.file, backup)
      }
      this.journal(result.journal.join(' '), undefined, `sauvegarde : ${backup}`)
    } catch (error) {
      // Sans sauvegarde, on préfère ne rien écrire : les favoris restent tels quels.
      this.journal('Sauvegarde impossible avant migration : migration reportée.', error)
      return raw
    }
    return result.state
  }

  /**
   * Sort les photos d'avatar de vela.json : chaque `image:data:` devient un
   * fichier et une référence `image:file:<nom>`. Un échec d'écriture laisse
   * l'avatar intact, et rien n'est perdu.
   */
  private migrateAvatars(raw: unknown): unknown {
    if (!raw || typeof raw !== 'object') return raw
    const input = raw as { spaces?: unknown }
    if (!Array.isArray(input.spaces)) return raw

    let changed = false
    let moved = 0
    let kept = 0
    const spaces = input.spaces.map((space) => {
      if (!space || typeof space !== 'object') return space
      const entry = space as { avatar?: unknown }
      if (typeof entry.avatar !== 'string' || !entry.avatar.startsWith('image:data:')) return space
      const saved = saveAvatarDataUrl(this.dir, entry.avatar)
      if (!saved) {
        kept += 1
        return space
      }
      moved += 1
      changed = true
      return { ...entry, avatar: saved }
    })

    if (!changed) {
      if (kept > 0) this.journal(`${kept} photo(s) d’avatar non converties : format ou taille refusés.`)
      return raw
    }

    let backup = 'aucune (fichier absent)'
    try {
      if (existsSync(this.file)) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        backup = join(this.dir, `vela-backup-${stamp}.json`)
        copyFileSync(this.file, backup)
      }
    } catch (error) {
      this.journal('Sauvegarde impossible avant conversion des avatars : conversion reportée.', error)
      return raw
    }

    this.journal(
      `${moved} photo(s) d’avatar déplacées de vela.json vers avatars/.`,
      undefined,
      `sauvegarde : ${backup}`
    )
    return { ...input, spaces }
  }

  /** Images d'avatar encore référencées par un espace. */
  referencedAvatars(): Set<string> {
    const names = new Set<string>()
    for (const space of this.state.spaces) {
      const name = avatarFile(space.avatar)
      if (name) names.add(name)
    }
    return names
  }

  /** Journal lisible, dans le dossier de données ; ne bloque jamais le démarrage. */
  private journal(message: string, error?: unknown, extra?: string): void {
    const line = `[${new Date().toISOString()}] ${message}${extra ? ` (${extra})` : ''}${
      error instanceof Error ? ` — ${error.message}` : ''
    }`
    console.error(`[vela] ${line}`)
    try {
      appendFileSync(join(this.dir, 'migration.log'), `${line}\n`, 'utf8')
    } catch {
      /* dossier non inscriptible : la ligne console suffit */
    }
  }

  get(): PersistedState {
    return this.state
  }

  update(mutator: (state: PersistedState) => void): void {
    mutator(this.state)
    this.schedule()
  }

  schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), 800)
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    // Une navigation programme une sauvegarde, mais peu de choses changent :
    // réécrire le même JSON toutes les 800 ms bloquait le processus principal
    // pour rien. On ne touche au disque que si le contenu a bougé.
    let payload: string
    try {
      payload = JSON.stringify(this.state)
    } catch (error) {
      console.error('[vela] état non sérialisable', error)
      return
    }
    if (payload === this.lastPayload) return
    const tmp = `${this.file}.tmp`
    try {
      writeFileSync(tmp, payload, 'utf8')
      renameSync(tmp, this.file)
      this.lastPayload = payload
    } catch (error) {
      console.error('[vela] sauvegarde impossible', error)
    }
  }

  pushHistory(entry: HistoryEntry): void {
    this.update((state) => {
      const now = entry.visitedAt
      const previous = state.history[0]
      if (previous && previous.url === entry.url && now - previous.visitedAt < 5000) {
        previous.visitedAt = now
        previous.title = entry.title || previous.title
        return
      }
      state.history = [entry, ...state.history.filter((item) => item.url !== entry.url)].slice(0, 2000)
    })
  }

  clearHistory(): void {
    this.update((state) => {
      state.history = []
    })
  }

  removeHistory(url: string): void {
    this.update((state) => {
      state.history = state.history.filter((entry) => entry.url !== url)
    })
  }

  /** Ajoute ou retire un favori ; renvoie l'état final (true = enregistré). */
  toggleBookmark(url: string, title: string, favicon?: string): boolean {
    let added = false
    this.update((state) => {
      const existing = state.bookmarks.find((entry) => entry.url === url)
      if (existing) {
        state.bookmarks = state.bookmarks.filter((entry) => entry.url !== url)
        return
      }
      added = true
      // En fin de liste : un favori ajouté ne bouscule pas l'ordre choisi.
      state.bookmarks = [
        ...state.bookmarks,
        {
          id: crypto.randomUUID(),
          url,
          title: (title || url).trim().slice(0, 200),
          createdAt: Date.now(),
          favicon: favicon?.slice(0, 2000),
          order: state.bookmarks.length
        }
      ].slice(0, 500)
    })
    return added
  }

  /** Import en masse : fusionne par URL, garde l'ordre reçu. */
  addBookmarks(entries: { url: string; title?: string; favicon?: string }[]): number {
    let added = 0
    this.update((state) => {
      const seen = new Set(state.bookmarks.map((entry) => entry.url))
      const fresh: Bookmark[] = []
      for (const entry of entries) {
        if (!/^https?:/i.test(entry.url) || seen.has(entry.url)) continue
        seen.add(entry.url)
        fresh.push({
          id: crypto.randomUUID(),
          url: entry.url.slice(0, 2000),
          title: (entry.title || entry.url).trim().slice(0, 200),
          createdAt: Date.now(),
          favicon: entry.favicon?.slice(0, 2000),
          order: state.bookmarks.length + fresh.length
        })
        if (state.bookmarks.length + fresh.length >= 500) break
      }
      added = fresh.length
      if (fresh.length > 0) state.bookmarks = [...state.bookmarks, ...fresh]
    })
    return added
  }

  /** Cartes du tunnel : enregistrées localement, les plus récentes d'abord. */
  listTunnelMaps(): TunnelMapSummary[] {
    return [...this.state.tunnelMaps]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((map) => summarizeMap(map))
  }

  getTunnelMap(id: string): TunnelMap | null {
    return this.state.tunnelMaps.find((map) => map.id === id) ?? null
  }

  saveTunnelMap(map: TunnelMap): void {
    const clean = sanitizeMap(map)
    if (!clean) return
    this.update((state) => {
      const existing = state.tunnelMaps.findIndex((entry) => entry.id === clean.id)
      if (existing >= 0) state.tunnelMaps[existing] = clean
      else state.tunnelMaps = [clean, ...state.tunnelMaps].slice(0, 20)
      state.tunnelMaps.sort((a, b) => b.updatedAt - a.updatedAt)
    })
  }

  removeTunnelMap(id: string): void {
    this.update((state) => {
      state.tunnelMaps = state.tunnelMaps.filter((map) => map.id !== id)
    })
  }

  renameTunnelMap(id: string, title: string): void {
    const clean = title.trim().slice(0, 160)
    if (!clean) return
    this.update((state) => {
      const map = state.tunnelMaps.find((entry) => entry.id === id)
      if (!map) return
      map.title = clean
      map.updatedAt = Date.now()
    })
  }

  duplicateTunnelMap(id: string): TunnelMap | null {
    const source = this.getTunnelMap(id)
    if (!source) return null
    const mapId = crypto.randomUUID()
    const ids = new Map<string, string>(source.nodes.map((node) => [node.id, crypto.randomUUID()]))
    const copy: TunnelMap = {
      ...source,
      id: mapId,
      title: `${source.title ?? source.query} (copie)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      nodes: source.nodes.map((node) => ({
        ...node,
        id: ids.get(node.id) as string,
        parentId: node.parentId ? (ids.get(node.parentId) ?? null) : null,
        relatedIds: node.relatedIds
          ? node.relatedIds
              .map((related) => ids.get(related))
              .filter((value): value is string => typeof value === 'string')
          : undefined
      }))
    }
    this.saveTunnelMap(copy)
    return copy
  }

  /** Bascule le bloqueur pour un site ; renvoie true si le site est exempté. */
  togglePrivacyExemption(host: string): boolean {
    const clean = host.trim().toLowerCase().slice(0, 200)
    if (!clean) return false
    let exempted = false
    this.update((state) => {
      const known = state.privacyExemptions.includes(clean)
      exempted = !known
      state.privacyExemptions = known
        ? state.privacyExemptions.filter((item) => item !== clean)
        : [...state.privacyExemptions, clean].slice(0, 200)
    })
    return exempted
  }

  isExempted(host: string): boolean {
    if (!host) return false
    let candidate = host.toLowerCase()
    for (;;) {
      if (this.state.privacyExemptions.includes(candidate)) return true
      const dot = candidate.indexOf('.')
      if (dot < 0) return false
      candidate = candidate.slice(dot + 1)
    }
  }

  removeBookmark(id: string): void {
    this.update((state) => {
      state.bookmarks = state.bookmarks
        .filter((entry) => entry.id !== id)
        .map((entry, order) => ({ ...entry, order }))
    })
  }

  /** Déplace un favori à une position absolue ; refuse une demande invalide. */
  moveBookmark(id: string, position: number): boolean {
    let moved = false
    this.update((state) => {
      const next = moveBookmarkList(orderBookmarks(state.bookmarks), id, position)
      if (!next) return
      state.bookmarks = next
      moved = true
    })
    return moved
  }

  /** Applique une permutation complète des favoris ; refuse tout doublon. */
  reorderBookmarks(ids: string[]): boolean {
    let applied = false
    this.update((state) => {
      const next = reorderBookmarkList(orderBookmarks(state.bookmarks), ids)
      if (!next) return
      state.bookmarks = next
      applied = true
    })
    return applied
  }

  renameBookmark(id: string, title: string): void {
    this.update((state) => {
      const entry = state.bookmarks.find((bookmark) => bookmark.id === id)
      if (entry) entry.title = title.trim().slice(0, 200) || entry.title
    })
  }

  private readSecrets(): Record<string, string> {
    if (!existsSync(this.secretsFile)) return {}
    try {
      if (!safeStorage.isEncryptionAvailable()) return {}
      const parsed = JSON.parse(safeStorage.decryptString(readFileSync(this.secretsFile))) as unknown
      if (!parsed || typeof parsed !== 'object') return {}
      const secrets: Record<string, string> = {}
      for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (isProviderId(id) && typeof value === 'string' && value) secrets[id] = value
      }
      return secrets
    } catch {
      return {}
    }
  }

  private writeSecrets(): void {
    if (Object.keys(this.secrets).length === 0) {
      if (existsSync(this.secretsFile)) unlinkSync(this.secretsFile)
      return
    }
    writeFileSync(this.secretsFile, safeStorage.encryptString(JSON.stringify(this.secrets)))
  }

  /** L’ancienne clé unique (secret.bin) rejoint le fournisseur actif, puis disparaît. */
  private migrateLegacySecret(): void {
    if (!existsSync(this.legacySecretFile)) return
    if (Object.keys(this.secrets).length === 0) {
      try {
        if (safeStorage.isEncryptionAvailable()) {
          const value = safeStorage.decryptString(readFileSync(this.legacySecretFile))
          if (value) {
            this.secrets[this.state.settings.agent.provider] = value
            this.writeSecrets()
          }
        }
      } catch {
        // clé illisible : on repart sans, sans bloquer le démarrage
      }
    }
    try {
      unlinkSync(this.legacySecretFile)
    } catch {
      // déjà absente
    }
  }

  private syncKeyFlags(): void {
    for (const definition of PROVIDERS) {
      const state =
        this.state.settings.agent.providers[definition.id] ?? providerDefaults(definition.id)
      state.hasKey = Boolean(this.secrets[definition.id])
      if (!state.hasKey) {
        state.status = 'none'
        state.detail = undefined
      }
      this.state.settings.agent.providers[definition.id] = state
    }
  }

  getSecret(provider: ProviderId): string | null {
    return this.secrets[provider] ?? null
  }

  hasSecret(provider: ProviderId): boolean {
    return Boolean(this.secrets[provider])
  }

  setSecret(provider: ProviderId, value: string | null): boolean {
    const trimmed = (value ?? '').trim()
    if (trimmed) {
      if (!safeStorage.isEncryptionAvailable()) return false
      this.secrets[provider] = trimmed
    } else {
      delete this.secrets[provider]
    }
    try {
      this.writeSecrets()
    } catch (error) {
      console.error('[vela] clé non enregistrée', error)
      return false
    }
    const state = this.state.settings.agent.providers[provider]
    if (state) {
      state.hasKey = Boolean(trimmed)
      state.status = trimmed ? 'stored' : 'none'
      state.detail = undefined
    }
    this.schedule()
    return true
  }

  setKeyStatus(provider: ProviderId, status: ProviderStatus, detail?: string): void {
    const state = this.state.settings.agent.providers[provider]
    if (!state) return
    state.status = status
    state.detail = detail?.slice(0, 160)
    this.schedule()
  }
}
