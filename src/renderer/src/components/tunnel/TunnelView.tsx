import { useMemo, useRef } from 'react'
import { filterMap } from '@shared/tunnel'
import { useBrowser } from '../../store/browser'
import { useTunnel } from '../../store/tunnel'
import { Icon } from '../Icon'
import TunnelAsk from './TunnelAsk'
import TunnelExplore from './TunnelExplore'
import TunnelMap from './TunnelMap'
import TunnelProjects from './TunnelProjects'
import TunnelSynthesis from './TunnelSynthesis'

const STEPS = [
  { id: 'question', label: 'Question' },
  { id: 'explore', label: 'Pages trouvées' },
  { id: 'map', label: 'Carte' },
  { id: 'synthesis', label: 'Synthèse' }
] as const

/** Les quatre temps du tunnel : poser, explorer, voir la carte, écrire. */
export default function TunnelView() {
  const active = useTunnel((s) => s.active)
  const step = useTunnel((s) => s.step)
  const setStep = useTunnel((s) => s.setStep)
  const filters = useTunnel((s) => s.filters)
  const projectsOpen = useTunnel((s) => s.projectsOpen)
  const setProjectsOpen = useTunnel((s) => s.setProjectsOpen)
  const exportOpen = useTunnel((s) => s.exportOpen)
  const setExportOpen = useTunnel((s) => s.setExportOpen)
  const exportMarkdown = useTunnel((s) => s.exportMarkdown)
  const exportPdf = useTunnel((s) => s.exportPdf)
  const exportPng = useTunnel((s) => s.exportPng)
  const exportSvg = useTunnel((s) => s.exportSvg)
  const exportJson = useTunnel((s) => s.exportJson)
  const exportOpml = useTunnel((s) => s.exportOpml)
  const svgRef = useRef<SVGSVGElement | null>(null)

  const nodes = useMemo(() => active?.nodes ?? [], [active?.nodes])
  const { hiddenSites } = useMemo(() => filterMap(nodes, filters), [nodes, filters])
  const sites = useMemo(() => nodes.filter((node) => node.kind === 'site'), [nodes])
  const angles = useMemo(
    () => nodes.filter((node) => node.kind === 'angle' || node.kind === 'subangle').length,
    [nodes]
  )

  // Sans carte, la seule étape possible est la question : une étape vidée
  // (carte supprimée, enregistrement refusé) ne laisse pas un écran blanc.
  const viewStep = active || step === 'question' ? step : 'question'

  const close = (): void => {
    useBrowser.getState().setWorkMode('browse')
  }

  return (
    <section className="tunnel tunnel-refonte" aria-label="Atelier de recherche">
      <header className="tw-bar">
        <span className="tw-brand">
          <Icon name="compass" size={15} />
          Atelier
        </span>
        <nav className="tw-steps" aria-label="Étapes de la recherche">
          {STEPS.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              className="tw-step"
              data-active={viewStep === entry.id}
              aria-current={viewStep === entry.id ? 'step' : undefined}
              disabled={entry.id !== 'question' && !active}
              onClick={() => setStep(entry.id)}
            >
              <em>{index + 1}</em>
              {entry.label}
            </button>
          ))}
        </nav>
        <span className="tw-grow" />
        <div className="tw-tools">
          <button
            type="button"
            className="tunnel-tool"
            data-compact="true"
            data-active={projectsOpen}
            title="Cartes enregistrées"
            aria-label="Cartes enregistrées"
            onClick={() => setProjectsOpen(!projectsOpen)}
          >
            <Icon name="folder" size={14} />
          </button>
          <div className="tunnel-export">
            <button
              type="button"
              className="tunnel-tool"
              data-compact="true"
              disabled={!active}
              title="Exporter"
              aria-label="Exporter"
              aria-expanded={exportOpen}
              onClick={() => setExportOpen(!exportOpen)}
            >
              <Icon name="download" size={14} />
            </button>
            {exportOpen && (
              <div className="tunnel-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void exportMarkdown().then(() => setExportOpen(false))}
                >
                  Markdown
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void exportPdf().then(() => setExportOpen(false))}
                >
                  PDF
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void exportPng(svgRef.current).then(() => setExportOpen(false))}
                >
                  Image PNG
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void exportSvg(svgRef.current).then(() => setExportOpen(false))}
                >
                  Image SVG
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void exportJson().then(() => setExportOpen(false))}
                >
                  JSON
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void exportOpml().then(() => setExportOpen(false))}
                >
                  OPML
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={close}
            title="Fermer l’Atelier"
            aria-label="Fermer l’Atelier"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      </header>

      {viewStep === 'question' && <TunnelAsk />}
      {viewStep === 'explore' && <TunnelExplore />}
      {viewStep === 'map' && (
        <div className="tw-screen">
          <div className="tw-map-head">
            <h2>Carte</h2>
            <span className="tw-sub">
              {sites.length} source{sites.length > 1 ? 's' : ''} · {angles} angle
              {angles > 1 ? 's' : ''}
            </span>
            <span className="tw-grow" />
            <button type="button" className="tw-btn" onClick={() => setStep('explore')}>
              Explorer la liste
            </button>
            <button
              type="button"
              className="tw-btn tw-btn-primary"
              onClick={() => setStep('synthesis')}
            >
              Rédiger la synthèse
            </button>
          </div>
          <p className="tw-map-note">
            {hiddenSites > 0
              ? `${hiddenSites} source${hiddenSites > 1 ? 's' : ''} écartée${hiddenSites > 1 ? 's' : ''} par l’entonnoir ou la pertinence.`
              : 'Toutes les sources passent l’entonnoir.'}
          </p>
          <div className="tunnel-map-wrap">
            <TunnelMap svgRef={svgRef} />
          </div>
        </div>
      )}
      {viewStep === 'synthesis' && <TunnelSynthesis />}

      <TunnelProjects />
    </section>
  )
}
