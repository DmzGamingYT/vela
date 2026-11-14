import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { registerAgentIpc } from './agent'
import { registerAppIpc } from './app'
import type { IpcHost } from './host'
import { registerLibraryIpc } from './library'
import { registerNotesIpc } from './notes'
import { registerPrivacyIpc } from './privacy'
import { registerSpacesIpc } from './spaces'
import { registerTabsIpc } from './tabs'
import { registerTunnelIpc } from './tunnel'
import type { Handle, On } from './types'

// `ipcMain` enregistre ici les canaux au lieu de les brancher : le test lit
// exactement ce que le pont demande, sans lancer Electron.
const { electronChannels } = vi.hoisted(() => ({ electronChannels: [] as string[] }))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string): void => {
      electronChannels.push(channel)
    },
    on: (channel: string): void => {
      electronChannels.push(channel)
    }
  },
  app: {
    getPath: () => '/tmp',
    getAppPath: () => '/tmp',
    getVersion: () => '0.0.0',
    getName: () => 'Vela',
    isPackaged: false
  },
  shell: {
    openPath: async () => '',
    openExternal: async () => undefined,
    showItemInFolder: () => undefined
  },
  dialog: { showMessageBox: async () => ({ response: 0 }) },
  nativeImage: { createFromPath: () => ({}) },
  safeStorage: { isEncryptionAvailable: () => false }
}))

const { ComicBridge } = await import('../comic')

/** Le source d'un préchargement, lu à côté du test. */
function preloadSource(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

/**
 * Canaux que le pont appelle vraiment : `invoke` attend un gestionnaire
 * `ipcMain.handle` et `send` un écouteur `ipcMain.on`. Les abonnements
 * (`on` côté renderer) vont dans l'autre sens et ne sont pas concernés.
 */
function bridgeChannels(): Set<string> {
  const channels = new Set<string>()
  for (const file of ['../../preload/index.ts', '../../preload/page.ts']) {
    const source = preloadSource(file)
    for (const match of source.matchAll(
      /ipcRenderer\.(?:invoke|send|sendSync)\(\s*(['"])([^'"]+)\1/g
    )) {
      channels.add(match[2])
    }
  }
  return channels
}

/** Canaux enregistrés par les modules IPC et par la passerelle BD. */
function registeredChannels(): Set<string> {
  const channels = new Set<string>()
  const handle: Handle = (channel) => {
    channels.add(channel)
  }
  const on: On = (channel) => {
    channels.add(channel)
  }
  // Aucun module ne touche son hôte à l'enregistrement : les gestionnaires
  // capturent le contexte, sans l'appeler.
  const host = {} as unknown as IpcHost

  registerAppIpc(host, handle, on)
  registerTabsIpc(host, handle, on)
  registerSpacesIpc(host, handle, on)
  registerNotesIpc(host, handle, on)
  registerLibraryIpc(host, handle, on)
  registerPrivacyIpc(host, handle, on)
  registerTunnelIpc(host, handle, on)
  registerAgentIpc(host, handle, on)

  const comic = new ComicBridge(
    {} as never,
    () => ({}) as never,
    () => null,
    () => true,
    async () => false
  )
  comic.registerIpc()
  for (const channel of electronChannels) channels.add(channel)

  return channels
}

describe('pont IPC — chaque canal a un gestionnaire', () => {
  it('n’oublie aucun canal invoke ni send du préchargement', () => {
    const registered = registeredChannels()
    const missing = [...bridgeChannels()].filter((channel) => !registered.has(channel)).sort()
    expect(missing).toEqual([])
  })

  it('ne laisse aucun canal mort : le pont appelle chacun d’eux', () => {
    const registered = registeredChannels()
    const dead = [...registered].filter((channel) => !bridgeChannels().has(channel)).sort()
    expect(dead, 'Canal enregistré mais jamais appelé : à supprimer.').toEqual([])
  })

  it('lit bien les canaux du pont — le test ne passe pas à vide', () => {
    expect(bridgeChannels().size).toBeGreaterThan(50)
  })
})
