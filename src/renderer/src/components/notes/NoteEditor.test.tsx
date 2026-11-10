// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NoteGraph } from '@shared/noteLinks'
import NoteEditor from './NoteEditor'
import type { Draft } from './draft'

const draft: Draft = {
  title: 'Note',
  body: 'Un texte à travailler.',
  spaceId: 'space-1',
  tags: [],
  pinned: false
}

const graph: NoteGraph = { outgoing: [], incoming: [], missing: [] }

function setup() {
  const onRunAi = vi.fn()
  const onPatch = vi.fn()
  const onInsert = vi.fn()
  const onTogglePin = vi.fn()
  const onPreview = vi.fn()
  const view = render(
    <NoteEditor
      draft={draft}
      confirming={false}
      saving={false}
      dirty={false}
      savedAt={null}
      preview={false}
      highlight=""
      aiBusy={null}
      aiMode={null}
      renameUndo={null}
      tagDraft=""
      linkMenu={null}
      linkSuggestions={[]}
      graph={graph}
      linksOpen
      noteLinks={undefined}
      noteAudio={undefined}
      textareaRef={{ current: null }}
      hasPage={false}
      onBack={vi.fn()}
      onPatch={onPatch}
      onTogglePin={onTogglePin}
      onRemove={vi.fn()}
      onCopy={vi.fn()}
      onDuplicate={vi.fn()}
      onOpenSource={vi.fn()}
      onTagDraft={vi.fn()}
      onAddTag={vi.fn()}
      onRemoveTag={vi.fn()}
      onInsert={onInsert}
      onPrefix={vi.fn()}
      onRecorder={vi.fn()}
      onSketch={vi.fn()}
      onHighlight={vi.fn()}
      onRunAi={onRunAi}
      onUndoRename={vi.fn()}
      onDismissRename={vi.fn()}
      onPreview={onPreview}
      onLinkMenu={vi.fn()}
      onApplyLink={vi.fn()}
      onUpdateLink={vi.fn()}
      onToggleLinks={vi.fn()}
      onOpenNote={vi.fn()}
      onCreateLinked={vi.fn()}
    />
  )
  return { ...view, onRunAi, onPatch, onInsert, onTogglePin, onPreview }
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(cleanup)

describe('éditeur de note', () => {
  it('remonte les changements de titre et de corps au brouillon', () => {
    const { onPatch } = setup()

    fireEvent.change(screen.getByRole('textbox', { name: 'Titre de la note' }), {
      target: { value: 'Titre modifié' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Texte de la note' }), {
      target: { value: 'Corps modifié' }
    })

    expect(onPatch).toHaveBeenNthCalledWith(1, { title: 'Titre modifié' })
    expect(onPatch).toHaveBeenNthCalledWith(2, { body: 'Corps modifié' })
  })

  it('déclenche le formatage Markdown et expose l’action d’épinglage', () => {
    const { container, onInsert, onTogglePin } = setup()

    fireEvent.click(container.querySelector('.note-toolbar button[title="Gras"]')!)
    expect(onInsert).toHaveBeenCalledWith('**', '**')

    fireEvent.click(container.querySelector('[aria-keyshortcuts="Meta+Shift+P Control+Shift+P"]')!)
    expect(onTogglePin).toHaveBeenCalledOnce()
  })

  it('demande à afficher l’aperçu Markdown', () => {
    const { onPreview } = setup()

    fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }))
    expect(onPreview).toHaveBeenCalledWith(true)
  })
})

describe('menu IA', () => {
  it('remonte la dernière action secondaire et la marque', () => {
    const { onRunAi } = setup()

    fireEvent.click(screen.getByRole('button', { name: /Actions IA/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Corriger/ }))
    expect(onRunAi).toHaveBeenCalledWith('correct')
    expect(window.localStorage.getItem('vela-notes-ai-last-secondary')).toBe('correct')

    fireEvent.click(screen.getByRole('button', { name: /Actions IA/ }))
    const first = screen.getByRole('menuitem', { name: /Corriger/ })
    expect(within(first).getByText('Corriger')).toBeTruthy()
    expect(within(first).getByText('Dernière')).toBeTruthy()
    expect(first.getAttribute('data-last')).toBe('true')
  })

  it('retrouve la dernière action après un remontage', () => {
    const first = setup()
    fireEvent.click(screen.getByRole('button', { name: /Actions IA/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Embellir/ }))
    first.unmount()

    setup()
    fireEvent.click(screen.getByRole('button', { name: /Actions IA/ }))
    expect(screen.getAllByRole('menuitem')[0].textContent).toContain('Embellir')
  })
})
