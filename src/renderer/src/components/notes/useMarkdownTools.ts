import { useMemo, useState } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { completeLink, linkQueryAt, suggestNotes } from '@shared/noteLinks'
import type { NoteMeta } from '@shared/types'
import type { Draft } from './draft'

interface MarkdownToolsOptions {
  draft: Draft | null
  setDraft: Dispatch<SetStateAction<Draft | null>>
  setDirty(value: boolean): void
  setPreview(value: boolean): void
  textareaRef: RefObject<HTMLTextAreaElement | null>
  notes: NoteMeta[]
}

/** Insertion au curseur, préfixes de ligne et complétion des liens `[[…]]`. */
export function useMarkdownTools({
  draft,
  setDraft,
  setDirty,
  setPreview,
  textareaRef,
  notes
}: MarkdownToolsOptions) {
  const [linkMenu, setLinkMenu] = useState<{ query: string; index: number } | null>(null)

  const linkSuggestions = useMemo(
    () =>
      linkMenu && draft
        ? suggestNotes(
            notes.map((note) => ({ id: note.id, title: note.title })),
            linkMenu.query,
            draft.id
          )
        : [],
    [linkMenu, draft, notes]
  )

  /** Insère du Markdown au curseur, ou autour de la sélection. */
  const insertMarkdown = (before: string, after = '', options: { block?: boolean } = {}): void => {
    if (!draft) return
    const area = textareaRef.current
    const start = area?.selectionStart ?? draft.body.length
    const end = area?.selectionEnd ?? draft.body.length
    const selected = draft.body.slice(start, end)
    const chunk = options.block
      ? `\n${before}${selected}${after}\n`
      : `${before}${selected}${after}`
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

  return {
    linkMenu,
    setLinkMenu,
    linkSuggestions,
    insertMarkdown,
    prefixLines,
    updateLinkMenu,
    applyLinkSuggestion
  }
}
