import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  NODE_LABELS,
  SOURCE_TYPES,
  filterMap,
  layoutMap,
  type MapNode,
  type MapNodeKind
} from '@shared/tunnel'
import { useBrowser } from '../store/browser'
import { useTunnel } from '../store/tunnel'
import { Icon, type IconName } from './Icon'
import TunnelBackdrop from './TunnelBackdrop'

const NODE_WIDTH = 230
const NODE_HEIGHT = 74
const COLUMN_WIDTH = 276
const ROW_GAP = 8

const KIND_ICON: Record<MapNodeKind, IconName> = {
  subject: 'sparkles',
  angle: 'map',
  subangle: 'chevron-right',
  detail: 'circle',
  concept: 'star',
  site: 'globe',
  tension: 'warning'
}

const SOURCE_LABEL = new Map(SOURCE_TYPES.map((type) => [type.id, type.label]))

interface Box {
  x: number
  y: number
  width: number
  height: number
  depth: number
}

/** Découpe en lignes courtes et borne chaque ligne : aucun texte ne dépasse. */
function wrapTitle(text: string, maxChars: number, maxLines: number): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  const lines: string[] = []
  let rest = clean
  while (rest && lines.length < maxLines) {
    if (rest.length <= maxChars) {
      lines.push(rest)
      rest = ''
      break
    }
    let cut = rest.lastIndexOf(' ', maxChars)
    if (cut < Math.floor(maxChars * 0.4)) cut = maxChars
    lines.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest && lines.length > 0) {
    const last = lines[lines.length - 1]
    lines[lines.length - 1] = `${last.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`
  }
  return lines
}

