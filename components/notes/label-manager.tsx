'use client'

import { useState } from 'react'
import type { NoteBoardActions } from '@/lib/notes/types'
import { NOTE_COLOR_CLASSES } from '@/lib/notes/colors'
import { ColorPicker } from './color-picker'
import { CloseIcon, PlusIcon, TrashIcon } from './icons'

/** Workspace-wide label admin dialog: create, rename, recolor, delete (owner). */
export function LabelManager({
  actions,
  onClose,
}: {
  actions: NoteBoardActions
  onClose: () => void
}) {
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    const name = newName.trim()
    if (!name) return
    setError(null)
    const label = await actions.createLabel(name, 'default')
    if (!label) setError('Could not create label (maybe it already exists).')
    else setNewName('')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 sm:items-center"
      onMouseDown={onClose}
    >
      <div
        className="mt-12 w-full max-w-sm rounded-xl border border-border bg-background p-4 shadow-xl sm:mt-0"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Edit labels</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="mb-3 flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="New label"
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
          />
          <button
            type="button"
            onClick={handleCreate}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-600 text-white transition hover:bg-indigo-500"
            aria-label="Create label"
          >
            <PlusIcon />
          </button>
        </div>
        {error && <p className="mb-2 text-xs text-red-500">{error}</p>}

        <div className="max-h-72 space-y-2 overflow-y-auto">
          {actions.labels.length === 0 && (
            <p className="py-4 text-center text-xs text-neutral-400">No labels yet.</p>
          )}
          {actions.labels.map((label) => (
            <div key={label.id} className="rounded-lg border border-border p-2">
              <div className="flex items-center gap-2">
                <span
                  className={`h-3 w-3 shrink-0 rounded-full ${NOTE_COLOR_CLASSES[label.color].swatch}`}
                />
                <input
                  defaultValue={label.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (v && v !== label.name) actions.renameLabel(label.id, v)
                  }}
                  className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm outline-none hover:border-border focus:border-indigo-500"
                />
                {actions.isOwner && (
                  <button
                    type="button"
                    onClick={() => actions.deleteLabel(label.id)}
                    aria-label={`Delete ${label.name}`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-neutral-400 hover:bg-red-500/10 hover:text-red-500"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="mt-2 pl-5">
                <ColorPicker value={label.color} onChange={(c) => actions.recolorLabel(label.id, c)} />
              </div>
            </div>
          ))}
        </div>
        {!actions.isOwner && (
          <p className="mt-2 text-[11px] text-neutral-400">
            Only the workspace owner can delete labels.
          </p>
        )}
      </div>
    </div>
  )
}
