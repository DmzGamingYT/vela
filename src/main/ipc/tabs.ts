/**
 * Onglets, dossiers d'onglets et disposition des volets.
 *
 * Lot 1 du pont IPC : chaque canal est déclaré une fois (forme + action), et le
 * handler reçoit une charge déjà validée. Plus aucun `as { id?: unknown }` ici :
 * la forme est dans le contrat, la politique d'émetteur reste dans
 * `ipcPolicy.ts`, et le transport est branché par `bindContracts`.
 */
import type { CreateTabInput } from '@shared/api'
import type { LayoutRequest, PaneSnapshot } from '@shared/types'
import {
  Any,
  Id,
  None,
  Num,
  Text,
  bindContracts,
  field,
  flag,
  listen,
  optional,
  record,
  request,
  shape
} from './contract'
import type { IpcHost } from './host'
import type { Handle, On } from './types'
import { isPane } from './util'

/** `{ id }` : la forme la plus fréquente du domaine. */
const Target = shape<{ id: string }>({ id: Id })

/** Tout est facultatif : la création d'onglet a des valeurs par défaut. */
const CreateTab = shape<CreateTabInput>({
  spaceId: optional(Text),
  url: optional(Text),
  activate: optional(flag()),
  pinned: optional(flag()),
  groupId: optional(Text)
})

/** Adresse ou texte non vide, comme l'ancien `asId`. */
const Navigate = shape<{ id: string; input: string }>({ id: Id, input: Id })

const Mute = shape<{ id: string; muted: boolean }>({ id: Id, muted: flag() })

const Find = shape<{ id: string; query: string; forward: boolean }>({
  id: Id,
  // La recherche exigeait une chaîne non vide (`asId`) : on garde la règle.
  query: Id,
  forward: flag(true)
})

const FindStop = shape<{ id: string; action: 'clearSelection' | 'keepSelection' }>({
  id: Id,
  action: field<'clearSelection' | 'keepSelection'>('suite', (value) =>
    value === 'keepSelection' ? 'keepSelection' : 'clearSelection'
  )
})

const GoTo = shape<{ id: string; index: number }>({ id: Id, index: Num })

const Zoom = shape<{ id: string; direction: 'in' | 'out' | 'reset' }>({
  id: Id,
  direction: field<'in' | 'out' | 'reset'>('sens', (value) =>
    value === 'in' || value === 'out' ? value : 'reset'
  )
})

/**
 * Mise en page : les volets invalides sont écartés, jamais transmis tels quels.
 * `splitFits` absent signifie « cet appel ne mesure rien » — la clé disparaît
 * alors du résultat, ce que `TabManager.layout` distingue d'un `false`.
 */
const Layout = field<LayoutRequest>('mise en page', (value) => {
  const source = record(value)
  const panes = Array.isArray(source.panes) ? source.panes.filter(isPane).slice(0, 4) : []
  const overlay = source.overlay === true
  const splitFits = source.splitFits
  return { panes, overlay, ...(typeof splitFits === 'boolean' ? { splitFits } : {}) }
})

/** Deux onglets au plus : les épreuves ne servent qu'à la vue scindée. */
const TabIds = field<string[]>('identifiants d’onglet', (value) =>
  Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string').slice(0, 2)
    : []
)

