import { create } from 'zustand'
import type { TunnelEvent } from '@shared/api'
import { useBrowser } from './browser'
import {
  DEFAULT_FILTERS,
  addCard as buildCard,
  removeCard,
  toggleLink as buildLink,
  buildTunnelHtml,
  buildTunnelReport,
  exportFileName,
  filterMap,
  toJsonExport,
  toOpmlExport,
  tunnelMapTitle,
  TUNNEL_MAP_LIMIT,
  type MapNode,
  type MapNodeKind,
  type NodeStatus,
  type SourceType,
  type TunnelFilters,
  type TunnelMap,
  type TunnelMapSummary
} from '@shared/tunnel'

export type TunnelLevel = 1 | 2 | 3 | 4

interface TunnelState {
  active: TunnelMap | null
  maps: TunnelMapSummary[]
  query: string
  running: boolean
  runId: string | null
  phase: string
  suggested: string | null
  error: string | null
  filters: TunnelFilters
  level: TunnelLevel
  viewMode: 'map' | 'list'
  selectedId: string | null
  checkedIds: string[]
  hoverId: string | null
  projectsOpen: boolean
  filtersOpen: boolean
  exportOpen: boolean
  subscribed: boolean

  subscribe(): void
  runTunnel(query: string, options?: { parentId?: string }): Promise<void>
  cancel(): void
  loadMap(id: string): Promise<void>
  refreshMaps(): Promise<void>
  removeMap(id: string): Promise<void>
  duplicateMap(id: string): Promise<void>
  renameMap(id: string, title: string): Promise<void>
  newCard(): void
  setQuery(query: string): void
  setFilters(patch: Partial<TunnelFilters>): void
  toggleType(type: SourceType): void
  toggleTag(tag: string): void
  resetFilters(): void
  setLevel(level: TunnelLevel): void
  setViewMode(mode: 'map' | 'list'): void
  select(id: string | null, options?: { toggle?: boolean }): void
  setHover(id: string | null): void
  setProjectsOpen(open: boolean): void
  setFiltersOpen(open: boolean): void
  setExportOpen(open: boolean): void
  setStatus(id: string, status: NodeStatus): Promise<void>
  renameNode(id: string, title: string): Promise<void>
  /** Ajoute une carte sous le nœud choisi (ou le sujet). */
  addCard(parentId?: string | null, input?: { title?: string; kind?: MapNodeKind }): Promise<void>
  /** Supprime une carte et sa descendance. */
  removeNode(id: string): Promise<void>
  /** Relie ou délie deux cartes. */
  toggleLink(aId: string, bId: string): Promise<void>
  /** Place un nœud à la main sur la carte (coordonnées du plan). */
  moveNode(id: string, x: number, y: number): Promise<void>
  addReportToNotes(ids?: string[]): Promise<void>
  exportMarkdown(): Promise<void>
  exportJson(): Promise<void>
  exportOpml(): Promise<void>
  exportSvg(svg: SVGSVGElement | null): Promise<void>
  exportPdf(): Promise<void>
  exportPng(svg: SVGSVGElement | null): Promise<void>
  visible(): { visible: Set<string>; hiddenSites: number }
  selected(): MapNode | null
}

const currentSpace = (): string => useBrowser.getState().view?.activeSpaceId ?? ''

let unsubscribe: (() => void) | null = null

/**
 * SVG autonome : la carte n'a pas de feuille de style à elle, ses classes
 * vivent dans l'app. On recopie les règles `.tunnel-*` et les variables pour
 * que le fichier s'ouvre ailleurs avec le même rendu.
 */
function svgDocument(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(Math.round(svg.clientWidth || 1200)))
  clone.setAttribute('height', String(Math.round(svg.clientHeight || 800)))
  const styles: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        const text = rule.cssText
        if (text.includes('.tunnel-') || text.includes(':root')) styles.push(text)
      }
    } catch {
      /* feuille distante ou protégée */
    }
  }
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  style.textContent = styles.join('\n')
  clone.insertBefore(style, clone.firstChild)
  const paper = getComputedStyle(document.documentElement).getPropertyValue('--paper') || '#faf8f5'
  const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  background.setAttribute('x', '0')
  background.setAttribute('y', '0')
  background.setAttribute('width', '100%')
  background.setAttribute('height', '100%')
  background.setAttribute('fill', paper.trim())
  clone.insertBefore(background, style.nextSibling)
  return new XMLSerializer().serializeToString(clone)
}

