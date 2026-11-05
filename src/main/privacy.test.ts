import { describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({
  pageUrl: { current: 'https://news.example/article' }
}))

vi.mock('electron', () => ({
  session: { fromPartition: vi.fn() },
  webContents: { fromId: () => ({ getURL: () => electron.pageUrl.current }) }
}))

import { attachPrivacy } from './privacy'

interface Details {
  url: string
  resourceType: string
  webContentsId: number
}

/**
 * Faux session : `attachPrivacy` ne garde que son écouteur de requêtes. Les
 * compteurs de Réglages › Confidentialité sont alimentés par ce rappel
 * `onBlocked` ; le test vérifie qu’ils continuent de monter.
 */
function harness(level: 'trackers' | 'strict' = 'trackers', exempt = false) {
  let listener:
    | ((details: Details, callback: (response: { cancel?: boolean }) => void) => void)
    | null = null
  const ses = {
    webRequest: {
      onBeforeRequest: (
        _filter: unknown,
        callback: (details: Details, done: (response: { cancel?: boolean }) => void) => void
      ) => {
        listener = callback
      }
    },
    setPermissionRequestHandler: () => undefined,
    setPermissionCheckHandler: () => undefined
  }
  let blocked = 0
  const hosts: string[] = []
  attachPrivacy(
    ses as never,
    () => true,
    (_id, host) => {
      blocked += 1
      hosts.push(host)
    },
    () => exempt,
    () => level
  )
  const request = (url: string): Promise<{ cancel?: boolean }> =>
    new Promise((resolve) => {
      if (!listener) throw new Error('écouteur non posé')
      listener({ url, resourceType: 'image', webContentsId: 42 }, resolve)
    })
  return { request, counters: () => ({ blocked, hosts }) }
}

describe('compteurs de confidentialité', () => {
  it('augmente à chaque requête de traqueur bloquée', async () => {
    const { request, counters } = harness()
    expect(counters().blocked).toBe(0)
    await expect(request('https://www.google-analytics.com/analytics.js')).resolves.toEqual({
      cancel: true
    })
    expect(counters()).toEqual({ blocked: 1, hosts: ['www.google-analytics.com'] })
    await request('https://www.google-analytics.com/collect?v=1')
    expect(counters().blocked).toBe(2)
    expect(counters().hosts).toHaveLength(2)
  })

  it('ne compte pas une ressource de première partie en mode traqueurs', async () => {
    const { request, counters } = harness()
    await expect(request('https://news.example/style.css')).resolves.toEqual({})
    expect(counters().blocked).toBe(0)
  })

  it('ne compte rien quand le site est exempté ou le blocage coupé', async () => {
    const exempt = harness('trackers', true)
    await exempt.request('https://www.google-analytics.com/analytics.js')
    expect(exempt.counters().blocked).toBe(0)

    let listener: ((details: Details, done: (response: { cancel?: boolean }) => void) => void) | null =
      null
    attachPrivacy(
      {
        webRequest: {
          onBeforeRequest: (
            _filter: unknown,
            callback: (details: Details, done: (response: { cancel?: boolean }) => void) => void
          ) => {
            listener = callback
          }
        },
        setPermissionRequestHandler: () => undefined,
        setPermissionCheckHandler: () => undefined
      } as never,
      () => false,
      () => {
        throw new Error('aucun compteur ne doit bouger')
      }
    )
    const response = await new Promise<{ cancel?: boolean }>((resolve) => {
      if (!listener) throw new Error('écouteur non posé')
      listener({ url: 'https://www.google-analytics.com/analytics.js', resourceType: 'image', webContentsId: 42 }, resolve)
    })
    expect(response).toEqual({})
  })
})
