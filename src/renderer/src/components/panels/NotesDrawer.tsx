import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { NoteAiAction } from '@shared/api'
import { parseDroppedExcerpt } from '@shared/noteDrop'
import { findNoteByTitle, removeAudioToken, type NoteGraph } from '@shared/noteLinks'
import { matchesSearch, normalizeSearchText, parseSearchQuery } from '@shared/search'
import type { NoteMeta, PageHighlight, TrashedNote } from '@shared/types'
import { hostOf, isHomeUrl } from '@shared/url'
import type { NoteAudioContext, NoteLinkContext } from '../../lib/markdown'
import type { NotesSort } from '../../store/types'
import { useBrowser } from '../../store/browser'
import { Icon } from '../Icon'
import NoteRecorder from '../NoteRecorder'
import NoteActions from '../notes/NoteActions'
import NoteEditor from '../notes/NoteEditor'
import NoteSketch from '../notes/NoteSketch'
import NoteTemplatePicker from '../notes/NoteTemplatePicker'
import NotesHead from '../notes/NotesHead'
import TrashPanel from '../notes/TrashPanel'
import NotesList from '../notes/NotesList'
import { draftFrom, type Draft } from '../notes/draft'
import type { NoteTemplate } from '../notes/templates'
import { aiActionForEvent } from '../notes/aiActions'
import { useMarkdownTools } from '../notes/useMarkdownTools'
import { useNoteAi } from '../notes/useNoteAi'
import { useSketch } from '../notes/useSketch'

