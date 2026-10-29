import { useState } from 'react'
import { timeAgo } from '../lib/format'
import { useBrowser } from '../store/browser'
import { Icon } from './Icon'

interface QuickNotesCardProps {
  spaceId: string
}

export default function QuickNotesCard({ spaceId }: QuickNotesCardProps) {
  const notes = useBrowser((state) => state.view?.notes ?? [])
  const saveNote = useBrowser((state) => state.saveNote)
  const toggleNotes = useBrowser((state) => state.toggleNotes)
  const toast = useBrowser((state) => state.toast)

  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // Filtrer les notes pour cet espace
  const spaceNotes = notes
    .filter((n) => n.spaceId === spaceId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
  const recentNotes = spaceNotes.slice(0, 3)

  const handleSave = async (): Promise<void> => {
    const clean = text.trim()
    if (!clean || saving) return
    setSaving(true)
    try {
      const firstLine = clean.split('\n')[0].replace(/^#+\s*/, '').trim()
      const title = (firstLine.slice(0, 60) || 'Note rapide').trim()
      await saveNote({
        title,
        body: clean,
        spaceId,
        tags: ['rapide'],
        pinned: false
      })
      setText('')
      setExpanded(false)
      toast('Note enregistrée.')
    } catch {
      toast('Erreur lors de l’enregistrement de la note.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="home-card home-quicknotes" aria-label="Notes rapides">
      <div className="home-card-head">
        <h2>Notes rapides</h2>
        <button
          type="button"
          className="home-card-action"
          onClick={() => toggleNotes(true)}
          title="Ouvrir le carnet de notes"
        >
          <span>Toutes les notes</span>
          <Icon name="arrow-right" size={12} />
        </button>
      </div>

      <div className="quicknotes-form">
        {!expanded ? (
          <div className="quicknotes-collapsed" onClick={() => setExpanded(true)}>
            <span className="quicknotes-placeholder">Noter une idée, un lien ou une tâche…</span>
            <button
              type="button"
              className="quicknotes-add-btn"
              title="Nouvelle note"
              aria-label="Nouvelle note"
            >
              <Icon name="plus" size={13} />
            </button>
          </div>
        ) : (
          <div className="quicknotes-editor">
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Écrivez votre note en Markdown… (⌘+Entrée pour enregistrer)"
              rows={3}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault()
                  void handleSave()
                } else if (e.key === 'Escape') {
                  if (!text.trim()) setExpanded(false)
                }
              }}
            />
            <div className="quicknotes-actions">
              <button
                type="button"
                className="quicknotes-cancel"
                onClick={() => {
                  setText('')
                  setExpanded(false)
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                className="action primary quicknotes-save"
                disabled={!text.trim() || saving}
                onClick={() => void handleSave()}
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        )}
      </div>

      {recentNotes.length > 0 ? (
        <ul className="quicknotes-list">
          {recentNotes.map((note) => (
            <li
              key={note.id}
              className="quicknotes-item"
              onClick={() => toggleNotes(true)}
              title="Ouvrir dans le tiroir de notes"
            >
              <div className="quicknotes-item-header">
                <span className="quicknotes-item-title">{note.title}</span>
                <span className="quicknotes-item-date">{timeAgo(note.updatedAt)}</span>
              </div>
              {note.preview && <p className="quicknotes-item-preview">{note.preview}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="home-hint" style={{ margin: '8px 0 0' }}>
          Aucune note dans cet espace pour le moment.
        </p>
      )}
    </section>
  )
}
