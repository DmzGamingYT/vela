import type { IpcHost } from './host'
import type { Handle, On } from './types'

/** Agent, et rapports enregistrés dans l'atelier. */
export function registerAgentIpc(host: IpcHost, handle: Handle, on: On): void {
  handle('agent:run', (payload) => host.runAgent(payload))

  on('agent:cancel', (_event, runId) => {
    host.agent.cancel(typeof runId === 'string' ? runId : undefined)
  })

  handle('works:get', (payload) => {
    const id = typeof payload === 'string' ? payload : ''
    return host.store.get().works.find((work) => work.id === id) ?? null
  })
  handle('work:rename', (payload) => {
    const input = (payload ?? {}) as { id?: unknown; title?: unknown }
    const id = typeof input.id === 'string' ? input.id : ''
    const title = typeof input.title === 'string' ? input.title.trim().slice(0, 160) : ''
    if (!id || !title) throw new Error('Titre de travail vide.')
    host.store.update((state) => {
      const work = state.works.find((item) => item.id === id)
      if (work) {
        work.title = title
        work.updatedAt = Date.now()
      }
    })
    host.broadcast()
  })
  handle('work:archive', (payload) => {
    const input = (payload ?? {}) as { id?: unknown; archived?: unknown }
    const id = typeof input.id === 'string' ? input.id : ''
    if (!id) return
    host.store.update((state) => {
      const work = state.works.find((item) => item.id === id)
      if (work) {
        work.archived = Boolean(input.archived)
        work.updatedAt = Date.now()
      }
    })
    host.broadcast()
  })
}
