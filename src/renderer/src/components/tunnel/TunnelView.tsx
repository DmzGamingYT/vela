import { useRef } from 'react'
import { useBrowser } from '../../store/browser'
import { useTunnel } from '../../store/tunnel'
import { Icon } from '../Icon'
import TunnelAsk from './TunnelAsk'
import TunnelExplore from './TunnelExplore'
import TunnelProjects from './TunnelProjects'
import TunnelSynthesis from './TunnelSynthesis'

const STEPS = [
  { id: 'question', label: 'Question' },
  { id: 'sources', label: 'Sources' },
  { id: 'synthesis', label: 'Synthèse' }
] as const

/** Deux images plus tard : la carte est montée et peinte avant la capture. */
function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

/**
 * Les trois temps du tunnel : poser, lire les sources (liste, angles ou carte
 * dans le même écran), écrire une synthèse citée. Changer de vue ne fait plus
 * quitter les filtres, la sélection ni le défilement.
 */
export default function TunnelView() {
  const active = useTunnel((s) => s.active)
  const step = useTunnel((s) => s.step)
  const setStep = useTunnel((s) => s.setStep)
  const setViewMode = useTunnel((s) => s.setViewMode)
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

  // Sans carte, la seule étape possible est la question : une étape vidée
  // (carte supprimée, enregistrement refusé) ne laisse pas un écran blanc.
  const viewStep = active || step === 'question' ? step : 'question'

  const close = (): void => {
    useBrowser.getState().setWorkMode('browse')
  }

  // L'image a besoin de la carte à l'écran : on bascule la vue, on laisse
  // peindre, puis on capture le même SVG que celui qu'on voit.
  const exportMap = async (kind: 'png' | 'svg'): Promise<void> => {
    if (viewStep !== 'sources') setStep('sources')
    setViewMode('map')
    await afterPaint()
    await (kind === 'png' ? exportPng(svgRef.current) : exportSvg(svgRef.current))
    setExportOpen(false)
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
                <button type="button" role="menuitem" onClick={() => void exportMap('png')}>
                  Image PNG
                </button>
                <button type="button" role="menuitem" onClick={() => void exportMap('svg')}>
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
      {viewStep === 'sources' && <TunnelExplore svgRef={svgRef} />}
      {viewStep === 'synthesis' && <TunnelSynthesis />}

      <TunnelProjects />
    </section>
  )
}
