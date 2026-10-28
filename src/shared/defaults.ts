import { HOME_URL, type PersistedState, type ProviderId, type ProviderSettings, type Settings, type Space, type TabGroup, type TabState } from './types'
import { PROVIDERS, providerDefaults } from './providers'
import { THEME_PRESETS } from './theme'

export interface SpaceTint {
  id: string
  label: string
  color: string
}

// Les dix teintes de l'app, nommées comme les thèmes de la grille des réglages
// et dans le même ordre : choisir un espace revient à choisir un thème, sans
// jeu de couleurs à part. Le nom sert de libellé lisible ; la couleur reste la
// variante claire du thème, seule valeur stockée dans vela.json.
export const SPACE_TINTS: SpaceTint[] = THEME_PRESETS.map((preset) => ({
  id: preset.id,
  label: preset.label,
  color: preset.light
}))

export const SPACE_COLORS = SPACE_TINTS.map((tint) => tint.color)

export function defaultProviders(): Record<ProviderId, ProviderSettings> {
  return Object.fromEntries(PROVIDERS.map((provider) => [provider.id, providerDefaults(provider.id)])) as Record<
    ProviderId,
    ProviderSettings
  >
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  searchEngine: 'duckduckgo',
  searxInstance: '',
  themeId: 'indigo',
  customAccent: '#5B5BD6',
  glass: 'normal',
  homeBackground: 'gradient',
  homeImage: null,
  homeBlur: 18,
  highContrast: false,
  hourTheme: false,
  perSpaceThemes: false,
  blockTrackers: true,
  blockLevel: 'trackers',
  thumbnails: false,
  sidebarCollapsed: false,
  onboarded: false,
  agent: {
    mode: 'demo',
    provider: 'openai',
    providers: defaultProviders()
  }
}

export function newId(): string {
  return globalThis.crypto.randomUUID()
}

export function createSpace(name = 'Personnel', color = SPACE_COLORS[0], now = Date.now()): Space {
  const id = newId()
  return { id, name, color, partition: `persist:vela-${id}`, createdAt: now }
}

export function createGroup(spaceId: string, name: string, color: string, now = Date.now()): TabGroup {
  return { id: newId(), spaceId, name, color, collapsed: false, createdAt: now }
}

export function createTab(spaceId: string, now = Date.now(), patch: Partial<TabState> = {}): TabState {
  return {
    id: newId(),
    spaceId,
    url: HOME_URL,
    title: 'Nouvel onglet',
    pinned: false,
    createdAt: now,
    lastActiveAt: now,
    ...patch
  }
}

export function createDefaultState(now = Date.now()): PersistedState {
  const space = createSpace('Personnel', SPACE_COLORS[0], now)
  const tab = createTab(space.id, now)
  return {
    version: 1,
    spaces: [space],
    tabs: [tab],
    groups: [],
    activeSpaceId: space.id,
    activeTabBySpace: { [space.id]: tab.id },
    secondTabBySpace: { [space.id]: null },
    split: false,
    splitRatio: 0.5,
    settings: {
      ...DEFAULT_SETTINGS,
      agent: { mode: 'demo', provider: 'openai', providers: defaultProviders() }
    },
    history: [],
    closed: [],
    bookmarks: [],
    privacyExemptions: [],
    tasks: [],
    works: [],
    tunnelMaps: []
  }
}
