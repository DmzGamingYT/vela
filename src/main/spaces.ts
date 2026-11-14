/**
 * Gestion des espaces (profils) : création, modification, duplication,
 * suppression, activation et effacement des données de navigation.
 *
 * Ces mutations vivaient dans `Browser`, entre les onglets, les groupes, les
 * téléchargements et l'IPC — 1 900 lignes dans une seule classe. Le code est
 * copié sans changement de comportement : `Browser` fournit un hôte qui expose
 * l'état, la sauvegarde, la diffusion et la destruction des vues. Rien ici ne
 * connaît Electron au-delà de la session d'un espace.
 */
import { session } from 'electron'
import { createSpace as createSpaceState, createTab as createTabState, SPACE_COLORS } from '@shared/defaults'
import {
  normalizeLetterboxd,
  partitionFor,
  sanitizeSpaceAvatar,
  sanitizeSpaceBackground,
  sanitizeSpaceShortcuts,
  sanitizeWatchlist,
  suggestSpaceName
} from '@shared/space'
import { isThemeId, parseHex } from '@shared/theme'
import type { CreateSpaceInput, UpdateSpaceInput } from '@shared/api'
import { pruneAvatars, saveAvatarDataUrl } from './avatars'
import { asId, asString } from './coerce'
import type { PersistedState } from '@shared/types'

/** Ce qu'une mutation d'espace demande au navigateur, et rien de plus. */
export interface SpacesHost {
  /** Dossier de données (photos d'espace, avatars). */
  readonly profileDir: string
  state(): PersistedState
  persist(): void
  broadcast(): void
  focusWindow(): void
  destroySpaceViews(spaceId: string): void
  referencedAvatars(): Set<string>
}

export function addSpace(host: SpacesHost, input: unknown): void {
  const payload = (input ?? {}) as CreateSpaceInput
  const state = host.state()
  const name = asString(payload.name).trim().slice(0, 40) || `Profil ${state.spaces.length + 1}`
  const color = /^#[0-9a-f]{6}$/i.test(asString(payload.color))
    ? asString(payload.color)
    : SPACE_COLORS[state.spaces.length % SPACE_COLORS.length]
  const now = Date.now()
  const space = createSpaceState(name, color, now)
  space.avatar = storeAvatar(host, sanitizeSpaceAvatar(payload.avatar))
  space.background = sanitizeSpaceBackground(payload.background)
  space.shortcuts = sanitizeSpaceShortcuts(payload.shortcuts)
  space.blockTrackers = payload.blockTrackers !== false
  space.watchlist = payload.watchlist === true
  space.letterboxd = normalizeLetterboxd(payload.letterboxd)
  space.watchItems = sanitizeWatchlist(payload.watchItems)
  space.letterboxdLog = []
  space.letterboxdLogAt = null
  if (isThemeId(payload.theme)) space.theme = payload.theme
  space.accent = parseHex(asString(payload.accent)) ?? null
  const tab = createTabState(space.id, now)
  state.spaces.push(space)
  state.tabs.push(tab)
  state.activeSpaceId = space.id
  state.activeTabBySpace[space.id] = tab.id
  state.secondTabBySpace[space.id] = null
  host.persist()
  host.broadcast()
  host.focusWindow()
}

