/**
 * Dossiers d'onglets : création, modification, suppression.
 *
 * Deuxième tranche de C2 : ce bloc vivait dans `Browser`, au milieu des
 * espaces, des onglets et de l'IPC. Ici il ne connaît que trois gestes de
 * l'hôte — lire l'état, le sauvegarder, le diffuser.
 */
import { createGroup as createGroupState } from '@shared/defaults'
import { GROUP_COLORS, isGroupIcon } from '@shared/groupColors'
import type { CreateGroupInput, UpdateGroupInput } from '@shared/api'
import type { PersistedState, TabGroup } from '@shared/types'
import { asId, asString } from './coerce'

export interface GroupsHost {
  state(): PersistedState
  persist(): void
  broadcast(): void
}

export function createGroup(host: GroupsHost, input: unknown): TabGroup {
  const payload = (input ?? {}) as CreateGroupInput
  const state = host.state()
  const count = state.groups.filter((group) => group.spaceId === state.activeSpaceId).length
  const name = asString(payload.name).trim().slice(0, 40) || `Dossier ${count + 1}`
  const color = /^#[0-9a-f]{6}$/i.test(asString(payload.color))
    ? asString(payload.color)
    : GROUP_COLORS[count % GROUP_COLORS.length]
  const group = createGroupState(state.activeSpaceId, name, color, Date.now())
  const icon = (payload as { icon?: unknown }).icon
  if (isGroupIcon(icon)) group.icon = icon
  state.groups.push(group)

  if (typeof payload.tabId === 'string') {
    const tab = state.tabs.find(
      (item) => item.id === payload.tabId && item.spaceId === group.spaceId && !item.pinned
    )
    if (tab) tab.groupId = group.id
  }

  host.persist()
  host.broadcast()
  return group
}

export function updateGroup(host: GroupsHost, input: unknown): void {
  const payload = (input ?? {}) as UpdateGroupInput
  const id = asId(payload.id)
  const group = host.state().groups.find((item) => item.id === id)
  if (!group) return
  if (typeof payload.name === 'string' && payload.name.trim())
    group.name = payload.name.trim().slice(0, 40)
  if (typeof payload.color === 'string' && /^#[0-9a-f]{6}$/i.test(payload.color))
    group.color = payload.color
  const icon = (payload as { icon?: unknown }).icon
  if (icon === null) group.icon = undefined
  else if (isGroupIcon(icon)) group.icon = icon
  if (typeof payload.collapsed === 'boolean') group.collapsed = payload.collapsed
  host.persist()
  host.broadcast()
}

export function removeGroup(host: GroupsHost, id: string): void {
  const state = host.state()
  if (!state.groups.some((group) => group.id === id)) return
  for (const tab of state.tabs) {
    if (tab.groupId === id) tab.groupId = null
  }
  state.groups = state.groups.filter((group) => group.id !== id)
  host.persist()
  host.broadcast()
}
