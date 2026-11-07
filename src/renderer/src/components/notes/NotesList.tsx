import type { ReactNode, RefObject } from 'react'
import type { NoteMeta, PageHighlight } from '@shared/types'
import { hostOf } from '@shared/url'
import type { NotesSort } from '../../store/types'
import { shortDate, shortcut } from '../../lib/format'
import { Icon } from '../Icon'

interface NotesListProps {
  notes: NoteMeta[]
  spaces: { id: string; color: string }[]
  filter: string
  onFilter(value: string): void
  searchInputRef: RefObject<HTMLInputElement | null>
  onNext(): void
  tagFilter: string | null
  onTagFilter(value: string | null): void
  onlyPinned: boolean
  onOnlyPinned(value: boolean): void
  sort: NotesSort
  onSort(value: NotesSort): void
  allTags: [string, number][]
  highlights: PageHighlight[]
  pageNote: NoteMeta | undefined
  noNotes: boolean
  spaceName: string | undefined
  onOpen(id: string): void
  onTogglePin(note: NoteMeta): void
  trashCount: number
  onTrash(): void
  renderActions(inEmpty?: boolean): ReactNode
}

/** Liste des notes : recherche, filtres, surlignages de la page et cartes. */
export default function NotesList({
  notes,
  spaces,
  filter,
  onFilter,
  searchInputRef,
  onNext,
  tagFilter,
  onTagFilter,
  onlyPinned,
  onOnlyPinned,
  sort,
  onSort,
  allTags,
  highlights,
  pageNote,
  noNotes,
  spaceName,
  onOpen,
  onTogglePin,
  trashCount,
  onTrash,
  renderActions
}: NotesListProps) {
  const filtering = Boolean(filter.trim() || tagFilter || onlyPinned)
  const resultLabel = `${notes.length} résultat${notes.length > 1 ? 's' : ''}`

  return (
    <div className="notes-list-wrap" data-empty={noNotes}>
      <div className="notes-search">
        <Icon name="search" size={14} />
        <input
          ref={searchInputRef}
          value={filter}
          onChange={(event) => onFilter(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'Enter' || event.key === 'ArrowDown') {
              event.preventDefault()
              onNext()
            }
          }}
          placeholder={'Rechercher — mots, "expression", -exclu…'}
          aria-label="Rechercher dans les notes"
          aria-keyshortcuts="Meta+Shift+F Control+Shift+F"
          title={`Ouvrir la recherche (${shortcut('⇧F')}) · Résultat suivant (${shortcut('G')})`}
        />
        {/* Le compteur accompagne la frappe : il dit combien de notes
            répondent à la recherche et aux filtres actifs, sans qu'il faille
            compter les cartes à l'œil. */}
        <span
          className="notes-search-count"
          data-filtered={filtering}
          role="status"
          aria-label={resultLabel}
          title={resultLabel}
        >
          {notes.length}
        </span>
        {filter && (
          <button
            type="button"
            className="icon-btn"
            onClick={() => onFilter('')}
            aria-label="Effacer la recherche"
          >
            <Icon name="close" size={13} />
          </button>
        )}
      </div>

      <div className="notes-filters" role="group" aria-label="Filtres des notes">
        <button
          type="button"
          className="notes-filter"
          data-active={!onlyPinned && !tagFilter}
          onClick={() => {
            onOnlyPinned(false)
            onTagFilter(null)
          }}
        >
          Toutes
        </button>
        <button
          type="button"
          className="notes-filter"
          data-active={onlyPinned}
          onClick={() => onOnlyPinned(!onlyPinned)}
        >
          <Icon name="star" size={11} /> Épinglées
        </button>
        {allTags.map(([tag, count]) => (
          <button
            key={tag}
            type="button"
            className="notes-filter"
            data-active={tagFilter === tag}
            onClick={() => onTagFilter(tagFilter === tag ? null : tag)}
          >
            {tag}
            <span className="notes-filter-count">{count}</span>
          </button>
        ))}
        <label className="notes-sort" title="Ordre de la liste">
          <Icon name="list" size={11} />
          <select
            value={sort}
            onChange={(event) => onSort(event.target.value as NotesSort)}
            aria-label="Trier les notes"
          >
            <option value="updated">Récentes</option>
            <option value="title">Titre</option>
          </select>
        </label>
      </div>

      {!noNotes && renderActions()}

      {highlights.length > 0 && (
        <div className="notes-highlight-strip">
          <span>
            <Icon name="sparkles" size={12} /> {highlights.length} surlignage
            {highlights.length > 1 ? 's' : ''} sur cette page
          </span>
          {pageNote && (
            <button type="button" className="text-btn" onClick={() => onOpen(pageNote.id)}>
              Ouvrir la note
            </button>
          )}
        </div>
      )}

      <div className="notes-scroll">
        {notes.length === 0 && (
          <div className="notes-empty" data-start={noNotes}>
            <span className="notes-empty-mark">
              <Icon name="notes" size={20} />
            </span>
            <p>
              {filter || tagFilter || onlyPinned
                ? 'Aucune note ne correspond.'
                : 'Aucune note pour l’instant.'}
            </p>
            <span>
              {filter || tagFilter || onlyPinned
                ? 'Videz la recherche ou revenez à toutes les notes.'
                : 'Glissez un passage depuis la page, ou écrivez à côté d’elle.'}
            </span>
            {noNotes
              ? renderActions(true)
              : (filter || tagFilter || onlyPinned) && (
                  <button
                    type="button"
                    className="action"
                    onClick={() => {
                      onFilter('')
                      onTagFilter(null)
                      onOnlyPinned(false)
                    }}
                  >
                    Tout afficher
                  </button>
                )}
          </div>
        )}

        {notes.map((note) => {
          const noteSpace = spaces.find((item) => item.id === note.spaceId)
          return (
            <div
              key={note.id}
              className="note-card"
              data-pinned={note.pinned}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(note.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onOpen(note.id)
                }
              }}
            >
              <div className="note-card-top">
                <span
                  className="note-space-dot"
                  style={{ background: noteSpace?.color ?? 'var(--muted)' }}
                />
                <span className="note-card-title">{note.title}</span>
                <button
                  type="button"
                  className="note-pin"
                  data-active={note.pinned}
                  aria-pressed={note.pinned}
                  aria-label={note.pinned ? `Désépingler ${note.title}` : `Épingler ${note.title}`}
                  title={note.pinned ? 'Désépingler' : 'Épingler'}
                  onClick={(event) => {
                    event.stopPropagation()
                    onTogglePin(note)
                  }}
                >
                  <Icon name="star" size={13} filled={note.pinned} />
                </button>
              </div>
              <p className="note-card-preview">{note.preview || 'Note vide'}</p>
              <div className="note-card-foot">
                <div className="note-tags">
                  {(note.tags ?? []).slice(0, 3).map((tag) => (
                    <span className="note-tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                  {(note.tags?.length ?? 0) > 3 && (
                    <span className="note-tag more">+{(note.tags?.length ?? 0) - 3}</span>
                  )}
                </div>
                <span className="note-card-date">{shortDate(note.updatedAt)}</span>
              </div>
              {note.url && (
                <span className="note-card-source">
                  <Icon name="globe" size={10} />
                  {hostOf(note.url)}
                </span>
              )}
            </div>
          )
        })}
      </div>

      <footer className="note-foot note-foot-inset">
        <span>{spaceName ? `Espace ${spaceName}` : 'Vela'} · fichiers .md</span>
        <div className="note-foot-actions">
          <button
            type="button"
            className="text-btn"
            onClick={onTrash}
            title="Notes supprimées"
          >
            <Icon name="trash" size={13} />
            Corbeille{trashCount > 0 ? ` (${trashCount})` : ''}
          </button>
          <button type="button" className="text-btn" onClick={() => void window.vela.notes.openFolder()}>
            <Icon name="folder" size={13} />
            Ouvrir le dossier
          </button>
        </div>
      </footer>
    </div>
  )
}
