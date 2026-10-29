import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FILTER_TAGS,
  NODE_LABELS,
  SOURCE_TYPES,
  filterMap,
  refineSuggestions,
  tunnelMapTitle,
  type MapNode
} from '@shared/tunnel'
import { useBrowser } from '../store/browser'
import { useTunnel } from '../store/tunnel'
import { Icon } from './Icon'
import TunnelDetail from './TunnelDetail'
import TunnelMap from './TunnelMap'
import TunnelProjects from './TunnelProjects'

const EXAMPLES = [
  'Comparer les hébergeurs d’images libres',
  'Utiliser l’IA pour rédiger des textes',
  'Histoire de la photographie argentique'
]

const PERIODS = [
  { value: 0, label: 'Toute période' },
  { value: 1, label: '12 derniers mois' },
  { value: 5, label: '5 dernières années' },
  { value: 10, label: '10 dernières années' }
]

const LEVELS: { value: 1 | 2 | 3 | 4; label: string }[] = [
  { value: 1, label: 'Sujet' },
  { value: 2, label: 'Angle' },
  { value: 3, label: 'Sous-angle' },
  { value: 4, label: 'Sources' }
]

function nodeDepth(nodes: MapNode[], node: MapNode): number {
  let depth = 0
  let current: MapNode | undefined = node
  let guard = 0
  while (current?.parentId && guard < 12) {
    current = nodes.find((entry) => entry.id === current?.parentId)
    depth += 1
    guard += 1
  }
  return depth
}

function matches(node: MapNode, needle: string): boolean {
  const haystack = `${node.title} ${node.summary} ${node.domain ?? ''} ${node.excerpt ?? ''}`.toLowerCase()
  return haystack.includes(needle)
}

