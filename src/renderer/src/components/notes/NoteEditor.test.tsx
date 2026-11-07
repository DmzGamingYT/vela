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
      onPatch={vi.fn()}
      onTogglePin={vi.fn()}
      onRemove={vi.fn()}
      onCopy={vi.fn()}
      onDuplicate={vi.fn()}
      onOpenSource={vi.fn()}
      onTagDraft={vi.fn()}
      onAddTag={vi.fn()}
      onRemoveTag={vi.fn()}
      onInsert={vi.fn()}
      onPrefix={vi.fn()}
      onRecorder={vi.fn()}
      onSketch={vi.fn()}
      onHighlight={vi.fn()}
      onRunAi={onRunAi}
      onUndoRename={vi.fn()}
      onDismissRename={vi.fn()}
      onPreview={vi.fn()}
      onLinkMenu={vi.fn()}
      onApplyLink={vi.fn()}
      onUpdateLink={vi.fn()}
      onToggleLinks={vi.fn()}
      onOpenNote={vi.fn()}
      onCreateLinked={vi.fn()}
    />
  )
  return { ...view, onRunAi }
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(cleanup)

describe('menu IA', () => {
  it('remonte la dernière action secondaire et la marque', () => {
    const { onRunAi } = setup()

    fireEvent.click(screen.getByRole('button', { name: /Plus/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Corriger/ }))
    expect(onRunAi).toHaveBeenCalledWith('correct')
    expect(window.localStorage.getItem('vela-notes-ai-last-secondary')).toBe('correct')

    fireEvent.click(screen.getByRole('button', { name: /Plus/ }))
    const first = screen.getAllByRole('menuitem')[0]
    expect(within(first).getByText('Corriger')).toBeTruthy()
    expect(within(first).getByText('Dernière')).toBeTruthy()
    expect(first.getAttribute('data-last')).toBe('true')
  })

  it('retrouve la dernière action après un remontage', () => {
    const first = setup()
    fireEvent.click(screen.getByRole('button', { name: /Plus/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Embellir/ }))
    first.unmount()

    setup()
    fireEvent.click(screen.getByRole('button', { name: /Plus/ }))
    expect(screen.getAllByRole('menuitem')[0].textContent).toContain('Embellir')
  })
})
