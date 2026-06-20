'use client'

// Placeholder for Phase 1 — wired up for real in a later phase.
export function GlobalSearch() {
  return (
    <button
      type="button"
      disabled
      title="Search (coming soon)"
      className="flex h-9 w-full max-w-xs items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm text-neutral-400 dark:text-neutral-500"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <span className="flex-1 text-left">Search…</span>
      <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] sm:inline">
        ⌘K
      </kbd>
    </button>
  )
}