export default function TunnelView() {
  const active = useTunnel((s) => s.active)
  const query = useTunnel((s) => s.query)
  const runTunnel = useTunnel((s) => s.runTunnel)
  const cancel = useTunnel((s) => s.cancel)
  const running = useTunnel((s) => s.running)
  const phase = useTunnel((s) => s.phase)
  const suggested = useTunnel((s) => s.suggested)
  const error = useTunnel((s) => s.error)
  const filters = useTunnel((s) => s.filters)
  const setFilters = useTunnel((s) => s.setFilters)
  const toggleType = useTunnel((s) => s.toggleType)
  const toggleTag = useTunnel((s) => s.toggleTag)
  const resetFilters = useTunnel((s) => s.resetFilters)
  const addCard = useTunnel((s) => s.addCard)
  const level = useTunnel((s) => s.level)
  const setLevel = useTunnel((s) => s.setLevel)
  const viewMode = useTunnel((s) => s.viewMode)
  const setViewMode = useTunnel((s) => s.setViewMode)
  const select = useTunnel((s) => s.select)
  const selectedId = useTunnel((s) => s.selectedId)
  const checkedIds = useTunnel((s) => s.checkedIds)
  const filtersOpen = useTunnel((s) => s.filtersOpen)
  const setFiltersOpen = useTunnel((s) => s.setFiltersOpen)
  const setProjectsOpen = useTunnel((s) => s.setProjectsOpen)
  const exportOpen = useTunnel((s) => s.exportOpen)
  const setExportOpen = useTunnel((s) => s.setExportOpen)
  const addReportToNotes = useTunnel((s) => s.addReportToNotes)
  const exportMarkdown = useTunnel((s) => s.exportMarkdown)
  const exportJson = useTunnel((s) => s.exportJson)
  const exportPdf = useTunnel((s) => s.exportPdf)
  const exportPng = useTunnel((s) => s.exportPng)
  const exportOpml = useTunnel((s) => s.exportOpml)
  const exportSvg = useTunnel((s) => s.exportSvg)

  const svgRef = useRef<SVGSVGElement | null>(null)
  const [input, setInput] = useState(query)
  const [findOpen, setFindOpen] = useState(false)
  const [findTerm, setFindTerm] = useState('')
  const findRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setInput(query)
  }, [query])

  useEffect(() => {
    useTunnel.getState().subscribe()
    void useTunnel.getState().refreshMaps()
  }, [])

  useEffect(() => {
    if (findOpen) findRef.current?.focus()
  }, [findOpen])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        const target = event.target as HTMLElement | null
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
        event.preventDefault()
        setFindOpen(true)
      }
      if (event.key === 'Escape' && findOpen) setFindOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [findOpen])

  const nodes = active?.nodes ?? []
  const { visible, hiddenSites } = useMemo(() => filterMap(nodes, filters), [nodes, filters])
  const sourceCount = useMemo(
    () => nodes.filter((node) => node.kind === 'site' && visible.has(node.id)).length,
    [nodes, visible]
  )
  const nodeCount = useMemo(
    () => nodes.filter((node) => visible.has(node.id) && nodeDepth(nodes, node) < level).length,
    [nodes, visible, level]
  )
  const siteNodes = useMemo(
    () => nodes.filter((node) => node.kind === 'site' && visible.has(node.id)),
    [nodes, visible]
  )
  const tensions = useMemo(
    () => nodes.filter((node) => node.kind === 'tension' && visible.has(node.id)),
    [nodes, visible]
  )
  const sourceTotal = useMemo(() => nodes.filter((node) => node.kind === 'site').length, [nodes])
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const node of nodes) {
      if (node.kind !== 'site' || !node.sourceType || !visible.has(node.id)) continue
      counts.set(node.sourceType, (counts.get(node.sourceType) ?? 0) + 1)
    }
    return counts
  }, [nodes, visible])
  const refinements = useMemo(() => refineSuggestions(active?.query ?? input), [active?.query, input])
  const matchesList = useMemo(() => {
    const needle = findTerm.trim().toLowerCase()
    if (!needle) return []
    return nodes.filter((node) => matches(node, needle)).slice(0, 8)
  }, [nodes, findTerm])

  const submit = (value: string): void => {
    const clean = value.trim()
    if (!clean) return
    setInput(clean)
    setFindOpen(false)
    void runTunnel(clean)
  }

  const close = (): void => {
    useBrowser.getState().setWorkMode('browse')
  }

  const filtersActive =
    filters.minRelevance !== 60 ||
    filters.sourceTypes.length > 0 ||
    filters.from !== null ||
    filters.lang !== 'all' ||
    filters.tags.length > 0 ||
    filters.minExcerpt > 0

  const selectedNode = selectedId ? nodes.find((node) => node.id === selectedId) ?? null : null
  const periodYears =
    filters.from === null
      ? 0
      : [1, 5, 10].find(
          (years) => Math.abs(Date.now() - filters.from! - years * 365 * 24 * 3600 * 1000) < 1000 * 3600 * 24 * 2
        ) ?? 0

  return (
    <section className="tunnel" aria-label="Tunnel de recherche">
      <header className="tunnel-bar">
        <div className="tunnel-head">
          <div>
            <h1>Tunnel de recherche</h1>
            <p>Carte mentale de sources réelles</p>
          </div>
          {active && nodes.length > 0 && (
            <span className="tunnel-badges">
              <span className="tunnel-badge">
                <Icon name="lock" size={12} /> carte locale
              </span>
              <span
                className="tunnel-badge"
                title={sourceTotal > sourceCount ? `${sourceCount} affichées sur ${sourceTotal}` : undefined}
              >
                {sourceTotal} source{sourceTotal > 1 ? 's' : ''}
              </span>
              <span className="tunnel-badge">{nodeCount} nœuds</span>
            </span>
          )}
          <div className="tunnel-tools">
            <button
              type="button"
              className="tunnel-tool"
              data-active={filtersOpen}
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <Icon name="filter" size={14} /> Entonnoir
            </button>
            <div className="tunnel-seg" role="tablist" aria-label="Affichage">
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'map'}
                data-active={viewMode === 'map'}
                onClick={() => setViewMode('map')}
              >
                <Icon name="map" size={13} /> Carte
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'list'}
                data-active={viewMode === 'list'}
                onClick={() => setViewMode('list')}
              >
                <Icon name="list" size={13} /> Liste
              </button>
            </div>
            <button
              type="button"
              className="tunnel-tool"
              disabled={!active}
              title={selectedId ? 'Ajouter une carte sous ce nœud' : 'Ajouter une carte sous le sujet'}
              onClick={() => void addCard(selectedId ?? null)}
            >                <Icon name="plus" size={14} /> Nouvelle carte
            </button>
            <button type="button" className="tunnel-tool" onClick={() => setProjectsOpen(true)}>
              <Icon name="folder" size={14} /> Projets
            </button>
            <div className="tunnel-export">
              <button
                type="button"
                className="tunnel-tool"
                disabled={!active}
                aria-expanded={exportOpen}
                onClick={() => setExportOpen(!exportOpen)}
              >
                <Icon name="download" size={14} /> Exporter
              </button>
              {exportOpen && (
                <div className="tunnel-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => void exportMarkdown().then(() => setExportOpen(false))}>
                    Markdown
                  </button>
                  <button type="button" role="menuitem" onClick={() => void exportPdf().then(() => setExportOpen(false))}>
                    PDF
                  </button>
                  <button type="button" role="menuitem" onClick={() => void exportPng(svgRef.current).then(() => setExportOpen(false))}>
                    Image PNG
                  </button>
                  <button type="button" role="menuitem" onClick={() => void exportSvg(svgRef.current).then(() => setExportOpen(false))}>
                    Image SVG
                  </button>
                  <button type="button" role="menuitem" onClick={() => void exportJson().then(() => setExportOpen(false))}>
                    JSON
                  </button>
                  <button type="button" role="menuitem" onClick={() => void exportOpml().then(() => setExportOpen(false))}>
                    OPML
                  </button>
                </div>
              )}
            </div>
            <button type="button" className="icon-btn" onClick={close} title="Fermer le tunnel" aria-label="Fermer le tunnel">
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>

        <form
          className="tunnel-search"
          onSubmit={(event) => {
            event.preventDefault()
            submit(input)
          }}
        >
          <Icon name="search" size={16} />
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Un sujet, une question, un angle"
            aria-label="Sujet du tunnel"
            autoFocus
          />
          {running ? (
            <button type="button" className="tunnel-run stop" onClick={cancel}>
              <Icon name="stop" size={13} /> Arrêter
            </button>
          ) : (
            <button type="submit" className="tunnel-run" disabled={!input.trim()}>
              Explorer
            </button>
          )}
        </form>

        <div className="tunnel-row">
          <div className="tunnel-chips" role="group" aria-label="Types de sources">
            {SOURCE_TYPES.map((type) => (
              <button
                key={type.id}
                type="button"
                className="tunnel-chip"
                aria-pressed={filters.sourceTypes.includes(type.id)}
                data-active={filters.sourceTypes.includes(type.id)}
                onClick={() => toggleType(type.id)}
              >
                {type.label}
                {(typeCounts.get(type.id) ?? 0) > 0 && (
                  <span className="tunnel-chip-count">{typeCounts.get(type.id)}</span>
                )}
              </button>
            ))}
          </div>
          <div className="tunnel-levels" role="group" aria-label="Niveau affiché">
            {LEVELS.map((entry) => (
              <button
                key={entry.value}
                type="button"
                aria-pressed={level === entry.value}
                data-active={level === entry.value}
                disabled={!active}
                onClick={() => setLevel(entry.value)}
                title={
                  active
                    ? `Afficher jusqu’au niveau ${entry.value} : ${entry.label}`
                    : 'Ouvrez une carte pour régler le niveau affiché'
                }
              >
                <b>{entry.value}</b> {entry.label}
              </button>
            ))}
          </div>
        </div>

        {refinements.length > 0 && (active || running) && (
          <div className="tunnel-refine">
            <span>Affiner</span>
            {refinements.map((entry) => (
              <button key={entry.query} type="button" onClick={() => submit(entry.query)}>
                + {entry.label}
              </button>
            ))}
            {suggested && suggested !== query && (
              <button type="button" className="tunnel-suggest" onClick={() => submit(suggested)}>
                Vouliez-vous dire « {suggested} » ?
              </button>
            )}
          </div>
        )}

        {active && (
          <p className="tunnel-summary">
            {sourceTotal} source{sourceTotal > 1 ? 's' : ''} réelle{sourceTotal > 1 ? 's' : ''}
            {sourceCount !== sourceTotal && ` · ${sourceCount} affichée${sourceCount > 1 ? 's' : ''}`}.{' '}
            <strong>« {active.query} »</strong> ouvre le sujet.
            {hiddenSites > 0 && <span className="tunnel-muted"> {hiddenSites} écartée{hiddenSites > 1 ? 's' : ''} par l’entonnoir.</span>}
            {phase && running && <span className="tunnel-muted"> {phase}</span>}
          </p>
        )}

        {filtersOpen && (
          <div className="tunnel-filters" role="group" aria-label="Filtres de l’entonnoir">
            <label>
              <span>Pertinence minimale : {filters.minRelevance} %</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={filters.minRelevance}
                onChange={(event) => setFilters({ minRelevance: Number(event.target.value) })}
              />
            </label>
            <label>
              <span>Période</span>
              <select
                value={periodYears}
                onChange={(event) => {
                  const years = Number(event.target.value)
                  setFilters({
                    from: years === 0 ? null : Date.now() - years * 365 * 24 * 3600 * 1000
                  })
                }}
              >
                {PERIODS.map((period) => (
                  <option key={period.value} value={period.value}>
                    {period.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Langue</span>
              <select
                value={filters.lang}
                onChange={(event) => setFilters({ lang: event.target.value as typeof filters.lang })}
              >
                <option value="all">Toutes</option>
                <option value="fr">Français</option>
                <option value="en">Anglais</option>
              </select>
            </label>
            <label>
              <span>Niveau de détail</span>
              <select
                value={filters.minExcerpt}
                onChange={(event) => setFilters({ minExcerpt: Number(event.target.value) })}
              >
                <option value={0}>Toutes les pages</option>
                <option value={200}>Extrait de 200 caractères</option>
                <option value={600}>Extrait de 600 caractères</option>
              </select>
            </label>
            <div className="tunnel-tag-filter" role="group" aria-label="Étiquettes">
              <span>Étiquettes</span>
              <div>
                {FILTER_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="tunnel-chip"
                    aria-pressed={filters.tags.includes(tag)}
                    data-active={filters.tags.includes(tag)}
                    onClick={() => toggleTag(tag)}
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" className="ghost-btn" onClick={resetFilters} disabled={!filtersActive}>
              Réinitialiser
            </button>
            <p className="tunnel-privacy">
              <Icon name="lock" size={12} /> Analyse locale des pages récupérées. Aucune télémétrie : le contenu ne part
              vers un modèle que si vous lancez une demande à l’agent.
            </p>
          </div>
        )}
      </header>

      <div className="tunnel-body" data-detail={Boolean(selectedNode)}>
        <div className="tunnel-main">
          {!active && !running && (
            <div className="tunnel-empty">
              <span className="tunnel-empty-icon">
                <Icon name="map" size={26} />
              </span>
              <h2>Descendez d’un sujet jusqu’aux sources</h2>
              <p>
                Vela construit la carte à partir de pages réellement récupérées : angles, précisions, puis sites,
                avec leur pertinence et leurs extraits.
              </p>
              <div className="tunnel-examples">
                {EXAMPLES.map((example) => (
                  <button key={example} type="button" onClick={() => submit(example)}>
                    {example}
                  </button>
                ))}
              </div>
              <p className="tunnel-empty-foot">
                <Icon name="lock" size={12} /> Aucune source inventée : chaque page est réellement récupérée.
              </p>
            </div>
          )}

          {running && !active && (
            <div className="tunnel-progress">
              <span className="tunnel-pulse" aria-hidden="true" />
              <p>{phase || 'Ouverture du tunnel…'}</p>
            </div>
          )}

          {active && viewMode === 'map' && (
            <div className="tunnel-map-wrap">
              <TunnelMap svgRef={svgRef} />
            </div>
          )}

          {active && viewMode === 'list' && (
            <div className="tunnel-list" role="region" aria-label="Liste des sources">
              <div className="tunnel-list-head">
                <p>
                  {siteNodes.length} source{siteNodes.length > 1 ? 's' : ''} ·{' '}
                  {tensions.length} tension{tensions.length > 1 ? 's' : ''}
                </p>
                <div>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => {
                      for (const node of siteNodes) {
                        if (!checkedIds.includes(node.id)) select(node.id, { toggle: true })
                      }
                    }}
                    disabled={siteNodes.length === 0}
                  >
                    Tout sélectionner
                  </button>
                  <button
                    type="button"
                    className="action"
                    onClick={() => void addReportToNotes(checkedIds)}
                    disabled={siteNodes.length === 0}
                  >
                    <Icon name="notes" size={13} /> Générer le rapport
                  </button>
                </div>
              </div>

              {(['angle', 'subangle'] as const).map((kind) => {
                const groups = active.nodes.filter((node) => node.kind === kind && visible.has(node.id))
                if (groups.length === 0) return null
                return groups.map((group) => {
                  const children = active.nodes.filter(
                    (node) =>
                      node.parentId === group.id &&
                      (node.kind === 'site' || node.kind === 'detail' || node.kind === 'concept') &&
                      visible.has(node.id)
                  )
                  return (
                    <section key={group.id} className="tunnel-group">
                      <h3>
                        <span className="tunnel-kind" data-kind={kind}>
                          {NODE_LABELS[kind]}
                        </span>
                        {group.title}
                      </h3>
                      {children.length === 0 && <p className="tunnel-muted">Aucune source sous cet angle.</p>}
                      {children.map((node) => (
                        <div key={node.id} className="tunnel-list-row" data-selected={selectedId === node.id}>
                          <button
                            type="button"
                            className="tunnel-list-main"
                            onClick={() => select(node.id)}
                            aria-label={`Détail de ${node.title}`}
                          >
                            <strong>{node.title}</strong>
                            <span>
                              {node.kind === 'site' ? node.domain ?? node.url : NODE_LABELS[node.kind]}
                              {node.kind === 'site' && ` · ${node.relevance} %`}
                            </span>
                          </button>
                          {node.kind === 'site' && (
                            <span className="tunnel-list-actions">
                              <button
                                type="button"
                                className="icon-btn"
                                aria-pressed={checkedIds.includes(node.id)}
                                aria-label={`Sélectionner ${node.title}`}
                                data-active={checkedIds.includes(node.id)}
                                onClick={() => select(node.id, { toggle: true })}
                              >
                                <Icon name="check" size={13} />
                              </button>
                              <button
                                type="button"
                                className="icon-btn"
                                aria-label={`Ouvrir ${node.title}`}
                                onClick={() => node.url && useBrowser.getState().newTab(node.url)}
                              >
                                <Icon name="external" size={13} />
                              </button>
                            </span>
                          )}
                        </div>
                      ))}
                    </section>
                  )
                })
              })}

              {siteNodes.length === 0 && (
                <p className="tunnel-empty-inline">
                  Aucune source ne passe le seuil de pertinence. Baissez-le dans l’entonnoir ou reformulez le sujet.
                </p>
              )}
            </div>
          )}

          {findOpen && (
            <div className="tunnel-find">
              <Icon name="search" size={14} />
              <input
                ref={findRef}
                value={findTerm}
                placeholder="Chercher un nœud, un domaine…"
                aria-label="Chercher un nœud"
                onChange={(event) => setFindTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && matchesList[0]) {
                    select(matchesList[0].id)
                    setFindOpen(false)
                  }
                  if (event.key === 'Escape') setFindOpen(false)
                }}
              />
              <button type="button" className="icon-btn" onClick={() => setFindOpen(false)} aria-label="Fermer la recherche">
                <Icon name="close" size={14} />
              </button>
              {findTerm && (
                <ul className="tunnel-find-list">
                  {matchesList.map((node) => (
                    <li key={node.id}>
                      <button
                        type="button"
                        onClick={() => {
                          select(node.id)
                          setFindOpen(false)
                        }}
                      >
                        <span className="tunnel-kind" data-kind={node.kind}>
                          {NODE_LABELS[node.kind]}
                        </span>
                        {node.title}
                      </button>
                    </li>
                  ))}
                  {matchesList.length === 0 && <li className="tunnel-muted">Aucun nœud.</li>}
                </ul>
              )}
            </div>
          )}

          {(error || (active && siteNodes.length === 0 && !running)) && (
            <div className="tunnel-alert" role="status">
              <Icon name="warning" size={15} />
              <div>
                <strong>{error ? 'Le tunnel s’est arrêté' : 'Aucun résultat retenu'}</strong>
                <p>
                  {error ??
                    'Aucune page récupérée pour ce sujet. Vérifiez la connexion ou reformulez la demande.'}
                </p>
              </div>
              <button type="button" className="ghost-btn" onClick={() => submit(active?.query ?? input)}>
                Réessayer
              </button>
            </div>
          )}
        </div>

        {selectedNode && <TunnelDetail />}
      </div>

      <TunnelProjects />

      <footer className="tunnel-foot">
        <span>{active ? tunnelMapTitle(active) : 'Aucune carte ouverte'}</span>
        <span className="tunnel-muted">
          {checkedIds.length > 0 && `${checkedIds.length} sélectionnée${checkedIds.length > 1 ? 's' : ''} · `}
          {running
            ? 'construction en cours'
            : active
              ? 'carte enregistrée automatiquement'
              : 'aucune carte pour l’instant'}
        </span>
      </footer>
    </section>
  )
}