export default function NotesDrawer() {
  const view = useBrowser((state) => state.view)
  const notesOpen = useBrowser((state) => state.notesOpen)
  const toggleNotes = useBrowser((state) => state.toggleNotes)
  const newTab = useBrowser((state) => state.newTab)
  const saveNote = useBrowser((state) => state.saveNote)
  const deleteNote = useBrowser((state) => state.deleteNote)
  const captureSelection = useBrowser((state) => state.captureSelection)
  const voiceNoteRequest = useBrowser((state) => state.voiceNoteRequest)
  const voiceNoteSpaceId = useBrowser((state) => state.voiceNoteSpaceId)
  const consumeVoiceNoteRequest = useBrowser((state) => state.consumeVoiceNoteRequest)
  const noteRequest = useBrowser((state) => state.noteRequest)
  const consumeNoteRequest = useBrowser((state) => state.consumeNoteRequest)
  const notesSearchRequest = useBrowser((state) => state.notesSearchRequest)
  const consumeNotesSearchRequest = useBrowser((state) => state.consumeNotesSearchRequest)
  const toast = useBrowser((state) => state.toast)

  const [draft, setDraft] = useState<Draft | null>(null)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [onlyPinned, setOnlyPinned] = useState(false)
  const [sort, setSort] = useState<NotesSort>(() =>
    window.localStorage.getItem('vela-notes-sort') === 'title' ? 'title' : 'updated'
  )
  const [preview, setPreview] = useState(false)
  const [searchHit, setSearchHit] = useState('')
  const [searchFocusNonce, setSearchFocusNonce] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const [dropping, setDropping] = useState(false)
  const [highlights, setHighlights] = useState<PageHighlight[]>([])
  const [graph, setGraph] = useState<NoteGraph | null>(null)
  const [linksOpen, setLinksOpen] = useState(true)
  const [renameUndo, setRenameUndo] = useState<{ id: string; from: string; updated: number } | null>(null)
  const [recorderOpen, setRecorderOpen] = useState(false)
  const loadedTitle = useRef('')
  // Vue large : liste et éditeur côte à côte. Le choix et la dernière largeur
  // simple sont mémorisés pour retrouver le même tiroir au prochain passage.
  const [wide, setWide] = useState(() => window.localStorage.getItem('vela-notes-wide') === 'true')
  const [templateOpen, setTemplateOpen] = useState(false)
  const [contentHits, setContentHits] = useState<{ query: string; ids: string[] } | null>(null)
  const [trash, setTrash] = useState<TrashedNote[]>([])
  const [trashOpen, setTrashOpen] = useState(false)
  const [trashBusy, setTrashBusy] = useState(false)
  const narrowWidth = useRef(400)
  // La dernière note ouverte est relue au montage : l'effet qui nettoie la
  // clé quand aucun brouillon n'est ouvert ne doit pas l'effacer avant.
  const lastNoteId = useRef<string | null>(window.localStorage.getItem('vela-notes-last'))
  const restoredLastNote = useRef(false)
  const [width, setWidth] = useState(() => {
    const stored = Number(window.localStorage.getItem('vela-notes-width'))
    const base = Number.isFinite(stored) && stored >= 300 && stored <= 760 ? stored : 400
    return window.localStorage.getItem('vela-notes-wide') === 'true'
      ? Math.min(760, Math.max(base, 660))
      : base
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
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  // Le brouillon courant est recopié dans une référence lue au démontage :
  // l'écriture se fait après le rendu, jamais pendant.
  useEffect(() => {
    latest.current = { draft, dirty }
  }, [draft, dirty])

  const draftId = draft?.id
  const hasDraft = draft !== null

  useEffect(() => {
    if (draftId) window.localStorage.setItem('vela-notes-last', draftId)
  }, [draftId])

  useEffect(() => {
    if (!hasDraft) window.localStorage.removeItem('vela-notes-last')
  }, [hasDraft])

  const refreshTrash = useCallback(async (): Promise<void> => {
    try {
      setTrash(await window.vela.notes.trash())
    } catch {
      // Corbeille indisponible : la liste précédente reste affichée.
    }
  }, [])

  useEffect(() => {
    // La lecture passe après le rendu : l'état ne se met pas à jour dans le
    // corps de l'effet (même règle que les surlignages plus bas).
    queueMicrotask(() => void refreshTrash())
  }, [refreshTrash])

  // Le corps des notes n'est pas dans la liste : une frappe un peu posée
  // demande au stockage quels fichiers contiennent le texte.
  useEffect(() => {
    const query = filter.trim()
    if (query.length < 2) {
      queueMicrotask(() => setContentHits(null))
      return
    }
    let alive = true
    const timer = setTimeout(() => {
      void window.vela.notes
        .search(query)
        .then((ids) => {
          if (alive) setContentHits({ query, ids })
        })
        .catch(() => undefined)
    }, 180)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [filter])

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
    const query = filter.trim()
    const parsed = parseSearchQuery(query)
    const filtering = parsed.include.length > 0 || parsed.exclude.length > 0
    const bodyIds = contentHits?.query === query ? new Set(contentHits.ids) : null
    return list
      .filter((note) => (onlyPinned ? note.pinned : true))
      .filter((note) => (tagFilter ? (note.tags ?? []).includes(tagFilter) : true))
      .filter((note) => {
        if (!filtering) return true
        // Le stockage lit aussi le corps : ses identifiants font foi dès qu'ils
        // sont disponibles, notamment pour les exclusions.
        if (bodyIds) return bodyIds.has(note.id)
        return matchesSearch(
          `${note.title} ${note.preview} ${(note.tags ?? []).join(' ')}`,
          parsed
        )
      })
      .slice()
      .sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) ||
          (sort === 'title'
            ? a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' })
            : b.updatedAt - a.updatedAt)
      )
  }, [view?.notes, filter, tagFilter, onlyPinned, sort, contentHits])

  const changeSort = (value: NotesSort): void => {
    setSort(value)
    window.localStorage.setItem('vela-notes-sort', value)
  }

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
    async (id: string, highlight = ''): Promise<void> => {
      try {
        // Rien ne doit rester dans le minuteur de la note qu'on quitte.
        await flushPending()
        const note = await window.vela.notes.get(id)
        if (!note) return
        setTemplateOpen(false)
        draftVersion.current += 1
        setDraft(draftFrom(note))
        setDirty(false)
        // Une note ouverte depuis les résultats s'ouvre sur le passage trouvé.
        const parsed = parseSearchQuery(highlight)
        const body = normalizeSearchText(note.body)
        const hit = parsed.include.some((term) => body.includes(term)) ? highlight.trim() : ''
        setSearchHit(hit)
        setPreview(Boolean(hit))
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

  /** Ramène la liste au premier plan et place le curseur dans la recherche. */
  const focusSearch = useCallback((): void => {
    if (draft && !wide) {
      // En vue simple, l'éditeur masque la liste : on enregistre les frappes
      // en attente, puis on revient à la liste avant de donner le focus.
      void flushPending().then(() => {
        setDraft(null)
        setDirty(false)
        setPreview(false)
        setSearchHit('')
        setSearchFocusNonce((value) => value + 1)
      })
      return
    }
    setSearchFocusNonce((value) => value + 1)
  }, [draft, wide, flushPending])

  /** Ouvre le résultat suivant de la liste filtrée, avec bouclage. */
  const advanceSearch = useCallback((): void => {
    const query = filter.trim()
    if (!query) {
      focusSearch()
      return
    }
    if (notes.length === 0) return
    const current = draftId ? notes.findIndex((note) => note.id === draftId) : -1
    const next = current < 0 ? 0 : (current + 1) % notes.length
    void openNote(notes[next].id, query)
  }, [draftId, filter, focusSearch, notes, openNote])

  useEffect(() => {
    if (!notesSearchRequest) return
    consumeNotesSearchRequest()
    queueMicrotask(() => {
      if (notesSearchRequest.mode === 'next') advanceSearch()
      else focusSearch()
    })
  }, [notesSearchRequest, consumeNotesSearchRequest, advanceSearch, focusSearch])

  // Le focus attend le rendu de la liste, notamment après le retour depuis
  // l'éditeur en vue simple.
  useEffect(() => {
    if (!searchFocusNonce) return
    searchInputRef.current?.focus()
    searchInputRef.current?.select()
  }, [searchFocusNonce])

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

  // Au démarrage, la vue large rouvre la note qui était ouverte. Une note
  // demandée par la palette ou une note vocale reste prioritaire.
  useEffect(() => {
    if (restoredLastNote.current || !view) return
    restoredLastNote.current = true
    if (!wide || noteRequest || voiceNoteRequest || hasDraft) return
    const id = lastNoteId.current
    if (!id) return
    // La note a pu être supprimée ou déplacée dans la corbeille entre-temps.
    if (!view.notes.some((note) => note.id === id)) {
      window.localStorage.removeItem('vela-notes-last')
      return
    }
    queueMicrotask(() => void openNote(id))
  }, [view, wide, noteRequest, voiceNoteRequest, hasDraft, openNote])

  const patchDraft = (patch: Partial<Draft>): void => {
    if (!draft) return
    setDraft({ ...draft, ...patch })
    setDirty(true)
  }

  const toggleDraftPin = (): void => {
    if (!draft) return
    patchDraft({ pinned: !draft.pinned })
  }

  const copyDraft = async (): Promise<void> => {
    if (!draft?.body.trim()) return
    try {
      await navigator.clipboard.writeText(draft.body)
      toast('Note copiée en Markdown.')
    } catch {
      toast('Copie impossible.', 'error')
    }
  }

  // Raccourcis de l'éditeur. Le gestionnaire reste stable pendant la frappe :
  // il lit une référence remplie après chaque rendu avec les actions du moment.
  const shortcutState = useRef<{
    active: boolean
    draft: Draft | null
    notes: NoteMeta[]
    aiBusy: boolean
    pin(): void
    copy(): void
    open(id: string): void
    ai(action: NoteAiAction): void
  }>({
    active: false,
    draft: null,
    notes: [],
    aiBusy: false,
    pin: () => undefined,
    copy: () => undefined,
    open: () => undefined,
    ai: () => undefined
  })

  useEffect(() => {
    if (!view) return
    shortcutState.current = {
      active: notesOpen && !templateOpen && !trashOpen && !recorderOpen && !sketchOpen,
      draft,
      notes,
      aiBusy: aiBusy !== null,
      pin: toggleDraftPin,
      copy: () => void copyDraft(),
      open: (id) => void openNote(id, filter.trim()),
      ai: (action) => void runAi(action)
    }
  })

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const state = shortcutState.current
      if (!state.active || !state.draft) return
      if (event.defaultPrevented || event.isComposing) return
      if (!(event.metaKey || event.ctrlKey)) return
      const key = event.key.toLowerCase()
      if (event.shiftKey && !event.altKey && key === 'p') {
        event.preventDefault()
        state.pin()
        return
      }
      if (event.shiftKey && !event.altKey && key === 'c') {
        event.preventDefault()
        state.copy()
        return
      }
      if (event.altKey && !event.shiftKey) {
        const action = aiActionForEvent(event)
        if (action) {
          event.preventDefault()
          if (!state.aiBusy) state.ai(action)
          return
        }
      }
      if (event.altKey && !event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault()
        if (state.notes.length === 0) return
        const current = state.draft.id
          ? state.notes.findIndex((note) => note.id === state.draft?.id)
          : -1
        const step = event.key === 'ArrowDown' ? 1 : -1
        const next =
          current < 0
            ? step > 0
              ? 0
              : state.notes.length - 1
            : (current + step + state.notes.length) % state.notes.length
        state.open(state.notes[next].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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

  const newNote = async (template?: NoteTemplate | null): Promise<void> => {
    await flushPending()
    draftVersion.current += 1
    setDraft({
      title: template?.title ?? '',
      body: template?.body ?? '',
      spaceId: view.activeSpaceId,
      url: undefined,
      tags: template ? [...template.tags] : tagFilter ? [tagFilter] : [],
      pinned: false
    })
    // Un modèle est déjà du contenu : il doit être enregistré même sans frappe.
    setDirty(Boolean(template))
    setPreview(false)
    setSearchHit('')
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
    setSearchHit('')
    setConfirming(false)
    setSavedAt(null)
  }

  const close = (): void => {
    toggleNotes(false)
  }

  /** Bascule entre le tiroir simple et la vue à deux colonnes. */
  const toggleWide = (): void => {
    const next = !wide
    window.localStorage.setItem('vela-notes-wide', String(next))
    if (next) {
      narrowWidth.current = width
      setWidth(Math.min(760, Math.max(width, 660)))
    } else {
      setWidth(narrowWidth.current)
    }
    setWide(next)
  }

  /** Retour à la liste : la note en cours ne doit pas perdre ses frappes. */
  const backToList = async (): Promise<void> => {
    await flushPending()
    setDraft(null)
    setDirty(false)
    setPreview(false)
    setSearchHit('')
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
    await refreshTrash()
    setDraft(null)
    setDirty(false)
    setConfirming(false)
  }

  /** Remet une note de la corbeille dans la liste, depuis le panneau. */
  const restoreFromTrash = async (id: string): Promise<void> => {
    if (trashBusy) return
    setTrashBusy(true)
    try {
      const note = await window.vela.notes.restore(id)
      if (!note) {
        toast('Cette note n’a pas pu être restaurée.', 'error')
        return
      }
      await refreshTrash()
      toast(`« ${note.title} » restaurée.`)
    } catch {
      toast('Restauration impossible.', 'error')
    } finally {
      setTrashBusy(false)
    }
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
      if (!draft) {
        setDraft(draftFrom(note))
        setSearchHit('')
      }
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

  /** Une copie indépendante : même contenu, mêmes étiquettes, sans l'identité. */
  const duplicateDraft = async (): Promise<void> => {
    if (!draft) return
    await flushPending()
    const title = `${draft.title.trim() || 'Note sans titre'} (copie)`
    const note = await saveNote({
      title: title.slice(0, 160),
      body: draft.body,
      spaceId: draft.spaceId,
      url: draft.url,
      tags: draft.tags,
      pinned: false
    })
    if (!note) return
    draftVersion.current += 1
    setDraft(draftFrom(note))
    setDirty(false)
    setSavedAt(note.updatedAt)
    setPreview(false)
    setConfirming(false)
    loadedTitle.current = note.title
    setGraph(null)
    toast('Note dupliquée.')
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
      setSearchHit('')
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
      onNew={() => setTemplateOpen(true)}
      onGenerate={() => void generateNote()}
      onCapture={() => void capturePage()}
      onSelect={() => void handleSelect()}
      onHighlight={() => void highlightSelection()}
    />
  )

  const listPane = (
    <NotesList
      notes={notes}
      spaces={view.spaces}
      filter={filter}
      onFilter={setFilter}
      searchInputRef={searchInputRef}
      onNext={advanceSearch}
      tagFilter={tagFilter}
      onTagFilter={setTagFilter}
      onlyPinned={onlyPinned}
      onOnlyPinned={setOnlyPinned}
      sort={sort}
      onSort={changeSort}
      allTags={allTags}
      highlights={highlights}
      pageNote={pageNote}
      hasPage={Boolean(activeUrl)}
      noNotes={noNotes}
      spaceName={space?.name}
      onOpen={(id) => void openNote(id, filter.trim())}
      onTogglePin={(note) => void togglePin(note)}
      trashCount={trash.length}
      onTrash={() => {
        setTrashOpen(true)
        void refreshTrash()
      }}
      renderActions={renderActions}
    />
  )

  const editorPane = draft ? (
    <NoteEditor
      draft={draft}
      confirming={confirming}
      saving={saving}
      dirty={dirty}
      savedAt={savedAt}
      preview={preview}
      highlight={searchHit}
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
      onCopy={() => void copyDraft()}
      onDuplicate={() => void duplicateDraft()}
      onOpenSource={(url) => newTab(url)}
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
  ) : null

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
        onWidth={(value) => setWidth(wide ? Math.max(560, value) : value)}
        onCommitWidth={() =>
          setWidth((current) => {
            window.localStorage.setItem('vela-notes-width', String(current))
            return current
          })
        }
        noteCount={view.notes.length}
        wide={wide}
        onToggleWide={toggleWide}
        onNew={() => setTemplateOpen(true)}
        onClose={close}
      />

      {dropping && (
        <div className="notes-drop" aria-hidden="true">
          <Icon name="download" size={18} />
          <span>Déposez pour créer un extrait</span>
          <small>La source et le titre de la page sont conservés</small>
        </div>
      )}

      {wide && (draft || !noNotes) ? (
        <div className="notes-wide">
          <div className="notes-wide-list">{listPane}</div>
          <div className="notes-wide-editor">
            {editorPane ?? (
              <div className="notes-wide-empty">
                <span className="notes-wide-mark">
                  <Icon name="notes" size={18} />
                </span>
                <p>Choisissez une note</p>
                <small>La liste reste à gauche, l’éditeur s’ouvre ici.</small>
              </div>
            )}
          </div>
        </div>
      ) : (
        (editorPane ?? listPane)
      )}

      {trashOpen && (
        <TrashPanel
          notes={trash}
          busy={trashBusy}
          onRestore={(id) => void restoreFromTrash(id)}
          onClose={() => setTrashOpen(false)}
        />
      )}

      {templateOpen && (
        <NoteTemplatePicker
          onPick={(template) => {
            setTemplateOpen(false)
            void newNote(template)
          }}
          onClose={() => setTemplateOpen(false)}
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
