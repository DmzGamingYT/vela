import { useState } from 'react'
import type { WorkSummary } from '@shared/types'
import { plural, timeAgo } from '../lib/format'
import { useBrowser } from '../store/browser'
import { Icon } from './Icon'

interface Props {
  onOpen: (work: WorkSummary) => void
}

/**
 * Liste consultable des travaux de l'atelier : renommer, archiver, rouvrir.
 * Chaque rapport produit y entre automatiquement.
 */
export default function WorkList({ onOpen }: Props) {
  const works = useBrowser((state) => state.view?.works ?? [])
  const renameWork = useBrowser((state) => state.renameWork)
  const archiveWork = useBrowser((state) => state.archiveWork)
  const [archived, setArchived] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const visible = works.filter((work) => work.archived === archived)
  const openCount = works.length - works.filter((work) => work.archived).length
  const archivedCount = works.length - openCount

  const commit = (work: WorkSummary): void => {
    if (draft.trim() && draft.trim() !== work.title) void renameWork(work.id, draft)
    setEditing(null)
    setDraft('')
  }

  return (
    <section className="agent-right work-list" aria-label="Travaux de l’atelier">
      <header className="work-list-head">
        <div>
          <p className="eyebrow">
            <span className="eyebrow-dot" />
            Atelier
          </p>
          <h2>Travaux</h2>
        </div>
        <div className="work-list-actions">
          <div className="work-filter" role="tablist" aria-label="Filtrer les travaux">
            <button type="button" role="tab" aria-selected={!archived} data-active={!archived} onClick={() => setArchived(false)}>
              En cours<span className="work-filter-count">{openCount}</span>
            </button>
            <button type="button" role="tab" aria-selected={archived} data-active={archived} onClick={() => setArchived(true)}>
              Archivés<span className="work-filter-count">{archivedCount}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="work-scroll">
        {visible.length === 0 && (
          <div className="work-empty">
            <span className="work-empty-icon"><Icon name="inbox" size={22} /></span>
            <strong>{archived ? 'Aucun travail archivé.' : 'Aucun travail pour l’instant.'}</strong>
            <p>{archived ? 'Les rapports que vous archivez vivent ici.' : 'Lancez l’agent : chaque rapport rejoint cette liste.'}</p>
          </div>
        )}

        {visible.map((work) => (
          <article key={work.id} className="work-item" data-editing={editing === work.id}>
            {editing === work.id ? (
              <div className="work-edit">
                <input
                  className="work-edit-input"
                  value={draft}
                  autoFocus
                  maxLength={160}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commit(work)
                    if (event.key === 'Escape') { setEditing(null); setDraft('') }
                  }}
                />
                <button type="button" className="icon-btn" onClick={() => commit(work)} title="Enregistrer le titre">
                  <Icon name="check" size={15} />
                </button>
                <button type="button" className="icon-btn" onClick={() => { setEditing(null); setDraft('') }} title="Annuler">
                  <Icon name="close" size={15} />
                </button>
              </div>
            ) : (
              <>
                <button type="button" className="work-open" onClick={() => onOpen(work)} title="Rouvrir ce rapport">
                  <span className="work-icon">
                    <Icon name="notes" size={14} />
                  </span>
                  <span className="work-copy">
                    <span className="work-title">{work.title}</span>
                    <span className="work-meta">
                      {timeAgo(work.updatedAt || work.createdAt)}
                      {work.sourceCount > 0 && ` · ${plural(work.sourceCount, 'source')}`}
                      {work.mode === 'api' ? ' · modèle' : ' · démo'}
                    </span>
                    {work.preview && <span className="work-excerpt">{work.preview}</span>}
                  </span>
                </button>
                <div className="work-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    title="Renommer"
                    onClick={() => { setEditing(work.id); setDraft(work.title) }}
                  >
                    <Icon name="edit" size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title={work.archived ? 'Restaurer' : 'Archiver'}
                    onClick={() => void archiveWork(work.id, !work.archived)}
                  >
                    <Icon name={work.archived ? 'inbox' : 'download'} size={15} />
                  </button>
                </div>
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
