/**
 * Gestes d'onglet extraits de `Browser` (tranche 3 de C2).
 *
 * La sonde d'exécution rejoue ces gestes dans l'application réelle, sauf la
 * scission : la coque refuse d'ouvrir deux volets dans une fenêtre pilotée par
 * CDP. Ce test couvre donc la logique ici, sans fenêtre ni vue native.
 */
import { describe, expect, it } from 'vitest'
import { normalizeState } from './store'
import type { TabsHost } from './tabsOps'
import { activateTab, createTab, pinTab, reorderTab, setSplitTab, toggleSplit } from './tabsOps'

function hote(options: { split?: boolean } = {}) {
  const state = normalizeState({})
  const gestes = { persist: 0, broadcast: 0, focus: 0, detruits: [] as string[] }
  const host: TabsHost = {
    state: () => state,
    persist: () => void gestes.persist++,
    broadcast: () => void gestes.broadcast++,
    focusWindow: () => void gestes.focus++,
    splitAllowed: () => options.split !== false,
    forgetAgentTab: () => {},
    destroyView: (id) => void gestes.detruits.push(id),
    captureSource: () => null,
    storeThumbnail: async () => true
  }
  return { host, state, gestes }
}

describe('createTab', () => {
  it('ajoute un onglet et le rend actif', () => {
    const { host, state, gestes } = hote()
    const avant = state.tabs.length

    const tab = createTab(host, { url: 'https://example.com' })

    expect(state.tabs).toHaveLength(avant + 1)
    expect(state.tabs.at(-1)?.id).toBe(tab.id)
    expect(state.activeTabBySpace[state.activeSpaceId]).toBe(tab.id)
    expect(gestes.persist).toBeGreaterThan(0)
    expect(gestes.broadcast).toBeGreaterThan(0)
    expect(gestes.focus).toBeGreaterThan(0)
  })

  it('ramène à la page d’accueil existante au lieu d’en ouvrir une seconde', () => {
    const { host, state } = hote()
    const premier = createTab(host, { url: 'vela://home' })
    const avant = state.tabs.length

    const second = createTab(host, { url: 'vela://home' })

    expect(second.id).toBe(premier.id)
    expect(state.tabs).toHaveLength(avant)
  })

  it('refuse une adresse locale', () => {
    const { host } = hote()
    expect(() => createTab(host, { url: 'file:///etc/passwd' })).toThrow(/refusée/)
  })
})

describe('scission', () => {
  it('ouvre deux volets puis les referme', () => {
    const { host, state } = hote()
    const a = createTab(host, { url: 'https://example.com' })
    createTab(host, { url: 'https://example.org' })
    activateTab(host, a.id)

    toggleSplit(host)
    const second = state.secondTabBySpace[state.activeSpaceId]
    expect(state.split).toBe(true)
    // Le second volet est le premier onglet de l'espace qui n'est pas l'actif.
    expect(second).toBeTruthy()
    expect(second).not.toBe(a.id)
    expect(state.tabs.some((tab) => tab.id === second)).toBe(true)

    toggleSplit(host)
    expect(state.split).toBe(false)
  })

  it('choisit le second volet demandé', () => {
    const { host, state } = hote()
    const premier = createTab(host, { url: 'https://example.com' })
    const autre = createTab(host, { url: 'https://example.org' })
    // Depuis l'autre volet : choisir un onglet qui n'est pas l'actif.
    activateTab(host, premier.id)

    setSplitTab(host, autre.id)

    expect(state.split).toBe(true)
    expect(state.secondTabBySpace[state.activeSpaceId]).toBe(autre.id)
  })

  it('ne fait rien quand la fenêtre est trop étroite', () => {
    const { host, state, gestes } = hote({ split: false })
    createTab(host, { url: 'https://example.com' })
    createTab(host, { url: 'https://example.org' })
    gestes.persist = 0

    toggleSplit(host)

    expect(state.split).toBe(false)
    expect(gestes.persist).toBe(0)
  })
})

describe('épinglage et réordonnancement', () => {
  it('épingle un onglet et le sort de son dossier', () => {
    const { host, state } = hote()
    const tab = createTab(host, { url: 'https://example.com' })
    const cible = state.tabs.find((item) => item.id === tab.id)
    if (cible) cible.groupId = 'dossier'

    pinTab(host, { id: tab.id, pinned: true })

    expect(cible?.pinned).toBe(true)
    expect(cible?.groupId).toBeNull()
  })

  it('place un onglet avant sa cible', () => {
    const { host, state } = hote()
    const a = createTab(host, { url: 'https://example.com' })
    const b = createTab(host, { url: 'https://example.org' })

    reorderTab(host, { id: b.id, targetId: a.id, position: 'before' })

    const ids = state.tabs.map((item) => item.id)
    expect(ids.indexOf(b.id)).toBe(ids.indexOf(a.id) - 1)
  })
})