function shorten(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`
}

function shortDomain(node: MapNode): string {
  if (node.domain) return node.domain.replace(/^www\./, '')
  if (!node.url) return NODE_LABELS[node.kind]
  try {
    return new URL(node.url).hostname.replace(/^www\./, '')
  } catch {
    return NODE_LABELS[node.kind]
  }
}

function metaLabel(node: MapNode): string {
  if (node.kind === 'site') {
    const type = node.sourceType ? SOURCE_LABEL.get(node.sourceType) : null
    return type ? `${type} · ${shortDomain(node)}` : shortDomain(node)
  }
  if (node.kind === 'tension') return 'Contradiction entre sources'
  if (node.kind === 'concept') return 'Notion commune'
  if (node.kind === 'detail') return 'Point relevé'
  if (node.kind === 'subangle') return 'Précision'
  if (node.kind === 'angle') return 'Angle'
  return 'Sujet'
}

export default function TunnelMap({ svgRef }: { svgRef: React.MutableRefObject<SVGSVGElement | null> }) {
  const active = useTunnel((s) => s.active)
  const filters = useTunnel((s) => s.filters)
  const level = useTunnel((s) => s.level)
  const running = useTunnel((s) => s.running)
  const hoverId = useTunnel((s) => s.hoverId)
  const selectedId = useTunnel((s) => s.selectedId)
  const checkedIds = useTunnel((s) => s.checkedIds)
  const setHover = useTunnel((s) => s.setHover)
  const select = useTunnel((s) => s.select)
  const setStatus = useTunnel((s) => s.setStatus)
  const moveNode = useTunnel((s) => s.moveNode)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 900, height: 560 })
  const [zoom, setZoom] = useState(0.95)
  const [pan, setPan] = useState({ x: 24, y: 24 })
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const fitted = useRef<string>('')
  // Déplacement d'un nœud : aperçu local pendant le geste, écriture à la fin.
  const [nodeDrag, setNodeDrag] = useState<{ id: string; x: number; y: number } | null>(null)
  const nodeDragRef = useRef<{
    id: string
    startX: number
    startY: number
    originX: number
    originY: number
    moved: boolean
  } | null>(null)
  const suppressClick = useRef(0)

  const { visible, hiddenSites } = useMemo(
    () => filterMap(active?.nodes ?? [], filters),
    [active, filters]
  )

  const depths = useMemo(() => {
    const map = new Map<string, number>()
    if (!active) return map
    const byId = new Map(active.nodes.map((node) => [node.id, node]))
    const walk = (node: MapNode, guard = 0): number => {
      if (map.has(node.id)) return map.get(node.id) as number
      if (!node.parentId || guard > 12) {
        map.set(node.id, node.kind === 'tension' ? 1 : 0)
        return map.get(node.id) as number
      }
      const parent = byId.get(node.parentId)
      const depth = parent ? walk(parent, guard + 1) + 1 : 0
      map.set(node.id, depth)
      return depth
    }
    for (const node of active.nodes) walk(node)
    return map
  }, [active])

  const shown = useMemo(() => {
    if (!active) return [] as MapNode[]
    return active.nodes.filter((node) => {
      if (!visible.has(node.id)) return false
      // Une carte écrite à la main ne disparaît pas selon le niveau affiché :
      // elle vit sous la source où l’utilisateur l’a posée.
      if (node.manual) return true
      const depth = depths.get(node.id) ?? 0
      return depth < level
    })
  }, [active, visible, depths, level])

  const subject = active?.nodes.find((node) => node.kind === 'subject') ?? null

  const layoutNodes = useMemo(() => {
    const subjectId = subject?.id ?? null
    return shown.map((node) => {
      if ((node.kind === 'tension' || node.kind === 'concept') && !node.parentId && subjectId) {
        return { ...node, parentId: subjectId }
      }
      if (node.kind === 'tension' && subjectId && node.parentId === null) {
        return { ...node, parentId: subjectId }
      }
      return node
    })
  }, [shown, subject])

  /**
   * Concepts et tensions sont des satellites du sujet, pas des étages :
   * ils occupent une colonne à part, sinon la carte gagne une ligne par
   * satellite et le zoom initial devient illisible.
   */
  const layout = useMemo(() => {
    const subjectId = subject?.id ?? null
    const satelliteIds = new Set(
      layoutNodes
        .filter(
          (node) =>
            (node.kind === 'concept' || node.kind === 'tension') &&
            subjectId !== null &&
            node.parentId === subjectId
        )
        .map((node) => node.id)
    )
    const treeNodes = layoutNodes.filter((node) => !satelliteIds.has(node.id))
    const tree = layoutMap(treeNodes, {
      nodeWidth: NODE_WIDTH,
      nodeHeight: NODE_HEIGHT,
      columnWidth: COLUMN_WIDTH,
      rowGap: ROW_GAP
    })
    const satellites = layoutNodes.filter((node) => satelliteIds.has(node.id))
    const stacked = satellites.length * (NODE_HEIGHT + ROW_GAP) - ROW_GAP
    const result: Record<string, Box> = { ...tree.boxes }
    let y = Math.max(0, (tree.height - stacked) / 2)
    let width = tree.width
    for (const node of satellites) {
      result[node.id] = {
        x: tree.width + 40,
        y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        depth: 1
      }
      y += NODE_HEIGHT + ROW_GAP
      width = Math.max(width, tree.width + 40 + NODE_WIDTH)
    }
    // Une position choisie à la main prime sur la disposition automatique.
    for (const node of layoutNodes) {
      const box = result[node.id]
      if (box && typeof node.x === 'number' && typeof node.y === 'number') {
        result[node.id] = { ...box, x: node.x, y: node.y }
      }
    }
    const height = Math.max(tree.height, y > 0 ? y - ROW_GAP : 0)
    return { boxes: result, width: width || NODE_WIDTH, height: height || NODE_HEIGHT }
  }, [layoutNodes, subject])

  const boxes = useMemo(() => {
    const base = layout.boxes as Record<string, Box>
    if (!nodeDrag) return base
    const target = base[nodeDrag.id]
    if (!target) return base
    return { ...base, [nodeDrag.id]: { ...target, x: nodeDrag.x, y: nodeDrag.y } }
  }, [layout, nodeDrag])
  const byId = useMemo(() => new Map(layoutNodes.map((node) => [node.id, node])), [layoutNodes])

  // Estompage seulement pendant le survol : une sélection ne doit pas
  // laisser la carte à moitié transparente après un clic.
  const branch = useMemo(() => {
    const root = hoverId
    if (!root || !active) return null
    const set = new Set<string>([root])
    let current = byId.get(root)?.parentId ?? null
    let guard = 0
    while (current && guard < 16) {
      set.add(current)
      current = byId.get(current)?.parentId ?? null
      guard += 1
    }
    const stack = [root]
    while (stack.length > 0 && guard < 80) {
      const id = stack.pop() as string
      for (const node of layoutNodes) {
        if (node.parentId === id && !set.has(node.id)) {
          set.add(node.id)
          stack.push(node.id)
        }
      }
      guard += 1
    }
    for (const node of layoutNodes) {
      if (node.kind === 'tension' && (node.relatedIds ?? []).includes(root)) set.add(node.id)
      if (node.relatedIds?.includes(root)) set.add(node.id)
    }
    return set
  }, [hoverId, active, byId, layoutNodes])

  const fit = useCallback(() => {
    const element = containerRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    if (rect.width < 40 || rect.height < 40) return
    const next = Math.min(
      (rect.width - 64) / Math.max(1, layout.width),
      (rect.height - 108) / Math.max(1, layout.height),
      1.15
    )
    const clamped = Math.max(0.38, next)
    setZoom(Number(clamped.toFixed(3)))
    setPan({
      x: Math.max(24, (rect.width - layout.width * clamped) / 2),
      y: Math.max(24, 46 + (rect.height - 108 - layout.height * clamped) / 2)
    })
  }, [layout.width, layout.height])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!active) return
    const key = `${active.id}:${layoutNodes.length}:${level}`
    if (fitted.current === key) return
    fitted.current = key
    const timer = setTimeout(fit, 40)
    return () => clearTimeout(timer)
  }, [active, layoutNodes.length, level, fit])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const px = event.clientX - rect.left
      const py = event.clientY - rect.top
      const factor = Math.exp(-event.deltaY * 0.0016)
      setZoom((current) => {
        const next = Math.min(2.6, Math.max(0.34, current * factor))
        const ratio = next / current
        setPan((previous) => ({
          x: px - (px - previous.x) * ratio,
          y: py - (py - previous.y) * ratio
        }))
        return next
      })
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (event.metaKey || event.ctrlKey) return
      if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        setZoom((z) => Math.min(2.6, z * 1.14))
      } else if (event.key === '-') {
        event.preventDefault()
        setZoom((z) => Math.max(0.34, z / 1.14))
      } else if (event.key === '0') {
        event.preventDefault()
        fit()
      } else if (event.key === 'Escape') {
        select(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fit, select])

  const startPan = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    const target = event.target as Element
    if (target.closest('.tunnel-node')) return
    drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  const movePan = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!drag.current) return
    setPan({
      x: drag.current.panX + (event.clientX - drag.current.x),
      y: drag.current.panY + (event.clientY - drag.current.y)
    })
  }

  const endPan = (): void => {
    drag.current = null
  }

  const zoomBy = (factor: number): void => {
    const centerX = size.width / 2
    const centerY = size.height / 2
    setZoom((current) => {
      const next = Math.min(2.6, Math.max(0.38, current * factor))
      const ratio = next / current
      setPan((previous) => ({
        x: centerX - (centerX - previous.x) * ratio,
        y: centerY - (centerY - previous.y) * ratio
      }))
      return next
    })
  }

  const minimap = useMemo(() => {
    const width = 148
    const height = 96
    const scale = Math.min(width / Math.max(1, layout.width), height / Math.max(1, layout.height))
    return {
      width,
      height,
      scale,
      viewport: {
        x: -pan.x / zoom,
        y: -pan.y / zoom,
        width: size.width / zoom,
        height: size.height / zoom
      }
    }
  }, [layout.width, layout.height, pan, zoom, size])

  if (!active) return <div className="tunnel-canvas" />

  // Le texte garde une taille lisible à l’écran ; seuls les cadres rétrécissent.
  const fontUnit = 1 / Math.max(0.38, zoom)
  const titleSize = 13 * fontUnit
  const metaSize = 12.2 * fontUnit
  const excerptSize = 11.5 * fontUnit
  // Le titre commence après l’icône, dont l’échelle suit le zoom : la largeur
  // disponible doit être calculée dans la même unité que la police.
  const titleLeft = 8 * fontUnit + 21 * fontUnit
  const maxChars = Math.max(
    8,
    Math.floor((NODE_WIDTH - titleLeft - 8 * fontUnit) / (titleSize * 0.52))
  )
  // Zoom sémantique : loin = pastille avec le titre, moyen = carte complète,
  // proche = extrait. Deux lignes seulement si la hauteur écran le permet.
  const compact = zoom < 0.5
  const maxLines = zoom >= 0.55 ? 2 : 1
  // Le zoom sémantique remplace le badge par un extrait, sans jamais
  // superposer les deux dans une carte de 74 px.
  const showExcerpt = zoom >= 1.32

  return (
    <div className="tunnel-canvas" ref={containerRef}>
      <TunnelBackdrop />
      <div
        className="tunnel-stage"
        onPointerDown={startPan}
        onPointerMove={movePan}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        data-dragging={Boolean(drag.current)}
      >
        <svg
          ref={(element) => {
            svgRef.current = element
          }}
          className="tunnel-svg"
          width="100%"
          height="100%"
          role="group"
          aria-label="Carte mentale du tunnel de recherche"
        >
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            {layoutNodes.map((node) => {
              const box = boxes[node.id]
              if (!box) return null
              const tension = node.kind === 'tension'
              const satellite =
                (tension || node.kind === 'concept') && (node.relatedIds?.length ?? 0) > 0
              // Un satellite part de ses sources liées : l’arête reste courte
              // et visible, au lieu de traverser toutes les colonnes.
              const anchors = satellite
                ? (node.relatedIds ?? [])
                    .map((id) => boxes[id])
                    .filter((entry): entry is Box => Boolean(entry))
                : node.parentId && boxes[node.parentId]
                  ? [boxes[node.parentId]]
                  : []
              const dim = branch ? !branch.has(node.id) : false
              const label = satellite ? (tension ? 'contredit' : 'relie') : node.relation
              return anchors.map((parent, index) => {
                const startX = parent.x + parent.width
                const startY = parent.y + parent.height / 2
                const endX = box.x
                const endY = box.y + box.height / 2
                const midX = startX + Math.max(18, (endX - startX) / 2)
                return (
                  <g key={`edge-${node.id}-${index}`} className="tunnel-edge-group" data-dim={dim}>
                    <path
                      className="tunnel-edge"
                      data-tension={tension}
                      data-relation={satellite && !tension ? 'concept' : undefined}
                      d={`M${startX} ${startY} C${midX} ${startY} ${midX} ${endY} ${endX} ${endY}`}
                    />
                    {zoom > 0.62 &&
                      label &&
                      (tension ? index === 0 || branch?.has(node.id) : branch?.has(node.id)) && (
                      <text
                        className="tunnel-edge-label"
                        x={midX}
                        y={(startY + endY) / 2 - 5}
                        fontSize={9.5 * fontUnit}
                      >
                        {label}
                      </text>
                    )}
                  </g>
                )
              })
            })}

            {layoutNodes.map((node) => {
              if (!node.relatedIds?.length) return null
              const box = boxes[node.id]
              if (!box) return null
              const satellite =
                (node.kind === 'tension' || node.kind === 'concept') &&
                (node.relatedIds?.length ?? 0) > 0
              // Les tensions et concepts tirent déjà leurs arêtes de leurs
              // sources liées : on ne trace ici que les liens ajoutés à la main.
              if (satellite) return null
              const dim = branch ? !branch.has(node.id) : false
              return node.relatedIds.map((relatedId) => {
                const other = boxes[relatedId]
                const target = byId.get(relatedId)
                if (!other || !target) return null
                // Le lien est stocké des deux côtés : on ne le peint qu’une fois.
                if (node.id > relatedId) return null
                if (node.parentId === relatedId || target.parentId === node.id) return null
                const left = other.x <= box.x ? other : box
                const right = other.x <= box.x ? box : other
                const startX = left.x + left.width
                const startY = left.y + left.height / 2
                const endX = right.x
                const endY = right.y + right.height / 2
                const midX = startX + Math.max(18, (endX - startX) / 2)
                return (
                  <path
                    key={`link-${node.id}-${relatedId}`}
                    className="tunnel-edge tunnel-edge-link"
                    data-dim={dim}
                    d={`M${startX} ${startY} C${midX} ${startY} ${midX} ${endY} ${endX} ${endY}`}
                  />
                )
              })
            })}

            {layoutNodes.map((node) => {
              const box = boxes[node.id]
              if (!box) return null
              const dim = branch ? !branch.has(node.id) : false
              const titleLines = wrapTitle(node.title, maxChars, maxLines)
              const isSelected = selectedId === node.id
              const isChecked = checkedIds.includes(node.id)
              const padding = 8 * fontUnit
              const paddingY = 5 * fontUnit
              const metaY = box.height - paddingY - fontUnit * 0.9
              const titleTop = paddingY + titleSize * 0.95
              const metaText = shorten(
                metaLabel(node),
                Math.floor((NODE_WIDTH - 2 * padding) / (metaSize * 0.58))
              )
              const badgeWidth = Math.min(
                box.width - padding * 2,
                metaText.length * metaSize * 0.56 + 12 * fontUnit
              )
              return (
                <g
                  key={node.id}
                  className="tunnel-node"
                  data-kind={node.kind}
                  data-dim={dim}
                  data-selected={isSelected}
                  data-checked={isChecked}
                  data-dismissed={node.status === 'dismissed'}
                  data-manual={node.manual === true}
                  data-dragging={nodeDrag?.id === node.id}
                  transform={`translate(${box.x} ${box.y})`}
                  tabIndex={0}
                  role="button"
                  aria-label={`${NODE_LABELS[node.kind]} : ${node.title}${node.kind === 'site' ? `, ${shortDomain(node)}` : ''}`}
                  onPointerDown={(event) => {
                    if (event.button !== 0 || event.shiftKey) return
                    event.stopPropagation()
                    nodeDragRef.current = {
                      id: node.id,
                      startX: event.clientX,
                      startY: event.clientY,
                      originX: box.x,
                      originY: box.y,
                      moved: false
                    }
                    setNodeDrag({ id: node.id, x: box.x, y: box.y })
                    ;(event.currentTarget as SVGGElement).setPointerCapture(event.pointerId)
                  }}
                  onPointerMove={(event) => {
                    const current = nodeDragRef.current
                    if (!current) return
                    const dx = (event.clientX - current.startX) / zoom
                    const dy = (event.clientY - current.startY) / zoom
                    if (!current.moved && Math.hypot(dx, dy) > 3) current.moved = true
                    setNodeDrag({
                      id: current.id,
                      x: Math.round(current.originX + dx),
                      y: Math.round(current.originY + dy)
                    })
                  }}
                  onPointerUp={(event) => {
                    const current = nodeDragRef.current
                    if (!current) return
                    const dx = (event.clientX - current.startX) / zoom
                    const dy = (event.clientY - current.startY) / zoom
                    const x = Math.round(current.originX + dx)
                    const y = Math.round(current.originY + dy)
                    if (current.moved) {
                      suppressClick.current = Date.now()
                      void moveNode(current.id, x, y)
                    }
                    nodeDragRef.current = null
                    setNodeDrag(null)
                  }}
                  onPointerCancel={() => {
                    nodeDragRef.current = null
                    setNodeDrag(null)
                  }}
                  onClick={(event) => {
                    if (Date.now() - suppressClick.current < 250) return
                    if (event.shiftKey) select(node.id, { toggle: true })
                    else select(node.id)
                  }}
                  onDoubleClick={() => {
                    if (node.url) useBrowser.getState().newTab(node.url)
                  }}
                  onPointerEnter={() => setHover(node.id)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(node.id)}
                  onBlur={() => setHover(null)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      select(node.id)
                      return
                    }
                    if (event.key === 'Delete' || event.key === 'Backspace') {
                      event.preventDefault()
                      void setStatus(node.id, node.status === 'dismissed' ? 'neutral' : 'dismissed')
                      return
                    }
                    const siblings = layoutNodes.filter((entry) => entry.parentId === node.parentId)
                    const index = siblings.findIndex((entry) => entry.id === node.id)
                    const children = layoutNodes.filter((entry) => entry.parentId === node.id)
                    if (event.key === 'ArrowRight' && children[0]) {
                      event.preventDefault()
                      select(children[0].id)
                    } else if (event.key === 'ArrowLeft' && node.parentId) {
                      event.preventDefault()
                      select(node.parentId)
                    } else if (event.key === 'ArrowDown' && index >= 0 && siblings[index + 1]) {
                      event.preventDefault()
                      select(siblings[index + 1].id)
                    } else if (event.key === 'ArrowUp' && index > 0) {
                      event.preventDefault()
                      select(siblings[index - 1].id)
                    }
                  }}
                >
                  <title>
                    {`${node.title}${node.domain ? ` — ${node.domain}` : ''}`}
                  </title>
                  <rect
                    className="tunnel-card-halo"
                    x={-2 * fontUnit}
                    y={-2 * fontUnit}
                    width={box.width + 4 * fontUnit}
                    height={box.height + 4 * fontUnit}
                    rx={16}
                  />
                  <rect
                    className="tunnel-card"
                    width={box.width}
                    height={box.height}
                    rx={14}
                  />
                  <rect
                    className="tunnel-card-sheen"
                    width={box.width - 2 * fontUnit}
                    height={Math.min(box.height / 2, 26 * fontUnit)}
                    x={fontUnit}
                    y={fontUnit}
                    rx={12}
                  />
                  <rect
                    className="tunnel-node-accent"
                    x={0}
                    y={12 * fontUnit}
                    width={3 * fontUnit}
                    height={box.height - 24 * fontUnit}
                    rx={1.5 * fontUnit}
                  />
                  <g
                    className="tunnel-node-icon"
                    transform={`translate(${padding} ${padding}) scale(${0.86 * fontUnit})`}
                  >
                    <Icon name={KIND_ICON[node.kind]} size={14} />
                  </g>
                  {titleLines.map((line, index) => (
                    <text
                      key={index}
                      className="tunnel-node-title"
                      x={padding + 21 * fontUnit}
                      y={titleTop + index * titleSize * 1.1}
                      fontSize={titleSize}
                    >
                      {line}
                    </text>
                  ))}
                  {!compact && !showExcerpt && (
                    <g className="tunnel-badge" data-kind={node.kind}>
                      <rect
                        x={padding - 2 * fontUnit}
                        y={metaY - metaSize * 1.15}
                        width={badgeWidth}
                        height={metaSize * 1.5}
                        rx={metaSize * 0.75}
                      />
                      <text x={padding + 4 * fontUnit} y={metaY} fontSize={metaSize}>
                        {metaText}
                      </text>
                    </g>
                  )}
                  {showExcerpt && node.kind === 'site' && node.excerpt && (
                    <text
                      className="tunnel-node-excerpt"
                      x={padding}
                      y={metaY}
                      fontSize={excerptSize}
                    >
                      {shorten(node.excerpt.replace(/\s+/g, ' '), Math.floor((NODE_WIDTH - 2 * padding) / (excerptSize * 0.56)))}
                    </text>
                  )}
                  {node.kind === 'site' && (
                    <circle
                      className="tunnel-relevance"
                      cx={box.width - 13 * fontUnit}
                      cy={13 * fontUnit}
                      r={3.4 * fontUnit}
                      data-level={node.relevance >= 75 ? 'high' : node.relevance >= 60 ? 'mid' : 'low'}
                    />
                  )}
                  {isChecked && (
                    <g transform={`translate(${box.width - 26 * fontUnit} ${box.height - 22 * fontUnit})`}>
                      <circle r={7 * fontUnit} className="tunnel-check-dot" />
                      <path d={`M${-3 * fontUnit} 0 L${-0.8 * fontUnit} ${2.4 * fontUnit} L${3.4 * fontUnit} ${-2.8 * fontUnit}`} className="tunnel-check-mark" />
                    </g>
                  )}
                </g>
              )
            })}
          </g>
        </svg>
      </div>

      {running && shown.length === 0 && (
        <div className="tunnel-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}

      <ul className="tunnel-legend" aria-label="Légende des types de nœuds">
        {(['subject', 'angle', 'subangle', 'detail', 'concept', 'site', 'tension'] as MapNodeKind[]).map(
          (kind) => (
            <li key={kind} data-kind={kind}>
              <i aria-hidden="true" />
              {NODE_LABELS[kind]}
            </li>
          )
        )}
      </ul>

      <div className="tunnel-zoom">
        <button type="button" onClick={() => zoomBy(1 / 1.18)} aria-label="Réduire le zoom" title="Réduire le zoom (−)">
          <Icon name="chevron-down" size={14} style={{ transform: 'rotate(0deg)' }} />
        </button>
        <span aria-live="polite">{Math.round(zoom * 100)} %</span>
        <button type="button" onClick={() => zoomBy(1.18)} aria-label="Agrandir le zoom" title="Agrandir le zoom (+)">
          <Icon name="chevron-down" size={14} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <button type="button" onClick={fit} title="Ajuster la carte (0)" aria-label="Ajuster la carte">
          Ajuster
        </button>
      </div>

      <div
        className="tunnel-minimap"
        aria-hidden="true"
        onPointerDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const x = (event.clientX - rect.left) / minimap.scale - minimap.viewport.width / 2
          const y = (event.clientY - rect.top) / minimap.scale - minimap.viewport.height / 2
          setPan({ x: -x * zoom, y: -y * zoom })
        }}
      >
        <svg width={minimap.width} height={minimap.height}>
          {layoutNodes.map((node) => {
            const box = boxes[node.id]
            if (!box) return null
            return (
              <rect
                key={node.id}
                x={box.x * minimap.scale}
                y={box.y * minimap.scale}
                width={Math.max(2, box.width * minimap.scale)}
                height={Math.max(1.5, box.height * minimap.scale)}
                rx={1.2}
                data-kind={node.kind}
              />
            )
          })}
          <rect
            className="tunnel-minimap-view"
            x={minimap.viewport.x * minimap.scale}
            y={minimap.viewport.y * minimap.scale}
            width={minimap.viewport.width * minimap.scale}
            height={minimap.viewport.height * minimap.scale}
            rx={2}
          />
        </svg>
      </div>

      {hiddenSites > 0 && (
        <p className="tunnel-hidden-note">
          {hiddenSites} source{hiddenSites > 1 ? 's' : ''} écartée{hiddenSites > 1 ? 's' : ''} par l’entonnoir
          ou la pertinence.
        </p>
      )}

    </div>
  )
}
