import {
  HOME_URL,
  type PersistedState,
  type PrivacyStats,
  type ProviderId,
  type ProviderSettings,
  type Settings,
  type Space,
  type TabGroup,
  type TabState
} from './types'
import { PROVIDERS, providerDefaults } from './providers'
import { DEFAULT_GLASS_BLUR, THEME_PRESETS } from './theme'

export interface SpaceTint {
  id: string
  label: string
  color: string
}

// Les teintes de l'app, nommées comme les thèmes de la grille des réglages
// et dans le même ordre : choisir un espace revient à choisir un thème, sans
// jeu de couleurs à part. Le nom sert de libellé lisible ; la couleur reste la
// variante claire du thème, seule valeur stockée dans vela.json.
//
// « Braise » est le thème du ciel de l'accueil ; l'ambiance d'espace porte
// déjà ce nom. La teinte s'appelle donc « Brique » ici : deux choix voisins ne
// se présentent plus sous le même mot. Seul le libellé change — les espaces
// stockent une couleur hexadécimale, jamais le nom du thème.
const TINT_LABELS: Record<string, string> = { braise: 'Brique' }

export const SPACE_TINTS: SpaceTint[] = THEME_PRESETS.map((preset) => ({
  id: preset.id,
  label: TINT_LABELS[preset.id] ?? preset.label,
  color: preset.light
}))

/** Teinte connue pour une couleur stockée, ou null pour une couleur libre. */
export function spaceTintFor(
  color: string,
  tints: readonly SpaceTint[] = SPACE_TINTS
): SpaceTint | null {
  const needle = color.trim().toLowerCase()
  return tints.find((tint) => tint.color.toLowerCase() === needle) ?? null
}

export const SPACE_COLORS = SPACE_TINTS.map((tint) => tint.color)

export function defaultProviders(): Record<ProviderId, ProviderSettings> {
  return Object.fromEntries(
    PROVIDERS.map((provider) => [provider.id, providerDefaults(provider.id)])
  ) as Record<ProviderId, ProviderSettings>
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  searchEngine: 'duckduckgo',
  customEngineId: '',
  customEngines: [],
  searchKeywords: [
    { keyword: 'g', engineId: 'google' },
    { keyword: 'd', engineId: 'duckduckgo' },
    { keyword: 'b', engineId: 'brave' },
    { keyword: 's', engineId: 'startpage' }
  ],
  searxInstance: '',
  startupBehavior: 'restore',
  startupUrl: '',
  newTabBlank: false,
  historyRetention: 'forever',
  downloadDir: null,
  askDownloadLocation: false,
  openAfterDownload: false,
  webLanguage: 'fr',
  defaultZoom: 1,
  zoomByHost: {},
  themeId: 'indigo',
  customAccent: '#5b5bd6',
  accentOverride: false,
  glass: 'normal',
  glassBlur: DEFAULT_GLASS_BLUR,
  ambience: 'none',
  ambienceScope: 'page',
  ambienceIntensity: 80,
  homeBackground: 'gradient',
  homeIntensity: 'normal',
  homeImage: null,
  homeBlur: 18,
  skyVariant: 'braise',
  density: 'normal',
  textSize: 'normal',
  sidebarSide: 'left',
  highContrast: false,
  reduceMotion: 'system',
  hourTheme: false,
  hourStart: 7,
  hourEnd: 19,
  perSpaceThemes: false,
  skyMigrated: true,
  blockTrackers: true,
  blockLevel: 'trackers',
  thumbnails: false,
  updateChecks: 'auto',
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

export function createGroup(
  spaceId: string,
  name: string,
  color: string,
  now = Date.now()
): TabGroup {
  return { id: newId(), spaceId, name, color, collapsed: false, createdAt: now }
}

export function createTab(
  spaceId: string,
  now = Date.now(),
  patch: Partial<TabState> = {}
): TabState {
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
    tunnelMaps: [],
    privacyStats: emptyPrivacyStats(now)
  }
}

/** Jour local `AAAA-MM-JJ` : les compteurs basculent à minuit, pas à UTC. */
export function dayKey(now = Date.now()): string {
  const date = new Date(now)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Lundi de la semaine locale, en `AAAA-MM-JJ`. */
export function weekKey(now = Date.now()): string {
  const date = new Date(now)
  // `getDay()` place dimanche à 0 : la semaine française commence lundi.
  const offset = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - offset)
  return dayKey(date.getTime())
}

export function emptyPrivacyStats(now = Date.now()): PrivacyStats {
  return { day: dayKey(now), today: 0, weekStart: weekKey(now), week: 0 }
}