function download(text: string, filename: string, mime: string): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export const useTunnel = create<TunnelState>((set, get) => ({
  active: null,
  maps: [],
  query: '',
  running: false,
  runId: null,
  phase: '',
  suggested: null,
  error: null,
  filters: { ...DEFAULT_FILTERS },
  level: 4,
  viewMode: 'map',
  selectedId: null,
  checkedIds: [],
  hoverId: null,
  projectsOpen: false,
  filtersOpen: false,
  exportOpen: false,
  subscribed: false,

  subscribe() {
    if (get().subscribed) return
    set({ subscribed: true })
    unsubscribe = window.vela.tunnel.onEvent((event: TunnelEvent) => {
      const state = get()
      if (event.type === 'start') {
        const spaceId = currentSpace()
        set({
          running: true,
          runId: event.runId,
          error: null,
          phase: 'Ouverture du tunnel…',
          suggested: event.suggestedQuery,
          query: event.query,
          selectedId: null,
          checkedIds: [],
          active: state.active && state.active.id === event.mapId
            ? state.active
            : {
                id: event.mapId,
                spaceId,
                query: event.query,
                lang: 'fr',
                nodes: [],
                createdAt: Date.now(),
                updatedAt: Date.now()
              }
        })
        return
      }
      if (event.type === 'node') {
        const active = get().active
        if (!active) return
        if (active.nodes.some((node) => node.id === event.node.id)) return
        set({
          active: { ...active, nodes: [...active.nodes, event.node], updatedAt: Date.now() },
          phase: ''
        })
        return
      }
      if (event.type === 'phase') {
        set({ phase: event.message })
        return
      }
      if (event.type === 'done') {
        set({ running: false, runId: null, phase: '' })
        // Une carte non enregistrée doit se dire : elle vit encore à l’écran,
        // mais elle disparaîtra au prochain lancement.
        if (!event.saved) {
          notify(
            `Tunnel terminé, carte non enregistrée : ${TUNNEL_MAP_LIMIT} cartes au maximum. Supprimez-en une, puis relancez.`,
            'error'
          )
        }
        void get().refreshMaps()
        return
      }
      if (event.type === 'error') {
        set({ running: false, runId: null, phase: '', error: event.message })
      }
    })
  },

  async runTunnel(query, options) {
    get().subscribe()
    const trimmed = query.trim()
    if (!trimmed) {
      set({ error: 'Décrivez un sujet pour lancer le tunnel.' })
      return
    }
    const active = get().active
    const parentId = options?.parentId
    const sameMap = Boolean(parentId && active)
    if (!sameMap) {
      set({ active: null, selectedId: null, checkedIds: [], error: null })
    }
    set({ running: true, query: trimmed, error: null, phase: 'Préparation…', suggested: null })
    try {
      const { runId } = await window.vela.tunnel.run({
        query: trimmed,
        parentId,
        spaceId: currentSpace(),
        mapId: sameMap ? active?.id : undefined
      })
      set({ runId })
    } catch (error) {
      set({
        running: false,
        runId: null,
        error: error instanceof Error ? error.message : 'Lancement impossible.'
      })
    }
  },

  cancel() {
    const runId = get().runId
    if (runId) window.vela.tunnel.cancel(runId)
    set({ running: false, runId: null, phase: '' })
  },

  async loadMap(id) {
    const map = await window.vela.tunnel.load(id)
    if (!map) return
    set({
      active: map,
      query: map.query,
      selectedId: null,
      checkedIds: [],
      projectsOpen: false,
      error: null,
      viewMode: 'map',
      running: false,
      phase: ''
    })
  },

  async refreshMaps() {
    try {
      set({ maps: await window.vela.tunnel.maps() })
    } catch {
      /* liste indisponible : on garde la précédente */
    }
  },

  async removeMap(id) {
    await window.vela.tunnel.remove(id)
    set((state) => ({
      maps: state.maps.filter((map) => map.id !== id),
      active: state.active?.id === id ? null : state.active
    }))
  },

  async duplicateMap(id) {
    const copy = await window.vela.tunnel.duplicate(id)
    await get().refreshMaps()
    if (!copy) {
      notify(`Copie impossible : ${TUNNEL_MAP_LIMIT} cartes au maximum. Supprimez-en une.`, 'error')
      return
    }
    set({ active: copy, query: copy.query, projectsOpen: false, selectedId: null })
  },

  async renameMap(id, title) {
    await window.vela.tunnel.rename({ id, title })
    set((state) => ({
      maps: state.maps.map((map) => (map.id === id ? { ...map, title } : map)),
      active: state.active?.id === id ? { ...state.active, title } : state.active
    }))
  },

  newCard() {
    set({
      active: null,
      query: '',
      error: null,
      suggested: null,
      selectedId: null,
      checkedIds: [],
      running: false,
      phase: '',
      viewMode: 'map',
      projectsOpen: false
    })
    setTimeout(() => {
      document.querySelector<HTMLInputElement>('.tunnel-search input')?.focus()
    }, 30)
  },

  setQuery(query) {
    set({ query })
  },

  setFilters(patch) {
    set((state) => ({ filters: { ...state.filters, ...patch } }))
  },

  toggleType(type) {
    set((state) => {
      const types = state.filters.sourceTypes.includes(type)
        ? state.filters.sourceTypes.filter((entry) => entry !== type)
        : [...state.filters.sourceTypes, type]
      return { filters: { ...state.filters, sourceTypes: types } }
    })
  },

  toggleTag(tag) {
    set((state) => ({
      filters: {
        ...state.filters,
        tags: state.filters.tags.includes(tag)
          ? state.filters.tags.filter((entry) => entry !== tag)
          : [...state.filters.tags, tag]
      }
    }))
  },

  resetFilters() {
    set({ filters: { ...DEFAULT_FILTERS } })
  },

  setLevel(level) {
    set({ level })
  },

  setViewMode(viewMode) {
    set({ viewMode })
  },

  select(id, options) {
    if (!id) {
      set({ selectedId: null })
      return
    }
    if (options?.toggle) {
      set((state) => ({
        checkedIds: state.checkedIds.includes(id)
          ? state.checkedIds.filter((entry) => entry !== id)
          : [...state.checkedIds, id]
      }))
      return
    }
    set({ selectedId: id })
  },

  setHover(id) {
    set({ hoverId: id })
  },

  setProjectsOpen(projectsOpen) {
    set({ projectsOpen, filtersOpen: projectsOpen ? false : get().filtersOpen })
  },

  setFiltersOpen(filtersOpen) {
    set({ filtersOpen, projectsOpen: filtersOpen ? false : get().projectsOpen })
  },

  setExportOpen(exportOpen) {
    set({ exportOpen })
  },

  async setStatus(id, status) {
    const active = get().active
    if (!active) return
    const next: TunnelMap = {
      ...active,
      updatedAt: Date.now(),
      nodes: active.nodes.map((node) => (node.id === id ? { ...node, status } : node))
    }
    set({ active: next })
    await persist(next)
  },

  async renameNode(id, title) {
    const active = get().active
    if (!active) return
    const clean = title.trim()
    if (!clean) return
    const next: TunnelMap = {
      ...active,
      updatedAt: Date.now(),
      nodes: active.nodes.map((node) => (node.id === id ? { ...node, title: clean } : node))
    }
    set({ active: next })
    await persist(next)
  },

  async addCard(parentId, input) {
    const active = get().active
    if (!active) return
    const subject = active.nodes.find((entry) => entry.kind === 'subject')
    const parent = parentId ?? get().selectedId ?? subject?.id ?? null
    const next = buildCard(active, parent, {
      title: input?.title ?? 'Nouvelle carte',
      kind: input?.kind
    })
    const created = next.nodes[next.nodes.length - 1] ?? null
    set({ active: next, selectedId: created?.id ?? null, viewMode: 'map' })
    await persist(next)
  },

  async removeNode(id) {
    const active = get().active
    if (!active) return
    const node = active.nodes.find((entry) => entry.id === id)
    if (!node) return
    if (node.kind === 'subject') {
      notify('Le sujet ne peut pas être supprimé.', 'error')
      return
    }
    const next = removeCard(active, id)
    set({
      active: next,
      selectedId: get().selectedId === id ? null : get().selectedId,
      checkedIds: get().checkedIds.filter((entry) => entry !== id)
    })
    await persist(next)
    notify('Carte supprimée.')
  },

  async toggleLink(aId, bId) {
    const active = get().active
    if (!active) return
    const next = buildLink(active, aId, bId)
    set({ active: next })
    await persist(next)
  },

  async moveNode(id, x, y) {
    const active = get().active
    if (!active) return
    const next: TunnelMap = {
      ...active,
      updatedAt: Date.now(),
      nodes: active.nodes.map((node) =>
        node.id === id ? { ...node, x: Math.round(x), y: Math.round(y) } : node
      )
    }
    set({ active: next })
    await persist(next)
  },

  async addReportToNotes(ids) {
    const { active } = get()
    if (!active) return
    const { visible } = get().visible()
    const scope = ids && ids.length > 0 ? new Set(ids) : visible
    const body = buildTunnelReport(active, scope)
    const firstSource = active.nodes.find((node) => node.kind === 'site' && node.url)
    try {
      await window.vela.notes.save({
        title: `Tunnel — ${tunnelMapTitle(active)}`.slice(0, 160),
        body,
        spaceId: active.spaceId || currentSpace(),
        url: firstSource?.url
      })
      notify('Rapport enregistré dans les notes.')
    } catch {
      notify('Rapport non enregistré.', 'error')
    }
  },

  async exportMarkdown() {
    const { active } = get()
    if (!active) return
    const { visible } = get().visible()
    download(buildTunnelReport(active, visible), exportFileName(active.query, 'md'), 'text/markdown')
    notify('Carte exportée en Markdown.')
  },

  async exportJson() {
    const { active } = get()
    if (!active) return
    download(toJsonExport(active), exportFileName(active.query, 'json'), 'application/json')
    notify('Carte exportée en JSON.')
  },

  async exportOpml() {
    const { active } = get()
    if (!active) return
    download(toOpmlExport(active), exportFileName(active.query, 'opml'), 'text/x-opml')
    notify('Carte exportée en OPML.')
  },

  async exportSvg(svg) {
    const { active } = get()
    if (!active || !svg) return
    try {
      download(svgDocument(svg), exportFileName(active.query, 'svg'), 'image/svg+xml')
      notify('Carte exportée en SVG.')
    } catch {
      notify('Export SVG impossible.', 'error')
    }
  },

  async exportPdf() {
    const { active } = get()
    if (!active) return
    const { visible } = get().visible()
    const ok = await window.vela.tunnel.exportPdf({
      html: buildTunnelHtml(active, visible),
      name: exportFileName(active.query, 'pdf')
    })
    notify(ok ? 'PDF enregistré.' : 'PDF non enregistré.', ok ? 'info' : 'error')
  },

  async exportPng(svg) {
    const { active } = get()
    if (!active || !svg) return
    try {
      const clone = svg.cloneNode(true) as SVGSVGElement
      const bounds = svg.viewBox.baseVal
      const width = Math.max(400, Math.ceil(bounds.width))
      const height = Math.max(300, Math.ceil(bounds.height))
      clone.setAttribute('width', String(width))
      clone.setAttribute('height', String(height))
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      background.setAttribute('width', '100%')
      background.setAttribute('height', '100%')
      background.setAttribute('fill', getComputedStyle(document.documentElement).getPropertyValue('--paper') || '#faf8f5')
      background.setAttribute('x', '0')
      background.setAttribute('y', '0')
      clone.insertBefore(background, clone.firstChild)
      const data = new XMLSerializer().serializeToString(clone)
      const image = new Image()
      const loaded = new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('image'))
      })
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data)}`
      await loaded
      const canvas = document.createElement('canvas')
      const scale = 2
      canvas.width = width * scale
      canvas.height = height * scale
      const context = canvas.getContext('2d')
      if (!context) throw new Error('canvas')
      context.scale(scale, scale)
      context.drawImage(image, 0, 0)
      const saved = await window.vela.tunnel.savePng({
        dataUrl: canvas.toDataURL('image/png'),
        name: exportFileName(active.query, 'png')
      })
      notify(saved ? 'Image enregistrée.' : 'Image non enregistrée.', saved ? 'info' : 'error')
    } catch {
      notify('Export de l’image impossible.', 'error')
    }
  },

  visible() {
    const { active, filters } = get()
    if (!active) return { visible: new Set<string>(), hiddenSites: 0 }
    return filterMap(active.nodes, filters)
  },

  selected() {
    const { active, selectedId } = get()
    if (!active || !selectedId) return null
    return active.nodes.find((node) => node.id === selectedId) ?? null
  }
}))

function notify(text: string, tone: 'info' | 'error' = 'info'): void {
  useBrowser.getState().toast(text, tone)
}

/**
 * Enregistre la carte active. Un refus (plafond atteint) reste visible à
 * l'écran mais ne doit pas passer pour une réussite.
 */
async function persist(map: TunnelMap): Promise<boolean> {
  try {
    const result = await window.vela.tunnel.save(map)
    if (result?.ok === false) {
      notify(
        `Carte non enregistrée : ${TUNNEL_MAP_LIMIT} cartes au maximum. Supprimez-en une pour garder celle-ci.`,
        'error'
      )
      return false
    }
    return true
  } catch {
    notify('Carte non enregistrée : le disque n’a pas répondu.', 'error')
    return false
  }
}

export { unsubscribe }
