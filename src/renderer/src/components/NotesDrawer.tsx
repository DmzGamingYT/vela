import { useEffect, useMemo, useRef, useState } from 'react'
import { hostOf, isHomeUrl } from '@shared/url'
import { shortDate, timeAgo } from '../lib/format'
import { Markdown } from '../lib/markdown'
import { useBrowser } from '../store/browser'
import { Icon } from './Icon'

interface Draft {
  id?: string
  title: string
  body: string
  spaceId: string
  url?: string
}

export default function NotesDrawer() {
  const view = useBrowser((state) => state.view)
  const toggleNotes = useBrowser((state) => state.toggleNotes)
  const saveNote = useBrowser((state) => state.saveNote)
  const deleteNote = useBrowser((state) => state.deleteNote)
  const toast = useBrowser((state) => state.toast)

  const [draft, setDraft] = useState<Draft | null>(null)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('')
  const [preview, setPreview] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const latest = useRef<{ draft: Draft | null; dirty: boolean }>({ draft: null, dirty: false })

  latest.current = { draft, dirty }

  const activeTab = view?.tabs.find((tab) => tab.id === view.activeTabId)
  const activeUrl = activeTab && !isHomeUrl(activeTab.url) ? activeTab.url : undefined
  const space = view?.spaces.find((item) => item.id === view.activeSpaceId)

  const notes = useMemo(() => {
    const list = view?.notes ?? []
    const search = filter.trim().toLowerCase()
    if (!search) return list
    return list.filter((note) => `${note.title} ${note.preview}`.toLowerCase().includes(search))
  }, [view?.notes, filter])

  useEffect(() => {
    if (!draft || !dirty) return
    if (!draft.title.trim() && !draft.body.trim()) return
    const timer = setTimeout(() => {
      setSaving(true)
      void saveNote({
        id: draft.id,
        title: draft.title || 'Note sans titre',
        body: draft.body,
        spaceId: draft.spaceId,
        url: draft.url
      }).then((note) => {
        setSaving(false)
        if (!note) return
        setSavedAt(Date.now())
        setDirty(false)
        setDraft((current) => (current && !current.id ? { ...current, id: note.id } : current))
      })
    }, 600)
    return () => clearTimeout(timer)
  }, [draft?.title, draft?.body, draft?.id, draft?.spaceId, draft?.url, dirty, saveNote])

  useEffect(() => {
    return () => {
      const { draft: current, dirty: pending } = latest.current
      if (!current || !pending) return
      if (!current.title.trim() && !current.body.trim()) return
      void window.vela.notes.save({
        id: current.id,
        title: current.title || 'Note sans titre',
        body: current.body,
        spaceId: current.spaceId,
        url: current.url
      })
    }
  }, [])

  if (!view) return null

  const openNote = async (id: string): Promise<void> => {
    try {
      const note = await window.vela.notes.get(id)
      if (!note) return
      setDraft({
        id: note.id,
        title: note.title,
        body: note.body,
        spaceId: note.spaceId,
        url: note.url
      })
      setDirty(false)
      setPreview(false)
      setConfirming(false)
      setSavedAt(note.updatedAt)
    } catch {
      toast('Cette note est introuvable.', 'error')
    }
  }

  const newNote = (): void => {
    setDraft({
      title: '',
      body: '',
      spaceId: view.activeSpaceId,
      url: activeUrl
    })
    setDirty(false)
    setPreview(false)
    setConfirming(false)
    setSavedAt(null)
  }

  const capturePage = (): void => {
    if (!activeTab || !activeUrl) {
      toast('Ouvrez une page pour la capturer.', 'error')
      return
    }
    setDraft({
      title: activeTab.title || hostOf(activeUrl),
      body: `Source : [${activeTab.title || hostOf(activeUrl)}](${activeUrl})\n\n`,
      spaceId: view.activeSpaceId,
      url: activeUrl
    })
    setDirty(true)
    setPreview(false)
    setConfirming(false)
    setSavedAt(null)
  }

  const close = (): void => {
    toggleNotes(false)
  }

  const removeDraft = async (): Promise<void> => {
    if (!draft?.id) {
      setDraft(null)
      setDirty(false)
      return
    }
    if (!confirming) {
      setConfirming(true)
      return
    }
    await deleteNote(draft.id)
    setDraft(null)
    setDirty(false)
    setConfirming(false)
  }

  return (
    <aside className="notes-drawer">
      <header className="notes-head">
        <div className="notes-title">
          <span className="notes-mark">
            <Icon name="notes" size={15} />
          </span>
          <div>
            <h2>Notes</h2>
            <p>{view.notes.length} note{view.notes.length > 1 ? 's' : ''} · Markdown local</p>
          </div>
        </div>
        <div className="notes-head-actions">
          <button type="button" className="icon-btn" onClick={newNote} title="Nouvelle note">
            <Icon name="plus" size={16} />
          </button>
          <button type="button" className="icon-btn" onClick={close} title="Fermer (Échap)">
            <Icon name="close" size={16} />
          </button>
        </div>
      </header>

      {draft ? (
        <div className="note-editor">
          <div className="note-editor-head">
            <button type="button" className="icon-btn" onClick={() => setDraft(null)} title="Retour aux notes">
              <Icon name="back" size={16} />
            </button>
            <input
              className="note-title-input"
              value={draft.title}
              placeholder="Titre de la note"
              onChange={(event) => {
                setDraft({ ...draft, title: event.target.value })
                setDirty(true)
              }}
            />
            <button
              type="button"
              className="icon-btn danger"
              onClick={() => void removeDraft()}
              title={confirming ? 'Cliquer à nouveau pour confirmer' : 'Supprimer la note'}
              data-confirming={confirming}
            >
              <Icon name={confirming ? 'warning' : 'trash'} size={15} />
            </button>
          </div>

          {draft.url && (
            <div className="note-source">
              <Icon name="globe" size={12} />
              <span>{hostOf(draft.url)}</span>
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  setDraft({ ...draft, url: undefined })
                  setDirty(true)
                }}
                title="Détacher la source"
              >
                Détacher
              </button>
            </div>
          )}

          <div className="note-modes">
            <button type="button" className="seg" data-active={!preview} onClick={() => setPreview(false)}>
              Écrire
            </button>
            <button type="button" className="seg" data-active={preview} onClick={() => setPreview(true)}>
              Aperçu
            </button>
            <span className="note-saved">
              {saving ? 'Enregistrement…' : dirty ? 'Modifié' : savedAt ? `Enregistré · ${timeAgo(savedAt)}` : 'Brouillon'}
            </span>
          </div>

          {preview ? (
            <div className="note-preview">
              {draft.body.trim() ? <Markdown text={draft.body} /> : <p className="note-empty-preview">Rien à prévisualiser.</p>}
            </div>
          ) : (
            <textarea
              className="note-textarea"
              value={draft.body}
              placeholder="Écrivez en Markdown. Les notes restent sur votre disque, dans un dossier que vous possédez."
              spellCheck
              onChange={(event) => {
                setDraft({ ...draft, body: event.target.value })
                setDirty(true)
              }}
            />
          )}

          <footer className="note-foot">
            <span>{draft.body.length} caractères</span>
            <button type="button" className="text-btn" onClick={() => void window.vela.notes.openFolder()}>
              <Icon name="folder" size={13} />
              Dossier
            </button>
          </footer>
        </div>
      ) : (
        <div className="notes-list-wrap">
          <div className="notes-actions">
            <button type="button" className="action wide" onClick={newNote}>
              <Icon name="plus" size={14} />
              Nouvelle note
            </button>
            <button type="button" className="action wide" onClick={capturePage} disabled={!activeUrl}>
              <Icon name="globe" size={14} />
              Capturer la page
            </button>
          </div>

          <div className="notes-search">
            <Icon name="search" size={14} />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filtrer les notes"
              aria-label="Filtrer les notes"
            />
          </div>

          <div className="notes-scroll">
            {notes.length === 0 && (
              <div className="notes-empty">
                <span className="notes-empty-mark">
                  <Icon name="notes" size={20} />
                </span>
                <p>{filter ? 'Aucune note ne correspond.' : 'Aucune note pour l’instant.'}</p>
                <span>Capturez une page, ou écrivez à côté d’elle.</span>
              </div>
            )}

            {notes.map((note) => {
              const noteSpace = view.spaces.find((item) => item.id === note.spaceId)
              return (
                <button type="button" key={note.id} className="note-row" onClick={() => void openNote(note.id)}>
                  <span className="note-row-top">
                    <span className="note-space-dot" style={{ background: noteSpace?.color ?? 'var(--muted)' }} />
                    <span className="note-row-title">{note.title}</span>
                    <span className="note-row-date">{shortDate(note.updatedAt)}</span>
                  </span>
                  <span className="note-row-preview">{note.preview || 'Note vide'}</span>
                </button>
              )
            })}
          </div>

          <footer className="note-foot note-foot-inset">
            <span>
              {space ? `Espace ${space.name}` : 'Vela'} · fichiers .md
            </span>
            <button type="button" className="text-btn" onClick={() => void window.vela.notes.openFolder()}>
              <Icon name="folder" size={13} />
              Ouvrir le dossier
            </button>
          </footer>
        </div>
      )}
    </aside>
  )
}
