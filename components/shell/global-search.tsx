'use client'

import { useEffect, useState } from 'react'
import { CommandPalette } from './command-palette'

/** The topbar search affordance: a button that opens the ⌘K command palette
 *  (cross-module Postgres search). ⌘K / Ctrl+K toggles it from anywhere. */
export function GlobalSearch({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Search (⌘K)"
        className="flex h-9 w-full max-w-xs items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm text-neutral-400 transition hover:border-indigo-400 hover:text-neutral-500 dark:text-neutral-500"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <span className="flex-1 text-left">Search…</span>
        <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] sm:inline">
          ⌘K
        </kbd>
      </button>
      {open && <CommandPalette workspaceId={workspaceId} onClose={() => setOpen(false)} />}
    </>
  )
}
