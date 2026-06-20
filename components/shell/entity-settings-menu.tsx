'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import type { ActionState } from '@/lib/actions/workspace'

/**
 * A small "⋯" menu for renaming or deleting an entity (team / project).
 * Rename is inline; delete asks for confirmation. Authorization is enforced
 * server-side in the actions + RLS — `canDelete` only gates the UI affordance.
 */
export function EntitySettingsMenu({
  id,
  name,
  label,
  renameAction,
  deleteAction,
  canDelete,
  cascadeWarning,
}: {
  id: string
  name: string
  label: 'team' | 'project'
  renameAction: (id: string, name: string) => Promise<ActionState>
  deleteAction: (id: string) => Promise<unknown>
  canDelete: boolean
  cascadeWarning?: string
}) {
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [value, setValue] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setRenaming(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const submitRename = () => {
    setError(null)
    start(async () => {
      const res = await renameAction(id, value)
      if (res?.error) {
        setError(res.error)
        return
      }
      setRenaming(false)
      setOpen(false)
    })
  }

  const confirmDelete = () => {
    const msg = cascadeWarning
      ? `Delete this ${label}?\n\n${cascadeWarning}\n\nThis cannot be undone.`
      : `Delete this ${label}? This cannot be undone.`
    if (!window.confirm(msg)) return
    start(async () => {
      await deleteAction(id)
    })
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        aria-label={`${label} options`}
        onClick={() => {
          setOpen((v) => !v)
          setRenaming(false)
        }}
        className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 transition hover:bg-black/5 hover:text-neutral-700 dark:hover:bg-white/10 dark:hover:text-neutral-200"
      >
        ⋯
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-border bg-surface p-1 shadow-lg">
          {renaming ? (
            <div className="p-1.5">
              <input
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitRename()
                  if (e.key === 'Escape') setRenaming(false)
                }}
                placeholder={`${label === 'team' ? 'Team' : 'Project'} name`}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
              />
              {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenaming(false)}
                  className="rounded px-2 py-1 text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitRename}
                  disabled={pending || !value.trim()}
                  className="rounded bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setValue(name)
                  setError(null)
                  setRenaming(true)
                }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-neutral-700 transition hover:bg-black/5 dark:text-neutral-200 dark:hover:bg-white/5"
              >
                ✏️ Rename
              </button>
              {canDelete && (
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={pending}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-red-600 transition hover:bg-red-500/10 disabled:opacity-60"
                >
                  🗑 Delete {label}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
