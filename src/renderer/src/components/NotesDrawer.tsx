import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { parseDroppedExcerpt } from '@shared/noteDrop'
import { findNoteByTitle, removeAudioToken, type NoteGraph } from '@shared/noteLinks'
import type { NoteMeta, PageHighlight } from '@shared/types'
import { hostOf, isHomeUrl } from '@shared/url'
import type { NoteAudioContext, NoteLinkContext } from '../lib/markdown'
import { useBrowser } from '../store/browser'
import { Icon } from './Icon'
import NoteRecorder from './NoteRecorder'
import NoteActions from './notes/NoteActions'
import NoteEditor from './notes/NoteEditor'
import NoteSketch from './notes/NoteSketch'
import NotesHead from './notes/NotesHead'
import NotesList from './notes/NotesList'
import { draftFrom, type Draft } from './notes/draft'
import { useMarkdownTools } from './notes/useMarkdownTools'
import { useNoteAi } from './notes/useNoteAi'
import { useSketch } from './notes/useSketch'

export default function NotesDrawer() {
  const view = useBrowser((state) => state.view)
  const toggleNotes = useBrowser((state) => state.toggleNotes)
  const saveNote = useBrowser((state) => state.saveNote)
  const deleteNote = useBrowser((state) => state.deleteNote)
  const captureSelection = useBrowser((state) => state.captureSelection)
  const voiceNoteRequest = useBrowser((state) => state.voiceNoteRequest)
  const voiceNoteSpaceId = useBrowser((state) => state.voiceNoteSpaceId)
  const consumeVoiceNoteRequest = useBrowser((state) => state.consumeVoiceNoteRequest)
  const noteRequest = useBrowser((state) => state.noteRequest)
  const consumeNoteRequest = useBrowser((state) => state.consumeNoteRequest)
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
  const [dropping, setDropping] = useState(false)
  const [highlights, setHighlights] = useState<PageHighlight[]>([])
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
  // Identité de la note ouverte : une sauvegarde qui se termine après un
  // changement de note ne doit ni horodater ni marquer propre le nouveau
  // brouillon.
  const draftVersion = useRef(0)
  // Sauvegarde différée en attente : on garde le minuteur et l'instantané du
  // brouillon pour pouvoir vider la file avant de changer de note.
  const pendingSave = useRef<{ timer: ReturnType<typeof setTimeout>; draft: Draft } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Le brouillon courant est recopié dans une référence lue au démontage :
  // l'écriture se fait après le rendu, jamais pendant.
  useEffect(() => {
    latest.current = { draft, dirty }
  }, [draft, dirty])

  const activeTab = view?.tabs.find((tab) => tab.id === view.activeTabId)
  const activeUrl = activeTab && !isHomeUrl(activeTab.url) ? activeTab.url : undefined
  const space = view?.spaces.find((item) => item.id === view.activeSpaceId)

  const {
    linkMenu,
    setLinkMenu,
    linkSuggestions,
    insertMarkdown,
    prefixLines,
    updateLinkMenu,
    applyLinkSuggestion
  } = useMarkdownTools({
    draft,
    setDraft,
    setDirty,
    setPreview,
    textareaRef,
    notes: view?.notes ?? []
  })

  const { aiBusy, aiMode, setAiMode, runAi, generateNote } = useNoteAi({
    draft,
    setDraft,
    setDirty,
    setPreview,
    setSavedAt,
    saveNote,
    activeTitle: activeTab?.title,
    activeUrl,
    spaceId: view?.activeSpaceId ?? '',
    toast
  })

  const { sketchOpen, setSketchOpen, canvasRef, startDraw, moveDraw, endDraw, insertSketch } =
    useSketch({ hasDraft: Boolean(draft), insertMarkdown, toast })

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

  /**
   * Enregistre un brouillon. Le même chemin sert à la sauvegarde différée et
   * au vidage avant changement de note : deux implémentations divergeraient.
   */
  const persistDraft = useCallback(
    async (current: Draft): Promise<void> => {
      if (!current.title.trim() && !current.body.trim()) return
      const version = draftVersion.current
      setSaving(true)
      const note = await saveNote({
        id: current.id,
        title: current.title || 'Note sans titre',
        body: current.body,
        spaceId: current.spaceId,
        url: current.url,
        tags: current.tags,
        pinned: current.pinned
      })
      setSaving(false)
      if (!note) return
      // La note affichée a changé pendant l'écriture : le résultat concerne
      // l'ancienne, on ne touche à rien.
      if (draftVersion.current !== version) return
      // Un brouillon encore vierge d'identifiant reçoit celui de sa première
      // sauvegarde, même si l'utilisateur a continué à taper entre-temps.
      setDraft((active) => (active && !active.id && !current.id ? { ...active, id: note.id } : active))
      // Des frappes sont arrivées pendant l'enregistrement : la version
      // enregistrée n'est plus celle à l'écran, on laisse « Modifié ».
      if (latest.current.draft !== current) return
      setSavedAt(Date.now())
      setDirty(false)
      // Un titre changé réécrit les liens des autres notes : on propose de
      // revenir en arrière tant que la trace est fraîche.
      if (current.id && loadedTitle.current && loadedTitle.current !== note.title && note.linksUpdated) {
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
      void window.vela.notes.graph(note.id).then(setGraph).catch(() => undefined)
    },
    [saveNote, toast]
  )

  /** Vide tout de suite la sauvegarde différée, avant de quitter la note. */
  const flushPending = useCallback(async (): Promise<void> => {
    const pending = pendingSave.current
    if (!pending) return
    pendingSave.current = null
    clearTimeout(pending.timer)
    await persistDraft(pending.draft)
  }, [persistDraft])

  /**
   * Ouvre une note existante. Défini avant les effets : la palette peut
   * demander une note précise dès le premier rendu du tiroir.
   */
  const openNote = useCallback(
    async (id: string): Promise<void> => {
      try {
        // Rien ne doit rester dans le minuteur de la note qu'on quitte.
        await flushPending()
        const note = await window.vela.notes.get(id)
        if (!note) return
        draftVersion.current += 1
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
    },
    [flushPending, toast, setAiMode, setLinkMenu]
  )

  // Une commande de la palette a choisi une note : on l'ouvre vraiment.
  useEffect(() => {
    if (!noteRequest) return
    // `openNote` écrit le brouillon : on le lance hors du corps de l'effet, la
    // microtâche passant avant la peinture.
    queueMicrotask(() => {
      consumeNoteRequest()
      void openNote(noteRequest.id)
    })
  }, [noteRequest, consumeNoteRequest, openNote])

  useEffect(() => {
    if (!draft || !dirty) return
    if (!draft.title.trim() && !draft.body.trim()) return
    const snapshot = draft
    const timer = setTimeout(() => {
      if (pendingSave.current?.timer === timer) pendingSave.current = null
      void persistDraft(snapshot)
    }, 600)
    pendingSave.current = { timer, draft: snapshot }
    return () => {
      clearTimeout(timer)
      if (pendingSave.current?.timer === timer) pendingSave.current = null
    }
  }, [draft, dirty, persistDraft])

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

  useEffect(() => {
    const id = draft?.id
    if (!id) {
      queueMicrotask(() => setGraph(null))
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

  // Une note vocale demandée depuis le rail : le brouillon est créé une seule
  // fois par demande, hors du corps de l'effet (la microtâche passe avant la
  // peinture).
  const voiceSpaceTarget = voiceNoteSpaceId ?? view?.activeSpaceId
  useEffect(() => {
    if (!voiceNoteRequest) return
    queueMicrotask(() => {
      draftVersion.current += 1
      setDraft({
        title: 'Note vocale',
        body: '',
        spaceId: voiceSpaceTarget ?? '',
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
    })
  }, [voiceNoteRequest, voiceSpaceTarget, consumeVoiceNoteRequest, setAiMode, setLinkMenu])

  if (!view) return null

  const newNote = async (): Promise<void> => {
    await flushPending()
    draftVersion.current += 1
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

  const capturePage = async (): Promise<void> => {
    if (!activeTab || !activeUrl) {
      toast('Ouvrez une page pour la capturer.', 'error')
      return
    }
    await flushPending()
    draftVersion.current += 1
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

  /** Retour à la liste : la note en cours ne doit pas perdre ses frappes. */
  const backToList = async (): Promise<void> => {
    await flushPending()
    setDraft(null)
    setDirty(false)
    setPreview(false)
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

  const pageNote = activeUrl ? view.notes.find((note) => note.url === activeUrl) : undefined
  const noNotes = view.notes.length === 0

  // Une seule définition des cinq actions : dans la barre compacte quand il y a
  // des notes, dans la surface de départ quand le tiroir est encore vierge.
  const renderActions = (inEmpty = false) => (
    <NoteActions
      inEmpty={inEmpty}
      hasPage={Boolean(activeUrl)}
      generating={aiBusy === 'generate'}
      busy={aiBusy !== null}
      onNew={() => void newNote()}
      onGenerate={() => void generateNote()}
      onCapture={() => void capturePage()}
      onSelect={() => void handleSelect()}
      onHighlight={() => void highlightSelection()}
    />
  )

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
      <NotesHead
        width={width}
        onWidth={setWidth}
        onCommitWidth={() =>
          setWidth((current) => {
            window.localStorage.setItem('vela-notes-width', String(current))
            return current
          })
        }
        noteCount={view.notes.length}
        onNew={() => void newNote()}
        onClose={close}
      />

      {dropping && (
        <div className="notes-drop" aria-hidden="true">
          <Icon name="download" size={18} />
          <span>Déposez pour créer un extrait</span>
          <small>La source et le titre de la page sont conservés</small>
        </div>
      )}

      {draft ? (
        <NoteEditor
          draft={draft}
          confirming={confirming}
          saving={saving}
          dirty={dirty}
          savedAt={savedAt}
          preview={preview}
          aiBusy={aiBusy}
          aiMode={aiMode}
          renameUndo={renameUndo}
          tagDraft={tagDraft}
          linkMenu={linkMenu}
          linkSuggestions={linkSuggestions}
          graph={graph}
          linksOpen={linksOpen}
          noteLinks={noteLinks}
          noteAudio={noteAudio}
          textareaRef={textareaRef}
          hasPage={Boolean(activeUrl)}
          onBack={() => void backToList()}
          onPatch={patchDraft}
          onTogglePin={toggleDraftPin}
          onRemove={() => void removeDraft()}
          onTagDraft={setTagDraft}
          onAddTag={addTag}
          onRemoveTag={removeTag}
          onInsert={insertMarkdown}
          onPrefix={prefixLines}
          onRecorder={() => setRecorderOpen(true)}
          onSketch={() => setSketchOpen(true)}
          onHighlight={() => void highlightSelection()}
          onRunAi={(action) => void runAi(action)}
          onUndoRename={() => void undoRename()}
          onDismissRename={() => setRenameUndo(null)}
          onPreview={setPreview}
          onLinkMenu={setLinkMenu}
          onApplyLink={applyLinkSuggestion}
          onUpdateLink={updateLinkMenu}
          onToggleLinks={() => setLinksOpen(!linksOpen)}
          onOpenNote={(id) => void openNote(id)}
          onCreateLinked={(title) => void createLinkedNote(title)}
        />
      ) : (
        <NotesList
          notes={notes}
          spaces={view.spaces}
          filter={filter}
          onFilter={setFilter}
          tagFilter={tagFilter}
          onTagFilter={setTagFilter}
          onlyPinned={onlyPinned}
          onOnlyPinned={setOnlyPinned}
          allTags={allTags}
          highlights={highlights}
          pageNote={pageNote}
          noNotes={noNotes}
          spaceName={space?.name}
          onOpen={(id) => void openNote(id)}
          onTogglePin={(note) => void togglePin(note)}
          renderActions={renderActions}
        />
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
        <NoteSketch
          canvasRef={canvasRef}
          onClose={() => setSketchOpen(false)}
          onInsert={insertSketch}
          onPointerDown={startDraw}
          onPointerMove={moveDraw}
          onPointerEnd={endDraw}
        />
      )}
    </aside>
  )
}
