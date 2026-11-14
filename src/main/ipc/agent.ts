/**
 * Agent, et rapports enregistrés dans l'atelier.
 *
 * `agent:run` garde une charge libre : `host.runAgent` est le seul à connaître
 * la forme d'une demande d'agent (modèle, outils, contexte) et la valide.
 */
import { Any, Text, bindContracts, field, listen, request, shape } from './contract'
import type { IpcHost } from './host'
import type { Handle, On } from './types'

const Rename = shape<{ id: string; title: string }>({ id: Text, title: Text })

const Archive = shape<{ id: string; archived: boolean }>({
  id: Text,
  archived: field<boolean>('archivé', (value) => Boolean(value))
})

export function registerAgentIpc(host: IpcHost, handle: Handle, on: On): void {
  bindContracts(
    [
      request('agent:run', Any, (input) => host.runAgent(input)),

      listen('agent:cancel', Text, (runId) => {
        host.agent.cancel(runId || undefined)
      }),

      request('works:get', Text, (id) => {
        if (!id) return null
        return host.store.get().works.find((work) => work.id === id) ?? null
      }),

      request('work:rename', Rename, ({ id, title }) => {
        const clean = title.trim().slice(0, 160)
        if (!id || !clean) throw new Error('Titre de travail vide.')
        host.store.update((state) => {
          const work = state.works.find((item) => item.id === id)
          if (work) {
            work.title = clean
            work.updatedAt = Date.now()
          }
        })
        host.broadcast()
      }),

      request('work:archive', Archive, ({ id, archived }) => {
        if (!id) return
        host.store.update((state) => {
          const work = state.works.find((item) => item.id === id)
          if (work) {
            work.archived = archived
            work.updatedAt = Date.now()
          }
        })
        host.broadcast()
      })
    ],
    handle,
    on
  )
}