export function updateSpace(host: SpacesHost, input: unknown): void {
  const payload = (input ?? {}) as UpdateSpaceInput & { id?: unknown }
  const id = asId(payload.id)
  const space = host.state().spaces.find((item) => item.id === id)
  if (!space) return
  if (typeof payload.name === 'string' && payload.name.trim())
    space.name = payload.name.trim().slice(0, 40)
  if (typeof payload.color === 'string' && /^#[0-9a-f]{6}$/i.test(payload.color))
    space.color = payload.color
  if ('theme' in payload) space.theme = isThemeId(payload.theme) ? payload.theme : null
  if ('accent' in payload) {
    space.accent = parseHex(typeof payload.accent === 'string' ? payload.accent : '') ?? null
  }
  if ('avatar' in payload) space.avatar = storeAvatar(host, sanitizeSpaceAvatar(payload.avatar))
  if ('background' in payload) space.background = sanitizeSpaceBackground(payload.background)
  if ('shortcuts' in payload) space.shortcuts = sanitizeSpaceShortcuts(payload.shortcuts)
  if ('watchlist' in payload) space.watchlist = payload.watchlist === true
  if ('letterboxd' in payload) space.letterboxd = normalizeLetterboxd(payload.letterboxd)
  if ('watchItems' in payload) space.watchItems = sanitizeWatchlist(payload.watchItems)
  if (typeof payload.blockTrackers === 'boolean') space.blockTrackers = payload.blockTrackers
  host.persist()
  pruneSpaceAvatars(host)
  host.broadcast()
}

/**
 * Une photo choisie dans la fenêtre arrive en data URL : elle part sur le
 * disque et vela.json ne garde qu'un nom de fichier. En cas d'échec, la
 * data URL est conservée pour ne rien perdre.
 */
export function storeAvatar(host: SpacesHost, value: string | null): string | null {
  if (!value || !value.startsWith('image:data:')) return value
  const saved = saveAvatarDataUrl(host.profileDir, value)
  return saved ?? value
}

/** Les photos remplacées ne restent pas sur le disque. */
export function pruneSpaceAvatars(host: SpacesHost): void {
  pruneAvatars(host.profileDir, host.referencedAvatars())
}

export function removeSpace(host: SpacesHost, id: string): void {
  const state = host.state()
  if (state.spaces.length <= 1) throw new Error('Vela garde toujours au moins un profil.')
  const space = state.spaces.find((item) => item.id === id)
  if (!space) return
  host.destroySpaceViews(id)
  state.spaces = state.spaces.filter((item) => item.id !== id)
  state.tabs = state.tabs.filter((tab) => tab.spaceId !== id)
  delete state.activeTabBySpace[id]
  delete state.secondTabBySpace[id]
  if (state.activeSpaceId === id) {
    state.activeSpaceId = state.spaces[0].id
    const next = state.tabs.find((tab) => tab.spaceId === state.activeSpaceId)
    if (next) state.activeTabBySpace[state.activeSpaceId] = next.id
  }
  host.persist()
  pruneSpaceAvatars(host)
  host.broadcast()
  host.focusWindow()
}

/**
 * Duplique la configuration d'un espace — nom, apparence, sites, gadgets et
 * compte public — sans copier ses cookies, son historique ni sa partition.
 * Le nouvel espace reçoit donc une session Chromium neuve.
 */
export function duplicateSpace(host: SpacesHost, id: string): void {
  const state = host.state()
  const source = state.spaces.find((item) => item.id === id)
  if (!source) return
  const now = Date.now()
  const name = suggestSpaceName(state.spaces.map((item) => item.name))
  const copy = createSpaceState(name, source.color, now)
  copy.theme = source.theme ?? null
  copy.avatar = source.avatar ?? null
  copy.background = source.background ?? 'none'
  copy.shortcuts = sanitizeSpaceShortcuts(source.shortcuts)
  copy.blockTrackers = source.blockTrackers !== false
  copy.watchlist = source.watchlist === true
  copy.letterboxd = normalizeLetterboxd(source.letterboxd)
  copy.watchItems = sanitizeWatchlist(source.watchItems)
  // Le journal importé est un historique de lecture : il reste à la source.
  copy.letterboxdLog = []
  copy.letterboxdLogAt = null
  const tab = createTabState(copy.id, now)
  state.spaces.push(copy)
  state.tabs.push(tab)
  state.activeSpaceId = copy.id
  state.activeTabBySpace[copy.id] = tab.id
  state.secondTabBySpace[copy.id] = null
  host.persist()
  host.broadcast()
  host.focusWindow()
}

/**
 * Vide les données de navigation d'un espace : cookies, stockage, cache et
 * historique de sa partition. Les autres espaces, qui ont chacun la leur, ne
 * sont pas touchés. L'espace et ses réglages restent en place.
 */
export async function clearSpaceData(host: SpacesHost, id: string): Promise<void> {
  const state = host.state()
  const space = state.spaces.find((item) => item.id === id)
  if (!space) return
  try {
    const ses = session.fromPartition(partitionFor(space))
    await ses.clearStorageData()
    await ses.clearCache()
  } catch {
    /* partition déjà libérée : l'historique local part quand même */
  }
  state.history = state.history.filter((entry) => entry.spaceId !== id)
  state.closed = state.closed.filter((tab) => tab.spaceId !== id)
  host.destroySpaceViews(id)
  state.tabs = state.tabs.filter((tab) => tab.spaceId !== id)
  const tab = createTabState(id)
  state.tabs.push(tab)
  state.activeTabBySpace[id] = tab.id
  state.secondTabBySpace[id] = null
  if (state.activeSpaceId === id) state.split = false
  host.persist()
  host.broadcast()
  host.focusWindow()
}

export function activateSpace(host: SpacesHost, id: string): void {
  const state = host.state()
  if (!state.spaces.some((space) => space.id === id)) return
  state.activeSpaceId = id
  const tab = state.tabs.find((item) => item.id === state.activeTabBySpace[id])
  if (tab) tab.lastActiveAt = Date.now()
  host.persist()
  host.broadcast()
  host.focusWindow()
}
