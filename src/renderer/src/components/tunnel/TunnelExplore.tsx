import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import {
  filterMap,
  tunnelCounts,
  type MapNode,
  type SourceType
} from '@shared/tunnel'
import { angleGroups, domainOf, siteYear } from '@shared/tunnelSynthesis'
import { useBrowser } from '../../store/browser'
import { useTunnel } from '../../store/tunnel'
import { Icon } from '../Icon'
import TunnelDetail from './TunnelDetail'

const FIVE_YEARS = 5 * 365 * 24 * 3600 * 1000
const PREVIEW_ROWS = 3

const TYPE_LABELS: Record<SourceType, string> = {
  other: 'Comparatifs',
  wiki: 'Définitions',
  discussion: 'Forums',
  docs: 'Documentation',
  academic: 'Académique',
  news: 'Presse'
}

const TYPE_QUERY: Record<SourceType, string> = {
  other: 'comparatif',
  wiki: 'définition',
  discussion: 'forum',
  docs: 'documentation',
  academic: 'étude',
  news: 'actualité'
}

function yearOf(node: MapNode): string {
  return siteYear(node)
}

/**
 * Deuxième temps : l'entonnoir devient une navigation. Un filtre ne supprime
 * rien, il replie des branches ; le compteur dit ce qu'il masque.
 */
