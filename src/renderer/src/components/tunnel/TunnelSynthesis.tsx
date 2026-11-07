import { useMemo, useState } from 'react'
import { filterMap } from '@shared/tunnel'
import { buildTunnelSynthesis, synthesisMarkdown } from '@shared/tunnelSynthesis'
import { useBrowser } from '../../store/browser'
import { useTunnel } from '../../store/tunnel'
import { Icon } from '../Icon'

/** Quatrième temps : une synthèse citée, page par page. */
export default function TunnelSynthesis() {
  const active = useTunnel((s) => s.active)
  const filters = useTunnel((s) => s.filters)
  const setStep = useTunnel((s) => s.setStep)
  const select = useTunnel((s) => s.select)
  const addReportToNotes = useTunnel((s) => s.addReportToNotes)
  const [copied, setCopied] = useState(false)

  const nodes = useMemo(() => active?.nodes ?? [], [active?.nodes])
  const { visible } = useMemo(() => filterMap(nodes, filters), [nodes, filters])
  const synthesis = useMemo(
    () => (active ? buildTunnelSynthesis(active, visible) : null),
    [active, visible]
  )

  if (!active || !synthesis) return null

  const openSource = (id: string): void => {
    select(id)
    setStep('explore')
  }

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(synthesisMarkdown(synthesis))
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      useBrowser.getState().toast('Copie impossible.', 'error')
    }
  }

  return (
    <div className="tw-screen">
      <div className="tw-synth-head">
        <button type="button" className="tw-back" onClick={() => setStep('explore')}>
          ← Exploration
        </button>
        <span className="tw-sep" aria-hidden="true" />
        <span className="tw-crumb" title={active.query}>
          {active.query}
        </span>
        <span className="tw-grow" />
        <span className="tw-sub">
          {synthesis.kept} source{synthesis.kept > 1 ? 's' : ''} ·{' '}
          {new Date(synthesis.generatedAt).toLocaleDateString('fr-FR')}
        </span>
        <button type="button" className="tw-btn" onClick={() => void copy()}>
          <Icon name={copied ? 'check' : 'copy'} size={13} /> {copied ? 'Copié' : 'Copier le Markdown'}
        </button>
        <button
          type="button"
          className="tw-btn tw-btn-primary"
          onClick={() => void addReportToNotes(synthesis.sources.map((source) => source.id))}
          disabled={synthesis.sources.length === 0}
        >
          <Icon name="notes" size={13} /> Garder dans les notes
        </button>
      </div>

      <div className="tw-synth">
        <div className="tw-doc-wrap">
          <article className="tw-doc">
            <p className="tw-eyebrow">
              <i aria-hidden="true" />
              Synthèse du tunnel
            </p>
            <h1>{synthesis.title}</h1>
            <p className="tw-lede">{synthesis.lede}</p>

            {synthesis.sections.length === 0 && (
              <p className="tw-note tw-empty">
                Aucune section : aucune page ne passe encore le seuil de pertinence. Revenez à l’exploration pour
                baisser l’entonnoir ou reformuler la question.
              </p>
            )}

            {synthesis.sections.map((section) => (
              <section key={section.id}>
                <h2>{section.heading}</h2>
                {section.paragraphs.map((paragraph, index) => (
                  <p key={index}>
                    {paragraph.text}
                    {paragraph.citations.length > 0 && <span aria-hidden="true"> </span>}
                    {paragraph.citations.map((citation) => (
                      <button
                        key={citation}
                        type="button"
                        className="tw-cite"
                        title={`Source ${citation}`}
                        onClick={() => {
                          const source = synthesis.sources.find((entry) => entry.index === citation)
                          if (source) openSource(source.id)
                        }}
                      >
                        {citation}
                      </button>
                    ))}
                  </p>
                ))}
                {section.quote && (
                  <blockquote className="tw-quote">
                    <q>{section.quote.text}</q>
                    <cite>
                      {section.quote.attribution}{' '}
                      <button
                        type="button"
                        className="tw-cite"
                        onClick={() => {
                          const source = synthesis.sources.find(
                            (entry) => entry.index === section.quote?.citation
                          )
                          if (source) openSource(source.id)
                        }}
                      >
                        {section.quote.citation}
                      </button>
                    </cite>
                  </blockquote>
                )}
              </section>
            ))}

            {synthesis.decisions.length > 0 && (
              <div className="tw-callout">
                <span className="tw-k">À trancher</span>
                {synthesis.decisions.map((decision) => (
                  <div key={decision.title} className="tw-decision">
                    <strong>{decision.title}</strong>
                    <p>
                      {decision.text}{' '}
                      {decision.citations.map((citation) => (
                        <button
                          key={citation}
                          type="button"
                          className="tw-cite"
                          onClick={() => {
                            const source = synthesis.sources.find((entry) => entry.index === citation)
                            if (source) openSource(source.id)
                          }}
                        >
                          {citation}
                        </button>
                      ))}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <p className="tw-doc-foot">
              <Icon name="lock" size={12} /> Chaque paragraphe renvoie à la page dont il vient ; les citations sont
              des extraits, jamais des reformulations.
            </p>
          </article>
        </div>

        <aside className="tw-synth-side" aria-label="Sources et points à vérifier">
          <div className="tw-side-block">
            <span className="tw-k">
              Sources retenues <span>{synthesis.sources.length}</span>
            </span>
            <div className="tw-sources">
              {synthesis.sources.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  className="tw-source-mini"
                  onClick={() => openSource(source.id)}
                  title={source.title}
                >
                  <b>{source.index}</b>
                  <span>
                    <span>{source.title}</span>
                    <em>{source.domain}</em>
                  </span>
                </button>
              ))}
              {synthesis.sources.length === 0 && <p className="tw-note">Aucune source retenue.</p>}
            </div>
          </div>

          <div className="tw-side-block">
            <span className="tw-k">
              À vérifier <span>{synthesis.decisions.length}</span>
            </span>
            {synthesis.decisions.length === 0 ? (
              <p className="tw-note">
                Aucune contradiction chiffrée n’a été repérée entre les pages retenues. Cela ne prouve pas qu’elles
                s’accordent sur le fond.
              </p>
            ) : (
              synthesis.decisions.map((decision) => (
                <p key={decision.title} className="tw-side-warn">
                  <strong>{decision.title}</strong>
                  {decision.text}
                </p>
              ))
            )}
          </div>

          <div className="tw-side-block">
            <span className="tw-k">Attribution</span>
            <p className="tw-note">
              {synthesis.kept} pages retenues sur {synthesis.explored} lues, réparties en {synthesis.angles} angle
              {synthesis.angles > 1 ? 's' : ''}. La synthèse cite les pages ; elle ne remplace pas leur lecture.
            </p>
            <button type="button" className="tw-btn" onClick={() => setStep('map')}>
              <Icon name="map" size={13} /> Voir la carte
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}
