'use client'

import type { NotesView } from '@/lib/notes/types'
import { GridIcon, ListIcon } from './icons'

export function ViewToggle({
  view,
  onChange,
}: {
  view: NotesView
  onChange: (view: NotesView) => void
}) {
  return (
    <div className="flex items-center rounded-md border border-border p-0.5">
      <button
        type="button"
        onClick={() => onChange('grid')}
        aria-label="Grid view"
        aria-pressed={view === 'grid'}
        className={`flex h-7 w-7 items-center justify-center rounded transition ${
          view === 'grid'
            ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300'
            : 'text-neutral-500 hover:text-foreground'
        }`}
      >
        <GridIcon />
      </button>
      <button
        type="button"
        onClick={() => onChange('list')}
        aria-label="List view"
        aria-pressed={view === 'list'}
        className={`flex h-7 w-7 items-center justify-center rounded transition ${
          view === 'list'
            ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300'
            : 'text-neutral-500 hover:text-foreground'
        }`}
      >
        <ListIcon />
      </button>
    </div>
  )
}
