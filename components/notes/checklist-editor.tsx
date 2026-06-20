'use client'

import { useState } from 'react'
import type { BoardNote, NoteBoardActions } from '@/lib/notes/types'
import { CloseIcon, PlusIcon } from './icons'

/** Editable checklist for a note (used inside the editor modal). */
export function ChecklistEditor({
  note,
  actions,
}: {
  note: BoardNote
  actions: NoteBoardActions
}) {
  const [draft, setDraft] = useState('')
  const items = [...note.checklist].sort((a, b) => a.position - b.position)

  function addItem() {
    const text = draft.trim()
    if (!text) return
    void actions.addChecklistItem(note.id, text)
    setDraft('')
  }

  return (
    <div className="space-y-1">
      {items.map((item) => (
        <div key={item.id} className="group flex items-center gap-2">
          <input
            type="checkbox"
            checked={item.checked}
            onChange={(e) => actions.toggleChecklistItem(note.id, item.id, e.target.checked)}
            className="h-4 w-4 shrink-0"
          />
          <input
            defaultValue={item.text}
            onBlur={(e) => {
              const v = e.target.value
              if (v !== item.text) actions.editChecklistItem(note.id, item.id, v)
            }}
            className={`w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm outline-none hover:border-border focus:border-indigo-500 ${
              item.checked ? 'text-neutral-400 line-through' : ''
            }`}
          />
          <button
            type="button"
            onClick={() => actions.deleteChecklistItem(note.id, item.id)}
            aria-label="Delete item"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-400 opacity-0 transition hover:bg-black/5 hover:text-foreground group-hover:opacity-100 dark:hover:bg-white/10"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <PlusIcon className="h-4 w-4 shrink-0 text-neutral-400" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addItem()
            }
          }}
          onBlur={addItem}
          placeholder="List item"
          className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm outline-none hover:border-border focus:border-indigo-500"
        />
      </div>
    </div>
  )
}