export function registerTabsIpc(host: IpcHost, handle: Handle, on: On): void {
  bindContracts(
    [
      // — Cycle de vie —
      request('tab:create', CreateTab, (input) => host.createTab(input)),
      request('tab:close', Target, ({ id }) => host.closeTab(id)),
      request('tab:activate', Target, ({ id }) => host.activateTab(id)),
      request('tab:pin', Any, (input) => host.pinTab(input)),
      request('tab:mute', Mute, ({ id, muted }) => host.tabs.setMuted(id, muted)),
      request('tab:reopen', None, () => host.reopenTab()),
      request('tab:focus', Target, ({ id }) => host.tabs.focus(id)),
      request('tab:discard', Target, ({ id }) => {
        host.tabs.suspend(id)
        host.broadcast()
      }),
      request('tab:reorder', Any, (input) => host.reorderTab(input)),

      // — Navigation —
      request('tab:navigate', Navigate, ({ id, input }) => host.tabs.navigate(id, input)),
      request('tab:home', Target, ({ id }) => host.tabs.goHome(id)),
      request('tab:back', Target, ({ id }) => host.tabs.back(id)),
      request('tab:forward', Target, ({ id }) => host.tabs.forward(id)),
      request('tab:entries', Target, ({ id }) => host.tabs.entries(id)),
      request('tab:goto', GoTo, ({ id, index }) => host.tabs.goto(id, index)),
      request('tab:reload', Target, ({ id }) => host.tabs.reload(id)),
      request('tab:stop', Target, ({ id }) => host.tabs.stop(id)),
      request('tab:zoom', Zoom, ({ id, direction }) => host.tabs.zoom(id, direction)),
      request('tab:find', Find, ({ id, query, forward }) => host.tabs.find(id, query, forward)),
      request('tab:find-stop', FindStop, ({ id, action }) => host.tabs.findStop(id, action)),
      request('tab:selection', Target, ({ id }) => host.tabs.selection(id)),
      request('tab:print', Target, ({ id }) => host.tabs.print(id)),

      // — Vue scindée —
      request('tab:split-toggle', None, () => host.toggleSplit()),
      request('tab:split-set', Target, ({ id }) => host.setSplitTab(id)),
      request('tab:split-ratio', Num, (ratio) => {
        host.store.update((state) => {
          state.splitRatio = Math.min(0.75, Math.max(0.25, ratio))
        })
        host.broadcast()
      }),

      // — Dossiers d'onglets —
      request('group:create', Any, (input) => host.createGroup(input)),
      request('group:update', Any, (input) => host.updateGroup(input)),
      request('group:remove', Target, ({ id }) => host.removeGroup(id)),

      // — Événements (sans réponse) —
      listen('views:layout', Layout, (input) => {
        // Un tiroir ouvert à droite retire de la place sans redimensionner la
        // fenêtre : seule la coque peut le savoir. Les appels qui ne mesurent
        // rien laissent la suspension telle quelle.
        if (typeof input.splitFits === 'boolean') host.setSplitPanesFit(input.splitFits)
        host.setOverlay(input.overlay)
        host.tabs.layout(input)
      }),

      // Défilement d'une page : un mot, rien d'autre. Chaque onglet prévient
      // pour lui-même, la coque ne sait que « on descend » ou « on remonte ».
      listen('page:scroll', Any, (input, event) => {
        host.tabs.noteScroll(event.sender.id, input === 'down' ? 'down' : 'up')
      }),

      // Épreuves des volets pour le glissement du séparateur. Demandé avant que
      // les vues natives ne quittent la scène : une fois cachées, une capture
      // n'aurait plus de trame à rendre.
      request('views:snapshot', TabIds, async (ids) => {
        // Les deux captures partent ensemble : en séquence, l'épreuve arrivait
        // après la fin d'un glissement court.
        const shots = await Promise.all(
          ids.map(async (tabId): Promise<PaneSnapshot | null> => {
            const contents = host.tabs.captureSource(tabId)
            if (!contents) return null
            try {
              const image = await Promise.race([
                contents.capturePage(),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 240))
              ])
              if (!image || image.isEmpty()) return null
              const size = image.getSize()
              const trimmed =
                size.width > 720 ? image.resize({ width: 720, quality: 'good' }) : image
              return {
                tabId,
                image: `data:image/jpeg;base64,${trimmed.toJPEG(66).toString('base64')}`
              }
            } catch {
              /* une capture ratée laisse le volet sans épreuve */
              return null
            }
          })
        )
        return shots.filter((shot): shot is PaneSnapshot => shot !== null)
      })
    ],
    handle,
    on
  )
}
