import { useEffect, useMemo, useRef, useState } from 'react'
import type { NoteAiAction } from '@shared/api'
import { parseDroppedExcerpt } from '@shared/noteDrop'
import {
  completeLink,
  findNoteByTitle,
  linkQueryAt,
  removeAudioToken,
  suggestNotes,
  type NoteGraph
} from '@shared/noteLinks'
import type { Note, NoteMeta, PageHighlight } from '@shared/types'
import { hostOf, isHomeUrl } from '@shared/url'
import { shortDate, timeAgo } from '../lib/format'
import { Markdown, type NoteAudioContext, type NoteLinkContext } from '../lib/markdown'
import { useBrowser } from '../store/browser'
import { Icon } from './Icon'
import NoteRecorder from './NoteRecorder'

interface Draft {
  id?: string
  title: string
  body: string
  spaceId: string
  url?: string
  tags: string[]
  pinned: boolean
}

const AI_ACTIONS: { id: NoteAiAction; label: string; hint: string }[] = [
  { id: 'reformulate', label: 'Reformuler', hint: 'Phrases claires, même contenu' },
  { id: 'summarize', label: 'Résumer', hint: 'Cinq points et une synthèse' },
  { id: 'translate', label: 'Traduire', hint: 'En français, structure conservée' },
  { id: 'correct', label: 'Corriger', hint: 'Orthographe et grammaire' },
  { id: 'beautify', label: 'Embellir', hint: 'Mise en page Markdown' }
]

function draftFrom(note: Note): Draft {
  return {
    id: note.id,
    title: note.title,
    body: note.body,
    spaceId: note.spaceId,
    url: note.url,
    tags: note.tags ?? [],
    pinned: note.pinned ?? false
  }
}

