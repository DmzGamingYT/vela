import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { safeStorage } from 'electron'
import { createDefaultState, createTab, defaultProviders, SPACE_COLORS } from '@shared/defaults'
import { isProviderId, PROVIDERS, providerDefaults } from '@shared/providers'
import type {
  HistoryEntry,
  PersistedState,
  ProviderId,
  ProviderSettings,
  ProviderStatus,
  Settings,
  Space,
  TabGroup,
  TabState
} from '@shared/types'
import { HOME_URL } from '@shared/types'

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
    searchEngine:
      input.searchEngine === 'google' || input.searchEngine === 'brave' ? input.searchEngine : 'duckduckgo',
    blockTrackers: input.blockTrackers !== false,
    sidebarCollapsed: Boolean(input.sidebarCollapsed),
    onboarded: Boolean(input.onboarded),
    agent: { mode, provider, providers }
  }
}

export function normalizeState(raw: unknown): PersistedState {
  const fallback = createDefaultState()
  if (!raw || typeof raw !== 'object') return fallback
  const input = raw as Partial<PersistedState>
  const spaces = Array.isArray(input.spaces) ? input.spaces.filter(isSpace) : []
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
      tasks,
      works
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
    this.state = normalizeState(raw)
    this.secrets = this.readSecrets()
    this.migrateLegacySecret()
    this.syncKeyFlags()
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
    const tmp = `${this.file}.tmp`
    try {
      writeFileSync(tmp, JSON.stringify(this.state), 'utf8')
      renameSync(tmp, this.file)
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