export default function TunnelExplore() {
  const active = useTunnel((s) => s.active)
  const filters = useTunnel((s) => s.filters)
  const setFilters = useTunnel((s) => s.setFilters)
  const resetFilters = useTunnel((s) => s.resetFilters)
  const selectedId = useTunnel((s) => s.selectedId)
  const select = useTunnel((s) => s.select)
  const setStatus = useTunnel((s) => s.setStatus)
  const checkedIds = useTunnel((s) => s.checkedIds)
  const setStep = useTunnel((s) => s.setStep)
  const setProjectsOpen = useTunnel((s) => s.setProjectsOpen)
  const running = useTunnel((s) => s.running)
  const phase = useTunnel((s) => s.phase)
  const findMore = useTunnel((s) => s.findMore)
  const runTunnel = useTunnel((s) => s.runTunnel)
  const toggleType = useTunnel((s) => s.toggleType)

  const [mode, setMode] = useState<'angles' | 'list'>('list')
  const [needle, setNeedle] = useState('')
  const [findOpen, setFindOpen] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [mountedAt] = useState(() => Date.now())
  const findRef = useRef<HTMLInputElement | null>(null)

  const nodes = useMemo(() => active?.nodes ?? [], [active?.nodes])
  const { visible, hiddenSites } = useMemo(() => filterMap(nodes, filters), [nodes, filters])
  const sites = useMemo(() => nodes.filter((node) => node.kind === 'site'), [nodes])
  const kept = useMemo(
    () => sites.filter((site) => visible.has(site.id) && site.status !== 'dismissed'),
    [sites, visible]
  )
  const live = useMemo(() => tunnelCounts(nodes, visible), [nodes, visible])
  const dismissedSites = useMemo(
    () => sites.filter((site) => site.status === 'dismissed'),
    [sites]
  )
  const typeCounts = useMemo(() => {
    const map = new Map<SourceType, number>()
    for (const site of kept) {
      const type = site.sourceType ?? 'other'
      map.set(type, (map.get(type) ?? 0) + 1)
    }
    return map
  }, [kept])
  const groups = useMemo(() => angleGroups(nodes, visible), [nodes, visible])
  const selectedNode = useMemo(
    () => (selectedId ? (nodes.find((node) => node.id === selectedId) ?? null) : null),
    [nodes, selectedId]
  )

  const counts = useMemo(
    () => ({
      reachable: sites.filter((site) => site.reachable !== false).length,
      recent: sites.filter((site) => site.publishedAt && site.publishedAt >= mountedAt - FIVE_YEARS)
        .length,
      academic: sites.filter((site) => site.sourceType === 'academic' || site.sourceType === 'news')
        .length,
      long: sites.filter((site) => (site.excerpt ?? '').length >= 600).length
    }),
    [sites, mountedAt]
  )

  const filterCount =
    (filters.reachableOnly ? 1 : 0) +
    (filters.from !== null ? 1 : 0) +
    (filters.sourceTypes.length > 0 ? 1 : 0) +
    (filters.minExcerpt >= 600 ? 1 : 0)

  const matchedGroups = useMemo(() => {
    const clean = needle.trim().toLowerCase()
    if (!clean) return groups
    return groups
      .map((group) => ({
        ...group,
        sites: group.sites.filter((site) =>
          `${site.title} ${site.summary} ${domainOf(site)}`.toLowerCase().includes(clean)
        )
      }))
      .filter((group) => group.sites.length > 0)
  }, [groups, needle])

  const matchedList = useMemo(() => {
    const clean = needle.trim().toLowerCase()
    if (!clean) return kept
    return kept.filter((site) =>
      `${site.title} ${site.summary} ${domainOf(site)}`.toLowerCase().includes(clean)
    )
  }, [kept, needle])

  useEffect(() => {
    if (findOpen) findRef.current?.focus()
  }, [findOpen])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setFindOpen(true)
        return
      }
      if (event.key === 'Escape' && findOpen) {
        setFindOpen(false)
        setNeedle('')
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }
      const node = selectedNode
      if (!node) return
      const key = event.key.toLowerCase()
      if ((key === 'k' || key === 'x') && target?.tagName === 'BUTTON') return
      if (key === 'k') {
        event.preventDefault()
        void setStatus(node.id, node.status === 'kept' ? 'neutral' : 'kept')
      } else if (key === 'x') {
        event.preventDefault()
        void setStatus(node.id, node.status === 'dismissed' ? 'neutral' : 'dismissed')
      } else if (event.key === 'Enter' && node.url && target?.tagName !== 'BUTTON') {
        event.preventDefault()
        useBrowser.getState().newTab(node.url)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedNode, setStatus, findOpen])

  const keptMarked = kept.filter((site) => site.status === 'kept').length
  const autoSelected = useRef(false)

  // Une cible dès l'arrivée : la première page retenue prend le focus, sinon
  // K, X et ↵ n'ont aucun nœud sur lequel agir.
  useEffect(() => {
    if (autoSelected.current || selectedId || kept.length === 0) return
    autoSelected.current = true
    select(kept[0].id)
  }, [kept, selectedId, select])

  const toggleKeep = (site: MapNode): void => {
    void setStatus(site.id, site.status === 'kept' ? 'neutral' : 'kept')
  }

  const toggleDismiss = (site: MapNode): void => {
    void setStatus(site.id, site.status === 'dismissed' ? 'neutral' : 'dismissed')
  }

  const searchType = (type: SourceType): void => {
    const base = active?.query ?? ''
    if (!base) return
    void runTunnel(base, { more: true, variants: [`${base} ${TYPE_QUERY[type]}`] })
  }

  const row = (site: MapNode): ReactElement => {
    const year = yearOf(site)
    const domain = domainOf(site)
    return (
      <div
        key={site.id}
        className="tw-src"
        data-on={selectedId === site.id}
        data-state={site.status}
      >
        <button
          type="button"
          className="tw-src-main"
          onClick={() => select(site.id)}
          aria-label={`Détail de ${site.title}`}
        >
          <span className="tw-src-title">{site.title}</span>
          <span className="tw-src-meta">
            <i className="tw-dot" aria-hidden="true" />
            <span className="tw-src-domain">{domain}</span>
            {year && (
              <>
                <span>·</span>
                <span>{year}</span>
              </>
            )}
          </span>
          <span className="tw-src-bar">
            <span className="track">
              <i style={{ width: `${site.relevance}%` }} />
            </span>
            <b
              title={`Pertinence ${site.relevance} % — part des mots de la requête retrouvés dans la page, son extrait et son domaine.`}
            >
              Pertinence {site.relevance}
            </b>
          </span>
          {(site.relevanceReason || site.reason) && (
            <span className="tw-src-why">{site.relevanceReason || site.reason}</span>
          )}
        </button>
        <span className="tw-src-do">
          <button
            type="button"
            data-on={site.status === 'kept'}
            aria-pressed={site.status === 'kept'}
            aria-label={site.status === 'kept' ? `Retirer ${site.title}` : `Garder ${site.title}`}
            title={site.status === 'kept' ? 'Retirer' : 'Garder'}
            onClick={() => toggleKeep(site)}
          >
            <Icon name="check" size={11} />
          </button>
          <button
            type="button"
            data-on={site.status === 'dismissed'}
            aria-pressed={site.status === 'dismissed'}
            aria-label={
              site.status === 'dismissed' ? `Rétablir ${site.title}` : `Écarter ${site.title}`
            }
            title="Écarter"
            onClick={() => toggleDismiss(site)}
          >
            <Icon name="close" size={11} />
          </button>
        </span>
      </div>
    )
  }

  if (!active) return null

  return (
    <div className="tw-screen">
      <div className="tw-stage" aria-busy={running}>
        <aside className="tw-rail" aria-label="Progression">
          <div className="tw-rail-query">
            <span className="tw-k">Question</span>
            <b title={active.query}>{active.query}</b>
            <button type="button" onClick={() => setStep('question')}>
              Modifier
            </button>
          </div>

          <div className="tw-progress" aria-label="Progression">
            <button
              type="button"
              data-on={filterCount === 0}
              onClick={() => {
                resetFilters()
                setMode('list')
              }}
            >
              <b>{sites.length}</b> trouvées
            </button>
            <span aria-hidden="true">→</span>
            <span className="tw-progress-read">
              <b>{live.read}</b> lues
            </span>
            <span aria-hidden="true">→</span>
            <button type="button" data-on={mode === 'list'} onClick={() => setMode('list')}>
              <b>{kept.length}</b> retenues
            </button>
            <span aria-hidden="true">→</span>
            <button type="button" onClick={() => setStep('synthesis')}>
              Synthèse
            </button>
          </div>

          <div className="tw-filters">
            <span className="tw-k">
              Affiner les pages
              {filterCount > 0 && <em className="tw-count">{filterCount}</em>}
            </span>
            <button
              type="button"
              className="tw-filter-line"
              disabled={counts.reachable === 0}
              data-on={Boolean(filters.reachableOnly)}
              aria-pressed={Boolean(filters.reachableOnly)}
              onClick={() => setFilters({ reachableOnly: !filters.reachableOnly })}
            >
              <i aria-hidden="true">✓</i>
              <span>Pages accessibles</span>
              <em>{counts.reachable}</em>
            </button>
            <button
              type="button"
              className="tw-filter-line"
              disabled={counts.recent === 0}
              data-on={filters.from !== null}
              aria-pressed={filters.from !== null}
              onClick={() =>
                setFilters({ from: filters.from === null ? mountedAt - FIVE_YEARS : null })
              }
            >
              <i aria-hidden="true">✓</i>
              <span>Publiées depuis 5 ans</span>
              <em>{counts.recent}</em>
            </button>
            <button
              type="button"
              className="tw-filter-line"
              disabled={counts.academic === 0}
              data-on={filters.sourceTypes.length > 0}
              aria-pressed={filters.sourceTypes.length > 0}
              onClick={() =>
                setFilters({
                  sourceTypes: filters.sourceTypes.length > 0 ? [] : ['academic', 'news']
                })
              }
            >
              <i aria-hidden="true">✓</i>
              <span>Académique et presse</span>
              <em>{counts.academic}</em>
            </button>
            <button
              type="button"
              className="tw-filter-line"
              disabled={counts.long === 0}
              data-on={filters.minExcerpt >= 600}
              aria-pressed={filters.minExcerpt >= 600}
              onClick={() => setFilters({ minExcerpt: filters.minExcerpt >= 600 ? 0 : 600 })}
            >
              <i aria-hidden="true">✓</i>
              <span>Extrait de 600 caractères</span>
              <em>{counts.long}</em>
            </button>
          </div>

          <p className="tw-note">
            Un filtre ne supprime rien : il replie les branches et le compteur dit ce qu’il masque
            {hiddenSites > 0
              ? ` (${hiddenSites} page${hiddenSites > 1 ? 's' : ''} masquée${hiddenSites > 1 ? 's' : ''})`
              : ''}
            .
          </p>
        </aside>

        <section className="tw-center" aria-label="Sources du tunnel">
          <div className="tw-center-head">
            <h2>{running ? 'Exploration en cours' : 'Explorer'}</h2>
            <span className="tw-sub">
              {live.found} trouvées · {live.read} lues · {live.kept} retenues
              {live.dismissed > 0 ? ` · ${live.dismissed} écartées` : ''}
              {running && phase ? ` · ${phase}` : ''}
            </span>
            <span className="tw-grow" />
            {findOpen ? (
              <label className="tw-find">
                <Icon name="search" size={13} />
                <input
                  ref={findRef}
                  value={needle}
                  placeholder="Filtrer les sources…"
                  aria-label="Filtrer les sources affichées"
                  onChange={(event) => setNeedle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setFindOpen(false)
                      setNeedle('')
                    }
                  }}
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Fermer la recherche"
                  onClick={() => {
                    setFindOpen(false)
                    setNeedle('')
                  }}
                >
                  <Icon name="close" size={13} />
                </button>
              </label>
            ) : (
              <button
                type="button"
                className="tunnel-tool"
                data-compact="true"
                title="Chercher une source (⌘F)"
                aria-label="Chercher une source"
                onClick={() => setFindOpen(true)}
              >
                <Icon name="search" size={14} />
              </button>
            )}
            <div className="tw-seg" role="tablist" aria-label="Vue">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'angles'}
                data-active={mode === 'angles'}
                onClick={() => setMode('angles')}
              >
                Angles
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'list'}
                data-active={mode === 'list'}
                onClick={() => setMode('list')}
              >
                Liste
              </button>
              <button type="button" role="tab" aria-selected={false} onClick={() => setStep('map')}>
                Carte
              </button>
            </div>
          </div>

          <div className="tw-scroll">
            {kept.length > 0 && typeCounts.size < 3 && (
              <p className="tw-same-type">
                <b>Sources de même type</b> : {typeCounts.size} type
                {typeCounts.size > 1 ? 's' : ''} seulement parmi les pages retenues. Cherchez un
                forum, une documentation ou une étude pour croiser les regards.
              </p>
            )}
            <div className="tw-coverage" aria-label="Couverture par type">
              <span className="tw-k">Couverture</span>
              {(Object.keys(TYPE_LABELS) as SourceType[]).map((type) => {
                const count = typeCounts.get(type) ?? 0
                return (
                  <button
                    key={type}
                    type="button"
                    data-zero={count === 0}
                    data-on={filters.sourceTypes.includes(type)}
                    title={
                      count === 0
                        ? `Chercher des sources de ce type (${TYPE_LABELS[type]})`
                        : `Filtrer : ${TYPE_LABELS[type]}`
                    }
                    onClick={() => (count === 0 ? searchType(type) : toggleType(type))}
                  >
                    {TYPE_LABELS[type]} <b>{count}</b>
                  </button>
                )
              })}
            </div>
            {mode === 'angles' && (
              <div className="tw-angles">
                {matchedGroups.map((group) => {
                  const open = expanded[group.id]
                  const shown = open ? group.sites : group.sites.slice(0, PREVIEW_ROWS)
                  return (
                    <article key={group.id} className="tw-angle">
                      <header className="tw-angle-head">
                        <b>{group.title}</b>
                        <span className="tw-angle-tally">
                          {group.sites.length} / {group.total}
                        </span>
                      </header>
                      {shown.map(row)}
                      {group.sites.length > PREVIEW_ROWS && (
                        <button
                          type="button"
                          className="tw-angle-more"
                          aria-expanded={Boolean(open)}
                          onClick={() =>
                            setExpanded((state) => ({ ...state, [group.id]: !state[group.id] }))
                          }
                        >
                          {open
                            ? 'Replier'
                            : `+ ${group.sites.length - PREVIEW_ROWS} autre${
                                group.sites.length - PREVIEW_ROWS > 1 ? 's' : ''
                              } source${group.sites.length - PREVIEW_ROWS > 1 ? 's' : ''}`}
                        </button>
                      )}
                      <button
                        type="button"
                        className="tw-angle-add"
                        disabled={running}
                        onClick={() => void findMore()}
                      >
                        + Trouver plus de sources
                      </button>
                    </article>
                  )
                })}
                {matchedGroups.length === 0 && (
                  <p className="tw-note tw-empty">
                    Aucune source ne passe le seuil de pertinence. Baissez-le dans les filtres ou
                    reformulez la question.
                  </p>
                )}
              </div>
            )}

            {mode === 'list' && (
              <div className="tw-list">
                <div className="tw-list-head">
                  <span>
                    {matchedList.length} source{matchedList.length > 1 ? 's' : ''}
                  </span>
                  <button type="button" className="tw-link" onClick={() => setStep('map')}>
                    Voir la carte
                  </button>
                </div>
                {matchedList.map(row)}
                {matchedList.length === 0 && (
                  <p className="tw-note tw-empty">Aucune source retenue.</p>
                )}
              </div>
            )}

            {dismissedSites.length > 0 && (
              <details className="tw-dismissed">
                <summary>
                  {dismissedSites.length} écartée{dismissedSites.length > 1 ? 's' : ''}
                </summary>
                {dismissedSites.map((site) => (
                  <div key={site.id} className="tw-dismissed-row">
                    <span>
                      <b>{site.title}</b>
                      <em>{domainOf(site)}</em>
                    </span>
                    <button type="button" onClick={() => void setStatus(site.id, 'neutral')}>
                      Réintégrer
                    </button>
                  </div>
                ))}
              </details>
            )}
          </div>

          <div className="tw-dock">
            <span className="tw-tally" title={`${keptMarked} gardée${keptMarked > 1 ? 's' : ''}`}>
              <b>{live.found}</b> trouvées · <b>{live.read}</b> lues · <b>{live.kept}</b> retenues
            </span>
            <span className="tw-grow" />
            <span className="tw-hint">K garder · X écarter · ↵ ouvrir</span>
            <button
              type="button"
              className="tw-btn tw-btn-more"
              disabled={running}
              onClick={() => void findMore()}
            >
              <Icon name="search" size={13} /> Trouver plus
            </button>
            <button type="button" className="tw-btn" onClick={() => setStep('map')}>
              Voir la carte
            </button>
            <button
              type="button"
              className="tw-btn tw-btn-primary"
              onClick={() => setStep('synthesis')}
              disabled={kept.length === 0}
            >
              Rédiger la synthèse
            </button>
          </div>
        </section>

        {selectedNode ? (
          <div className="tw-sheet" data-empty="false">
            <TunnelDetail />
          </div>
        ) : (
          <aside className="tw-sheet" data-empty="true" aria-label="Fiche de source">
            <div className="tw-sheet-empty">
              <Icon name="panel" size={20} />
              <h3>Une source à la fois</h3>
              <p>
                Choisissez une page pour voir pourquoi elle est là, son extrait, ses divergences et
                les actions de lecture.
              </p>
              <ul>
                <li>
                  <b>{keptMarked}</b> gardée{keptMarked > 1 ? 's' : ''}
                </li>
                <li>
                  <b>{checkedIds.length}</b> sélectionnée{checkedIds.length > 1 ? 's' : ''}
                </li>
              </ul>
              <button type="button" className="tw-btn" onClick={() => setProjectsOpen(true)}>
                <Icon name="folder" size={13} /> Cartes enregistrées
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
