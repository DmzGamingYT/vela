import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import { describe, expect, it } from 'vitest'
import { Any, Id, bindContracts, listen, optional, request, shape } from './contract'

type Handler = (payload: unknown, event?: IpcMainInvokeEvent) => unknown
type Listener = (event: IpcMainEvent, payload: unknown) => void

/** Même forme que `Handle` / `On`, sans Electron : on capte les liaisons. */
function rail(): {
  handlers: Map<string, Handler>
  listeners: Map<string, Listener>
  handle: (channel: string, handler: Handler) => void
  on: (channel: string, listener: Listener) => void
} {
  const handlers = new Map<string, Handler>()
  const listeners = new Map<string, Listener>()
  return {
    handlers,
    listeners,
    handle: (channel, handler) => {
      handlers.set(channel, handler)
    },
    on: (channel, listener) => {
      listeners.set(channel, listener)
    }
  }
}

describe('contrats IPC', () => {
  it('lie le canal et transmet la charge validée', () => {
    const seen: string[] = []
    const r = rail()
    bindContracts(
      [
        request('tab:close', Id, (id) => {
          seen.push(id)
          return true
        })
      ],
      r.handle,
      r.on
    )
    const handler = r.handlers.get('tab:close')
    expect(handler?.('onglet-1')).toBe(true)
    expect(seen).toEqual(['onglet-1'])
  })

  it('ignore une charge invalide au lieu de lever', () => {
    let calls = 0
    const r = rail()
    bindContracts(
      [
        request('tab:close', Id, () => {
          calls += 1
        })
      ],
      r.handle,
      r.on
    )
    const handler = r.handlers.get('tab:close')
    expect(() => handler?.('')).not.toThrow()
    expect(() => handler?.(undefined)).not.toThrow()
    expect(handler?.('')).toBeUndefined()
    expect(calls).toBe(0)
  })

  it('ne recopie que les clés du contrat', () => {
    const seen: unknown[] = []
    const r = rail()
    bindContracts(
      [
        request('tab:create', shape<{ id?: string }>({ id: optional(Id) }), (input) => {
          seen.push(input)
          return null
        })
      ],
      r.handle,
      r.on
    )
    const handler = r.handlers.get('tab:create')
    handler?.({ id: 'a', intrus: true })
    handler?.({})
    expect(seen).toEqual([{ id: 'a' }, {}])
  })

  it('transmet l’émetteur aux canaux d’événement', () => {
    const seen: number[] = []
    const r = rail()
    bindContracts(
      [
        listen('page:scroll', Any, (_input, event) => {
          seen.push(event.sender.id)
        })
      ],
      r.handle,
      r.on
    )
    // Épreuve : seul l'identifiant de l'émetteur est lu par ce canal.
    const event = { sender: { id: 7 } } as unknown as IpcMainEvent
    r.listeners.get('page:scroll')?.(event, 'down')
    expect(seen).toEqual([7])
  })
})
