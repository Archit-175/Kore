'use client'

import { useEffect, useRef, useState } from 'react'
import type { NoteBoardActions } from '@/lib/notes/types'
import { NOTE_COLOR_CLASSES } from '@/lib/notes/colors'
import { LabelIcon, PlusIcon } from './icons'

/** Dropdown to toggle workspace labels on a note + inline-create a new one. */
export function LabelPicker({
  noteId,
  appliedLabelIds,
  actions,
}: {
  noteId: string
  appliedLabelIds: string[]
  actions: NoteBoardActions
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const applied = new Set(appliedLabelIds)
  const filtered = actions.labels.filter((l) =>
    l.name.toLowerCase().includes(query.trim().toLowerCase()),
  )
  const exactExists = actions.labels.some(
    (l) => l.name.toLowerCase() === query.trim().toLowerCase(),
  )

  async function handleCreate() {
    const name = query.trim()
    if (!name) return
    const label = await actions.createLabel(name, 'default')
    if (label) actions.addLabel(noteId, label.id)
    setQuery('')
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Labels"
        aria-label="Labels"
        className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
      >
        <LabelIcon />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-56 rounded-lg border border-border bg-background p-2 shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find or create label"
            className="mb-1 w-full rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-indigo-500"
          />
          <div className="max-h-48 overflow-y-auto">
            {filtered.map((label) => (
              <label
                key={label.id}
                className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-black/5 dark:hover:bg-white/5"
              >
                <input
                  type="checkbox"
                  checked={applied.has(label.id)}
                  onChange={(e) =>
                    e.target.checked
                      ? actions.addLabel(noteId, label.id)
                      : actions.removeLabel(noteId, label.id)
                  }
                />
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${NOTE_COLOR_CLASSES[label.color].swatch}`}
                />
                <span className="truncate">{label.name}</span>
              </label>
            ))}
          </div>
          {query.trim() && !exactExists && (
            <button
              type="button"
              onClick={handleCreate}
              className="mt-1 flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-sm text-indigo-600 hover:bg-indigo-500/10 dark:text-indigo-300"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Create &ldquo;{query.trim()}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  )
}