export default function NotesDrawer() {
  const view = useBrowser((state) => state.view)
  const toggleNotes = useBrowser((state) => state.toggleNotes)
  const saveNote = useBrowser((state) => state.saveNote)
  const deleteNote = useBrowser((state) => state.deleteNote)
  const captureSelection = useBrowser((state) => state.captureSelection)
  const voiceNoteRequest = useBrowser((state) => state.voiceNoteRequest)
  const voiceNoteSpaceId = useBrowser((state) => state.voiceNoteSpaceId)
  const consumeVoiceNoteRequest = useBrowser((state) => state.consumeVoiceNoteRequest)
  const toast = useBrowser((state) => state.toast)

  const [draft, setDraft] = useState<Draft | null>(null)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [onlyPinned, setOnlyPinned] = useState(false)
  const [preview, setPreview] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const [aiBusy, setAiBusy] = useState<NoteAiAction | 'generate' | null>(null)
  const [aiMode, setAiMode] = useState<'api' | 'demo' | null>(null)
  const [sketchOpen, setSketchOpen] = useState(false)
  const [dropping, setDropping] = useState(false)
  const [highlights, setHighlights] = useState<PageHighlight[]>([])
  const [linkMenu, setLinkMenu] = useState<{ query: string; index: number } | null>(null)
  const [graph, setGraph] = useState<NoteGraph | null>(null)
  const [linksOpen, setLinksOpen] = useState(true)
  const [renameUndo, setRenameUndo] = useState<{ id: string; from: string; updated: number } | null>(null)
  const [recorderOpen, setRecorderOpen] = useState(false)
  const loadedTitle = useRef('')
  const [width, setWidth] = useState(() => {
    const stored = Number(window.localStorage.getItem('vela-notes-width'))
    return Number.isFinite(stored) && stored >= 300 && stored <= 760 ? stored : 400
  })
  const latest = useRef<{ draft: Draft | null; dirty: boolean }>({ draft: null, dirty: false })
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef<{ active: boolean; x: number; y: number } | null>(null)

  latest.current = { draft, dirty }

  const activeTab = view?.tabs.find((tab) => tab.id === view.activeTabId)
  const activeUrl = activeTab && !isHomeUrl(activeTab.url) ? activeTab.url : undefined
  const space = view?.spaces.find((item) => item.id === view.activeSpaceId)

  const allTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const note of view?.notes ?? []) {
      for (const tag of note.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [view?.notes])

  const notes = useMemo(() => {
    const list = view?.notes ?? []
    const search = filter.trim().toLowerCase()
    return list
      .filter((note) => (onlyPinned ? note.pinned : true))
      .filter((note) => (tagFilter ? (note.tags ?? []).includes(tagFilter) : true))
      .filter((note) =>
        search
          ? `${note.title} ${note.preview} ${(note.tags ?? []).join(' ')}`.toLowerCase().includes(search)
          : true
      )
      .slice()
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
  }, [view?.notes, filter, tagFilter, onlyPinned])

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
        url: draft.url,
        tags: draft.tags,
        pinned: draft.pinned
      }).then((note) => {
        setSaving(false)
        if (!note) return
        setSavedAt(Date.now())
        setDirty(false)
        // Un titre changé réécrit les liens des autres notes : on propose de
        // revenir en arrière tant que la trace est fraîche.
        if (draft.id && loadedTitle.current && loadedTitle.current !== note.title && note.linksUpdated) {
          setRenameUndo({ id: note.id, from: loadedTitle.current, updated: note.linksUpdated })
        }
        // Un fichier refusé garde son ancien lien : le dire vaut mieux que le
        // laisser croire que tout a suivi.
        if (note.linksFailed) {
          toast(
            note.linksFailed === 1
              ? 'Une note liée n’a pas pu être mise à jour.'
              : `${note.linksFailed} notes liées n’ont pas pu être mises à jour.`,
            'error'
          )
        }
        loadedTitle.current = note.title
        setDraft((current) => (current && !current.id ? { ...current, id: note.id } : current))
        void window.vela.notes.graph(note.id).then(setGraph).catch(() => undefined)
      })
    }, 600)
    return () => clearTimeout(timer)
  }, [draft?.title, draft?.body, draft?.tags, draft?.pinned, draft?.id, draft?.spaceId, draft?.url, dirty, saveNote])

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
        url: current.url,
        tags: current.tags,
        pinned: current.pinned
      })
    }
  }, [])

  useEffect(() => {
    let alive = true
    void window.vela.notes
      .highlights()
      .then((list) => {
        if (alive) setHighlights(list)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [activeUrl])

  const linkSuggestions = useMemo(
    () =>
      linkMenu && draft
        ? suggestNotes(
            (view?.notes ?? []).map((note) => ({ id: note.id, title: note.title })),
            linkMenu.query,
            draft.id
          )
        : [],
    [linkMenu, draft, view?.notes]
  )

  useEffect(() => {
    const id = draft?.id
    if (!id) {
      setGraph(null)
      return
    }
    let alive = true
    void window.vela.notes
      .graph(id)
      .then((next) => {
        if (alive) setGraph(next)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [draft?.id])

  useEffect(() => {
    if (!sketchOpen) return
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.fillStyle = '#fffdf9'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.strokeStyle = '#221f2e'
    context.lineWidth = 2.6
    context.lineCap = 'round'
    context.lineJoin = 'round'
  }, [sketchOpen])

  if (!view) return null

  const openNote = async (id: string): Promise<void> => {
    try {
      const note = await window.vela.notes.get(id)
      if (!note) return
      setDraft(draftFrom(note))
      setDirty(false)
      setPreview(false)
      setConfirming(false)
      setSavedAt(note.updatedAt)
      setAiMode(null)
      setRenameUndo(null)
      setLinkMenu(null)
      loadedTitle.current = note.title
      setGraph(await window.vela.notes.graph(note.id).catch(() => null))
    } catch {
      toast('Cette note est introuvable.', 'error')
    }
  }

  const newNote = (): void => {
    setDraft({
      title: '',
      body: '',
      spaceId: view.activeSpaceId,
      url: undefined,
      tags: tagFilter ? [tagFilter] : [],
      pinned: false
    })
    setDirty(false)
    setPreview(false)
    setConfirming(false)
    setSavedAt(null)
    setAiMode(null)
    setRenameUndo(null)
    setLinkMenu(null)
    setGraph(null)
    loadedTitle.current = ''
  }

  useEffect(() => {
    if (!voiceNoteRequest || !view) return
    setDraft({
      title: 'Note vocale',
      body: '',
      spaceId: voiceNoteSpaceId ?? view.activeSpaceId,
      url: undefined,
      tags: ['vocal'],
      pinned: false
    })
    setDirty(false)
    setPreview(false)
    setConfirming(false)
    setSavedAt(null)
    setAiMode(null)
    setRenameUndo(null)
    setLinkMenu(null)
    setGraph(null)
    loadedTitle.current = ''
    setRecorderOpen(true)
    consumeVoiceNoteRequest()
  }, [voiceNoteRequest])

  const capturePage = (): void => {
    if (!activeTab || !activeUrl) {
      toast('Ouvrez une page pour la capturer.', 'error')
      return
    }
    setDraft({
      title: activeTab.title || hostOf(activeUrl),
      body: `Source : [${activeTab.title || hostOf(activeUrl)}](${activeUrl})\n\n`,
      spaceId: view.activeSpaceId,
      url: activeUrl,
      tags: ['capture'],
      pinned: false
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

  const patchDraft = (patch: Partial<Draft>): void => {
    if (!draft) return
    setDraft({ ...draft, ...patch })
    setDirty(true)
  }

  const handleSelect = async (): Promise<void> => {
    await captureSelection()
    // La capture passe par le store : la liste se met à jour toute seule.
  }

  const highlightSelection = async (): Promise<void> => {
    try {
      const note = await window.vela.notes.highlight()
      if (!note) {
        toast('Sélectionnez un passage dans la page pour le surligner.', 'error')
        return
      }
      setHighlights(await window.vela.notes.highlights())
      toast('Passage surligné et ajouté à la note de la page.')
      if (!draft) setDraft(draftFrom(note))
    } catch {
      toast('Surlignage impossible.', 'error')
    }
  }

  const togglePin = async (note: NoteMeta): Promise<void> => {
    try {
      await window.vela.notes.patch({ id: note.id, pinned: !note.pinned })
      if (draft?.id === note.id) setDraft({ ...draft, pinned: !note.pinned })
    } catch {
      toast('Épinglage non enregistré.', 'error')
    }
  }

  const toggleDraftPin = (): void => {
    if (!draft) return
    patchDraft({ pinned: !draft.pinned })
  }

  const addTag = (): void => {
    if (!draft) return
    const tag = tagDraft.trim().replace(/^#+/, '').slice(0, 24)
    if (!tag) return
    if (draft.tags.some((entry) => entry.toLowerCase() === tag.toLowerCase())) {
      setTagDraft('')
      return
    }
    patchDraft({ tags: [...draft.tags, tag].slice(0, 8) })
    setTagDraft('')
  }

  const removeTag = (tag: string): void => {
    if (!draft) return
    patchDraft({ tags: draft.tags.filter((entry) => entry !== tag) })
  }

  /** Insère du Markdown au curseur, ou autour de la sélection. */
  const insertMarkdown = (before: string, after = '', options: { block?: boolean } = {}): void => {
    if (!draft) return
    const area = textareaRef.current
    const start = area?.selectionStart ?? draft.body.length
    const end = area?.selectionEnd ?? draft.body.length
    const selected = draft.body.slice(start, end)
    const chunk = options.block ? `\n${before}${selected}${after}\n` : `${before}${selected}${after}`
    const body = `${draft.body.slice(0, start)}${chunk}${draft.body.slice(end)}`
    setDraft({ ...draft, body })
    setDirty(true)
    setPreview(false)
    requestAnimationFrame(() => {
      if (!area) return
      area.focus()
      const caret = start + chunk.length
      area.setSelectionRange(caret, caret)
    })
  }

  const prefixLines = (prefix: string): void => {
    if (!draft) return
    const area = textareaRef.current
    const start = area?.selectionStart ?? 0
    const end = area?.selectionEnd ?? 0
    const selected = draft.body.slice(start, end) || ''
    const block = selected
      .split('\n')
      .map((line) => `${prefix}${line}`)
      .join('\n')
    insertMarkdown(block || prefix)
  }

  /** Met à jour l'autocomplétion d'après le curseur, ou la ferme. */
  const updateLinkMenu = (body: string, caret: number | null): void => {
    if (caret === null) {
      setLinkMenu(null)
      return
    }
    const query = linkQueryAt(body, caret)
    setLinkMenu(query ? { query: query.query, index: 0 } : null)
  }

  /** Remplace `[[frappe` par un lien complet vers la note choisie. */
  const applyLinkSuggestion = (title: string): void => {
    if (!draft) return
    const area = textareaRef.current
    const caret = area?.selectionStart ?? draft.body.length
    const result = completeLink(draft.body, caret, title)
    setDraft({ ...draft, body: result.body })
    setDirty(true)
    setPreview(false)
    setLinkMenu(null)
    requestAnimationFrame(() => {
      if (!area) return
      area.focus()
      area.setSelectionRange(result.caret, result.caret)
    })
  }

  /** Crée la note manquante d'un lien, puis l'ouvre. */
  const createLinkedNote = async (title: string): Promise<void> => {
    if (!draft) return
    try {
      const note = await window.vela.notes.save({
        title: title.slice(0, 160),
        body: `# ${title}\n\n`,
        spaceId: draft.spaceId
      })
      toast(`Note « ${title} » créée.`)
      await openNote(note.id)
    } catch {
      toast('Cette note n’a pas pu être créée.', 'error')
    }
  }

  const undoRename = async (): Promise<void> => {
    if (!renameUndo) return
    try {
      const result = await window.vela.notes.rename({ id: renameUndo.id, title: renameUndo.from })
      if (!result) throw new Error('note absente')
      loadedTitle.current = result.note.title
      setDraft((current) => (current && current.id === result.note.id ? { ...current, title: result.note.title } : current))
      setRenameUndo(null)
      toast('Renommage annulé, liens rétablis.')
      void window.vela.notes.graph(result.note.id).then(setGraph).catch(() => undefined)
    } catch {
      toast('Le renommage n’a pas pu être annulé.', 'error')
    }
  }

  const noteLinks: NoteLinkContext | undefined = draft
    ? {
        resolve: (title) => {
          const found = findNoteByTitle(
            (view.notes ?? []).map((note) => ({ id: note.id, title: note.title })),
            title
          )
          return found ? { id: found.id, title: found.title } : null
        },
        open: (id) => void openNote(id),
        create: (title) => void createLinkedNote(title)
      }
    : undefined

  const noteAudio: NoteAudioContext | undefined = draft
    ? {
        remove: (name) => {
          setDraft((current) => (current ? { ...current, body: removeAudioToken(current.body, name) } : current))
          setDirty(true)
        },
        transcribe: (_name, text) => {
          setDraft((current) =>
            current ? { ...current, body: `${current.body.trimEnd()}\n\n> ${text}\n` } : current
          )
          setDirty(true)
          setPreview(true)
          toast('Transcription ajoutée à la note.')
        },
        error: (message) => toast(message, 'error')
      }
    : undefined

  const runAi = async (action: NoteAiAction): Promise<void> => {
    if (!draft) return
    if (!draft.body.trim()) {
      toast('Écrivez d’abord quelques lignes.', 'error')
      return
    }
    setAiBusy(action)
    try {
      const result = await window.vela.notes.ai({
        action,
        body: draft.body,
        title: draft.title,
        url: draft.url
      })
      if (!result.text) throw new Error('Réponse vide')
      setDraft({
        ...draft,
        body: result.text,
        tags: draft.tags.includes('ia') ? draft.tags : [...draft.tags, 'ia']
      })
      setDirty(true)
      setPreview(true)
      setAiMode(result.mode)
      toast(result.mode === 'demo' ? 'Note réécrite en mode démo (aucun modèle configuré).' : 'Note réécrite par le modèle.')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Le modèle n’a pas répondu.', 'error')
    } finally {
      setAiBusy(null)
    }
  }

  const generateNote = async (): Promise<void> => {
    setAiBusy('generate')
    try {
      const result = await window.vela.notes.ai({ action: 'generate' })
      if (!result.text) throw new Error('Réponse vide')
      const title = activeTab?.title ? `Note — ${activeTab.title}` : 'Note générée'
      const note = await saveNote({
        title: title.slice(0, 160),
        body: result.text,
        spaceId: view.activeSpaceId,
        url: activeUrl,
        tags: ['ia'],
        pinned: false
      })
      if (note) {
        setDraft(draftFrom(note))
        setSavedAt(note.updatedAt)
        setDirty(false)
        setPreview(true)
        setAiMode(result.mode)
        toast(result.mode === 'demo' ? 'Note générée en mode démo (aucun modèle configuré).' : 'Note générée par le modèle.')
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Génération impossible.', 'error')
    } finally {
      setAiBusy(null)
    }
  }

  const dropCapture = async (event: React.DragEvent<HTMLElement>): Promise<void> => {
    event.preventDefault()
    setDropping(false)
    let raw = ''
    const file = event.dataTransfer.files?.[0]
    if (file) {
      try {
        raw = await file.text()
      } catch {
        raw = ''
      }
    }
    if (!raw.trim()) raw = event.dataTransfer.getData('text/plain')
    if (!raw.trim()) return
    const parsed = parseDroppedExcerpt(raw)
    const source = parsed.url && /^https?:/i.test(parsed.url) ? parsed.url : undefined
    const label = parsed.title ? parsed.title.slice(0, 80) : source ? hostOf(source) : 'page'
    const note = await saveNote({
      title: `Extrait — ${label}`.slice(0, 160),
      body: `${parsed.body}\n\n${source ? `Source : [${label}](${source}) — ${new Date().toLocaleDateString('fr-FR')}\n` : ''}`,
      spaceId: view.activeSpaceId,
      url: source,
      tags: ['extrait'],
      pinned: false
    })
    if (note) {
      setDraft(draftFrom(note))
      setDirty(false)
      setSavedAt(note.updatedAt)
      setPreview(false)
      setAiMode(null)
      toast(source ? 'Extrait déposé, source conservée.' : 'Extrait déposé dans les notes.')
    }
  }

  const startDraw = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height
    drawing.current = { active: true, x, y }
    canvas.setPointerCapture(event.pointerId)
  }

  const moveDraw = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    const state = drawing.current
    if (!canvas || !context || !state?.active) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height
    context.beginPath()
    context.moveTo(state.x, state.y)
    context.lineTo(x, y)
    context.stroke()
    drawing.current = { active: true, x, y }
  }

  const endDraw = (): void => {
    drawing.current = null
  }

  const insertSketch = (): void => {
    const canvas = canvasRef.current
    if (!canvas || !draft) return
    const dataUrl = canvas.toDataURL('image/png')
    insertMarkdown(`\n\n![Croquis](${dataUrl})\n\n`)
    setSketchOpen(false)
    toast('Croquis inséré dans la note.')
  }

  const pageNote = activeUrl ? view.notes.find((note) => note.url === activeUrl) : undefined

  return (
    <aside
      className="notes-drawer"
      aria-label="Notes"
      style={{ width, flexBasis: width }}
      data-dropping={dropping}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files') && !event.dataTransfer.types.includes('text/plain')) return
        event.preventDefault()
        setDropping(true)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        setDropping(false)
      }}
      onDrop={(event) => void dropCapture(event)}
    >
      <div
        className="notes-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionner les notes"
        onPointerDown={(event) => {
          event.preventDefault()
          const startX = event.clientX
          const startWidth = width
          const move = (moveEvent: PointerEvent): void => {
            const next = Math.min(760, Math.max(320, startWidth + (startX - moveEvent.clientX)))
            setWidth(next)
          }
          const up = (): void => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
            document.body.style.cursor = ''
            setWidth((current) => {
              window.localStorage.setItem('vela-notes-width', String(current))
              return current
            })
          }
          document.body.style.cursor = 'col-resize'
          window.addEventListener('pointermove', move)
          window.addEventListener('pointerup', up)
        }}
      />

      <header className="notes-head">
        <div className="notes-title">
          <span className="notes-mark">
            <Icon name="notes" size={15} />
          </span>
          <div>
            <h2>Notes</h2>
            <p>
              {view.notes.length} note{view.notes.length > 1 ? 's' : ''} · Markdown local
            </p>
          </div>
        </div>
        <div className="notes-head-actions">
          <button type="button" className="icon-btn" onClick={newNote} title="Nouvelle note" aria-label="Nouvelle note">
            <Icon name="plus" size={16} />
          </button>
          <button type="button" className="icon-btn" onClick={close} title="Fermer (Échap)" aria-label="Fermer les notes">
            <Icon name="close" size={16} />
          </button>
        </div>
      </header>

      {dropping && (
        <div className="notes-drop" aria-hidden="true">
          <Icon name="download" size={18} />
          <span>Déposez pour créer un extrait</span>
          <small>La source et le titre de la page sont conservés</small>
        </div>
      )}

      {draft ? (
        <div className="note-editor">
          <div className="note-editor-head">
            <button type="button" className="icon-btn" onClick={() => setDraft(null)} title="Retour aux notes" aria-label="Retour aux notes">
              <Icon name="back" size={16} />
            </button>
            <input
              className="note-title-input"
              aria-label="Titre de la note"
              value={draft.title}
              placeholder="Titre de la note"
              onChange={(event) => patchDraft({ title: event.target.value })}
            />
            <button
              type="button"
              className="icon-btn"
              onClick={toggleDraftPin}
              aria-pressed={draft.pinned}
              data-active={draft.pinned}
              title={draft.pinned ? 'Désépingler' : 'Épingler en tête'}
            >
              <Icon name="star" size={15} filled={draft.pinned} />
            </button>
            <button
              type="button"
              className="icon-btn danger"
              onClick={() => void removeDraft()}
              title={confirming ? 'Cliquer à nouveau pour confirmer' : 'Supprimer la note'}
              data-confirming={confirming}
              aria-label="Supprimer la note"
            >
              <Icon name={confirming ? 'warning' : 'trash'} size={15} />
            </button>
          </div>

          {(draft.url || draft.tags.length > 0) && (
            <div className="note-meta-row">
              {draft.url && (
                <span className="note-source">
                  <Icon name="globe" size={12} />
                  <span>{hostOf(draft.url)}</span>
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => patchDraft({ url: undefined })}
                    title="Détacher la source"
                  >
                    Détacher
                  </button>
                </span>
              )}
              <div className="note-tags editor">
                {draft.tags.map((tag) => (
                  <span className="note-tag" key={tag}>
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)} aria-label={`Retirer l’étiquette ${tag}`}>
                      ×
                    </button>
                  </span>
                ))}
                <input
                  className="note-tag-input"
                  value={tagDraft}
                  onChange={(event) => setTagDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ',') {
                      event.preventDefault()
                      addTag()
                    }
                    if (event.key === 'Backspace' && !tagDraft && draft.tags.length > 0) {
                      removeTag(draft.tags[draft.tags.length - 1])
                    }
                  }}
                  placeholder="+ étiquette"
                  aria-label="Ajouter une étiquette"
                />
              </div>
            </div>
          )}

          <div className="note-toolbar" role="toolbar" aria-label="Mise en forme">
            <button type="button" className="note-tool" onClick={() => insertMarkdown('## ')} title="Titre de section">
              H2
            </button>
            <button type="button" className="note-tool" onClick={() => insertMarkdown('**', '**')} title="Gras">
              <b>B</b>
            </button>
            <button type="button" className="note-tool" onClick={() => prefixLines('- ')} title="Liste à puces">
              <Icon name="list" size={14} />
            </button>
            <button type="button" className="note-tool" onClick={() => prefixLines('- [ ] ')} title="Liste de tâches">
              <Icon name="check" size={14} />
            </button>
            <button type="button" className="note-tool" onClick={() => insertMarkdown('```\n', '\n```', { block: true })} title="Bloc de code">
              <Icon name="code" size={14} />
            </button>
            <button type="button" className="note-tool" onClick={() => insertMarkdown('[', '](https://)')} title="Lien">
              <Icon name="link" size={14} />
            </button>
            <button
              type="button"
              className="note-tool"
              onClick={() => {
                // On n'insère que l'ouverture : le titre choisi complète le lien.
                insertMarkdown('[[')
                setLinkMenu({ query: '', index: 0 })
              }}
              title="Lien vers une note ([[)"
            >
              <span className="note-tool-brackets">[[ ]]</span>
            </button>
            <button
              type="button"
              className="note-tool"
              onClick={() => setRecorderOpen(true)}
              title="Enregistrer une note vocale"
              aria-label="Enregistrer une note vocale"
            >
              <Icon name="mic" size={14} />
            </button>
            <button type="button" className="note-tool" onClick={() => setSketchOpen(true)} title="Insérer un croquis">
              <Icon name="edit" size={14} />
            </button>
            {activeUrl && (
              <button
                type="button"
                className="note-tool"
                onClick={() => void highlightSelection()}
                title="Surligner la sélection de la page et l’ajouter ici"
              >
                <Icon name="sparkles" size={14} />
              </button>
            )}
          </div>

          <div className="note-ai-row">
            <span className="note-ai-label">
              <Icon name="sparkles" size={12} /> IA
            </span>
            {AI_ACTIONS.map((action) => (
              <button
                key={action.id}
                type="button"
                className="note-ai"
                onClick={() => void runAi(action.id)}
                disabled={aiBusy !== null}
                title={action.hint}
              >
                {aiBusy === action.id ? '…' : action.label}
              </button>
            ))}
          </div>

          {linkMenu && (
            <div className="note-link-menu" role="listbox" aria-label="Liens vers une note">
              <p className="note-link-menu-head">
                <Icon name="notes" size={12} /> Lien vers une note
              </p>
              {linkSuggestions.map((note, index) => (
                <button
                  key={note.id}
                  type="button"
                  role="option"
                  aria-selected={linkMenu.index === index}
                  className="note-link-option"
                  data-active={linkMenu.index === index}
                  onMouseEnter={() => setLinkMenu({ ...linkMenu, index })}
                  onClick={() => applyLinkSuggestion(note.title)}
                >
                  {note.title}
                </button>
              ))}
              {linkMenu.query.trim() && (
                <button
                  type="button"
                  role="option"
                  aria-selected={linkSuggestions.length === 0}
                  className="note-link-option"
                  data-active={linkSuggestions.length === 0}
                  onClick={() => applyLinkSuggestion(linkMenu.query)}
                >
                  <Icon name="plus" size={12} /> Lier « {linkMenu.query.trim()} »
                </button>
              )}
              <span className="note-link-hint">Entrée pour insérer · Échap pour fermer</span>
            </div>
          )}

          <div className="note-modes">
            <button type="button" className="seg" data-active={!preview} onClick={() => setPreview(false)}>
              Écrire
            </button>
            <button type="button" className="seg" data-active={preview} onClick={() => setPreview(true)}>
              Aperçu
            </button>
            <span className="note-saved" role="status">
              {aiBusy
                ? aiBusy === 'generate'
                  ? 'Génération…'
                  : 'Réécriture…'
                : saving
                  ? 'Enregistrement…'
                  : dirty
                    ? 'Modifié'
                    : savedAt
                      ? `Enregistré · ${timeAgo(savedAt)}`
                      : 'Brouillon'}
            </span>
          </div>

          {aiMode === 'demo' && !aiBusy && (
            <p className="note-ai-note">Repli local : aucun modèle n’est configuré (Réglages › Modèles).</p>
          )}

          {renameUndo && (
            <div className="note-rename-undo" role="status">
              <span>
                <Icon name="link" size={12} /> Liens mis à jour dans {renameUndo.updated} note
                {renameUndo.updated > 1 ? 's' : ''}
              </span>
              <button type="button" className="text-btn" onClick={() => void undoRename()}>
                Annuler
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setRenameUndo(null)}
                aria-label="Ignorer la modification des liens"
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          )}

          {preview ? (
            <div className="note-preview">
              {draft.body.trim() ? (
                <Markdown text={draft.body} links={noteLinks} audio={noteAudio} />
              ) : (
                <p className="note-empty-preview">Rien à prévisualiser.</p>
              )}
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              className="note-textarea"
              aria-label="Texte de la note"
              value={draft.body}
              placeholder="Écrivez en Markdown, glissez un extrait depuis la page, ou liez une note avec [[Titre]]."
              spellCheck
              onChange={(event) => {
                const value = event.target.value
                patchDraft({ body: value })
                updateLinkMenu(value, event.target.selectionStart)
              }}
              onClick={(event) => updateLinkMenu(draft.body, event.currentTarget.selectionStart)}
              onKeyDown={(event) => {
                if (!linkMenu) return
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setLinkMenu(null)
                  return
                }
                const count = linkSuggestions.length
                if (count === 0) return
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setLinkMenu({ ...linkMenu, index: (linkMenu.index + 1) % count })
                  return
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setLinkMenu({ ...linkMenu, index: (linkMenu.index - 1 + count) % count })
                  return
                }
                if (event.key === 'Enter' || event.key === 'Tab') {
                  event.preventDefault()
                  applyLinkSuggestion(linkSuggestions[linkMenu.index]?.title ?? linkMenu.query)
                }
              }}
            />
          )}

          {draft.id && graph && (graph.outgoing.length > 0 || graph.incoming.length > 0 || graph.missing.length > 0) && (
            <section className="note-links" data-open={linksOpen} aria-label="Notes liées">
              <button
                type="button"
                className="note-links-head"
                aria-expanded={linksOpen}
                onClick={() => setLinksOpen(!linksOpen)}
              >
                <Icon name={linksOpen ? 'chevron-down' : 'chevron-right'} size={12} />
                Notes liées
                <span className="note-links-count">
                  {graph.outgoing.length + graph.incoming.length + graph.missing.length}
                </span>
              </button>
              {linksOpen && (
                <div className="note-links-body">
                  {graph.outgoing.length > 0 && (
                    <div className="note-links-group">
                      <h3>Vers</h3>
                      <ul>
                        {graph.outgoing.map((ref) => (
                          <li key={`out-${ref.id}`}>
                            <button type="button" onClick={() => ref.id && void openNote(ref.id)}>
                              {ref.title}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {graph.incoming.length > 0 && (
                    <div className="note-links-group">
                      <h3>Citée par</h3>
                      <ul>
                        {graph.incoming.map((ref) => (
                          <li key={`in-${ref.id}`}>
                            <button type="button" onClick={() => ref.id && void openNote(ref.id)}>
                              {ref.title}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {graph.missing.length > 0 && (
                    <div className="note-links-group broken">
                      <h3>Liens cassés</h3>
                      <ul>
                        {graph.missing.map((title) => (
                          <li key={`missing-${title}`}>
                            <span>{title}</span>
                            <button type="button" className="text-btn" onClick={() => void createLinkedNote(title)}>
                              Créer la note
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          <footer className="note-foot">
            <span>
              {draft.body.length} caractères · {draft.body.split(/\s+/).filter(Boolean).length} mots
            </span>
            <button type="button" className="text-btn" onClick={() => void window.vela.notes.openFolder()}>
              <Icon name="folder" size={13} />
              Dossier
            </button>
          </footer>
        </div>
      ) : (
        <div className="notes-list-wrap">
          <div className="notes-search">
            <Icon name="search" size={14} />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Rechercher une note, un tag…"
              aria-label="Rechercher dans les notes"
            />
            {filter && (
              <button type="button" className="icon-btn" onClick={() => setFilter('')} aria-label="Effacer la recherche">
                <Icon name="close" size={13} />
              </button>
            )}
          </div>

          <div className="notes-filters" role="group" aria-label="Filtres des notes">
            <button type="button" className="notes-filter" data-active={!onlyPinned && !tagFilter} onClick={() => { setOnlyPinned(false); setTagFilter(null) }}>
              Toutes
            </button>
            <button type="button" className="notes-filter" data-active={onlyPinned} onClick={() => setOnlyPinned(!onlyPinned)}>
              <Icon name="star" size={11} /> Épinglées
            </button>
            {allTags.map(([tag, count]) => (
              <button
                key={tag}
                type="button"
                className="notes-filter"
                data-active={tagFilter === tag}
                onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
              >
                {tag}
                <span className="notes-filter-count">{count}</span>
              </button>
            ))}
          </div>

          <div className="notes-actions">
            <button type="button" className="action wide" onClick={newNote}>
              <Icon name="plus" size={14} />
              Nouvelle note
            </button>
            <button
              type="button"
              className="action wide"
              onClick={() => {
                if (!activeUrl || aiBusy !== null) return
                void generateNote()
              }}
              // `aria-disabled` plutôt que `disabled` : un bouton réellement
              // désactivé ne montre pas son info-bulle et sort du clavier.
              aria-disabled={aiBusy !== null || !activeUrl}
              title={
                !activeUrl
                  ? 'Ouvrez une page pour la synthèse'
                  : aiBusy !== null
                    ? 'Une rédaction est déjà en cours'
                    : 'Lire la page et rédiger une note structurée'
              }
            >
              <Icon name="sparkles" size={14} />
              {aiBusy === 'generate' ? 'Génération…' : 'Générer une note IA'}
            </button>
            <button
              type="button"
              className="action wide"
              onClick={() => {
                if (!activeUrl) return
                capturePage()
              }}
              aria-disabled={!activeUrl}
              title={activeUrl ? 'Garder le texte de la page affichée' : 'Ouvrez une page pour la capturer'}
            >
              <Icon name="globe" size={14} />
              Capturer la page
            </button>
            <button
              type="button"
              className="action wide"
              onClick={() => {
                if (!activeUrl) return
                void handleSelect()
              }}
              aria-disabled={!activeUrl}
              title={activeUrl ? 'Garder le passage sélectionné, avec sa source et sa date' : 'Ouvrez une page, sélectionnez un passage'}
            >
              <Icon name="copy" size={14} />
              Capturer la sélection
            </button>
            <button
              type="button"
              className="action wide"
              onClick={() => {
                if (!activeUrl) return
                void highlightSelection()
              }}
              aria-disabled={!activeUrl}
              title={activeUrl ? 'Surligner le passage sélectionné et l’ajouter à la note de la page' : 'Ouvrez une page, sélectionnez un passage'}
            >
              <Icon name="edit" size={14} />
              Surligner la sélection
            </button>
          </div>

          {highlights.length > 0 && (
            <div className="notes-highlight-strip">
              <span>
                <Icon name="sparkles" size={12} /> {highlights.length} surlignage{highlights.length > 1 ? 's' : ''} sur cette page
              </span>
              {pageNote && (
                <button type="button" className="text-btn" onClick={() => void openNote(pageNote.id)}>
                  Ouvrir la note
                </button>
              )}
            </div>
          )}

          <div className="notes-scroll">
            {notes.length === 0 && (
              <div className="notes-empty">
                <span className="notes-empty-mark">
                  <Icon name="notes" size={20} />
                </span>
                <p>
                  {filter || tagFilter || onlyPinned
                    ? 'Aucune note ne correspond.'
                    : 'Aucune note pour l’instant.'}
                </p>
                <span>Glissez un passage depuis la page, ou écrivez à côté d’elle.</span>
              </div>
            )}

            {notes.map((note) => {
              const noteSpace = view.spaces.find((item) => item.id === note.spaceId)
              return (
                <div
                  key={note.id}
                  className="note-card"
                  data-pinned={note.pinned}
                  role="button"
                  tabIndex={0}
                  onClick={() => void openNote(note.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      void openNote(note.id)
                    }
                  }}
                >
                  <div className="note-card-top">
                    <span className="note-space-dot" style={{ background: noteSpace?.color ?? 'var(--muted)' }} />
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
                        void togglePin(note)
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
                      {(note.tags?.length ?? 0) > 3 && <span className="note-tag more">+{(note.tags?.length ?? 0) - 3}</span>}
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
            <span>{space ? `Espace ${space.name}` : 'Vela'} · fichiers .md</span>
            <button type="button" className="text-btn" onClick={() => void window.vela.notes.openFolder()}>
              <Icon name="folder" size={13} />
              Ouvrir le dossier
            </button>
          </footer>
        </div>
      )}

      {recorderOpen && draft && (
        <NoteRecorder
          spaceId={draft.spaceId}
          onInsert={(token) => {
            insertMarkdown(`\n\n${token}\n\n`)
            setPreview(true)
          }}
          onClose={() => setRecorderOpen(false)}
          onError={(message) => toast(message, 'error')}
        />
      )}

      {sketchOpen && (
        <div className="note-sketch" role="dialog" aria-modal="true" aria-label="Croquis">
          <div className="note-sketch-card">
            <header>
              <strong>Croquis</strong>
              <button type="button" className="icon-btn" onClick={() => setSketchOpen(false)} aria-label="Fermer le croquis">
                <Icon name="close" size={15} />
              </button>
            </header>
            <canvas
              ref={canvasRef}
              width={640}
              height={360}
              onPointerDown={startDraw}
              onPointerMove={moveDraw}
              onPointerUp={endDraw}
              onPointerCancel={endDraw}
              aria-label="Zone de dessin"
            />
            <footer>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  const canvas = canvasRef.current
                  const context = canvas?.getContext('2d')
                  if (!canvas || !context) return
                  context.fillStyle = '#fffdf9'
                  context.fillRect(0, 0, canvas.width, canvas.height)
                }}
              >
                Effacer
              </button>
              <button type="button" className="ghost-btn" onClick={() => setSketchOpen(false)}>
                Annuler
              </button>
              <button type="button" className="action" onClick={insertSketch}>
                <Icon name="check" size={13} /> Insérer
              </button>
            </footer>
          </div>
        </div>
      )}
    </aside>
  )
}
