'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { pageHref } from '@/lib/docs/types'
import { globalSearch, type SearchKind, type SearchResult } from '@/lib/search/search'

const KIND_LABEL: Record<SearchKind, string> = {
  note: 'Notes',
  page: 'Pages',
  database: 'Databases',
  whiteboard: 'Whiteboards',
  message: 'Chat',
}
const KIND_ICON: Record<SearchKind, string> = {
  note: '🗒',
  page: '📄',
  database: '🗄',
  whiteboard: '🎨',
  message: '💬',
}

function hrefFor(r: SearchResult): string {
  switch (r.kind) {
    case 'page':
      return r.projectId ? pageHref(r.projectId, r.id) : '/'
    case 'database':
      return r.projectId ? `/p/${r.projectId}/db/${r.id}` : '/'
    case 'whiteboard':
      return r.projectId ? `/p/${r.projectId}/wb/${r.id}` : '/'
    case 'note':
      return '/notes'
    case 'message':
      return `/chat#msg-${r.id}`
  }
}

/**
 * Topbar search: a REAL inline input with a results dropdown anchored beneath it
 * (cross-module Postgres search via `globalSearch`). ⌘K / Ctrl+K focuses it.
 * Replaces the old pill-that-opened-a-centered-modal (which read as a confusing
 * "second" search box).
 */
export function GlobalSearch({ workspaceId }: { workspaceId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  // ⌘K / Ctrl+K focuses + selects the input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Close the dropdown on outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Debounced search. All setState happens inside the timeout (never synchronously
  // in the effect body) so a keystroke never triggers a cascading render.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    const q = query.trim()
    debounce.current = setTimeout(
      async () => {
        if (!q) {
          setResults([])
          setActive(0)
          setLoading(false)
          return
        }
        setLoading(true)
        const res = await globalSearch(supabase, workspaceId, q)
        setResults(res)
        setActive(0)
        setLoading(false)
      },
      q ? 200 : 0,
    )
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [query, supabase, workspaceId])

  // Keep the active row visible.
  useEffect(() => {
    document.getElementById(`kore-search-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const go = (r: SearchResult | undefined) => {
    if (!r) return
    setOpen(false)
    setQuery('')
    router.push(hrefFor(r))
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(results[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      if (query) setQuery('')
      else {
        setOpen(false)
        inputRef.current?.blur()
      }
    }
  }

  const showDropdown = open && query.trim().length > 0

  return (
    <div ref={rootRef} className="relative w-full max-w-xs">
      <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm transition focus-within:border-indigo-400">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-neutral-400"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search…"
          className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-neutral-400"
          aria-label="Search workspace"
        />
        <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-neutral-400 sm:inline">
          ⌘K
        </kbd>
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-background py-1 shadow-xl">
          {!loading && results.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-neutral-400">No results.</p>
          )}
          {loading && results.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-neutral-400">Searching…</p>
          )}
          {results.map((r, i) => {
            const prevKind = i > 0 ? results[i - 1].kind : null
            return (
              <div key={`${r.kind}-${r.id}-${i}`}>
                {r.kind !== prevKind && (
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                    {KIND_LABEL[r.kind]}
                  </p>
                )}
                <button
                  id={`kore-search-${i}`}
                  type="button"
                  onClick={() => go(r)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left ${
                    i === active
                      ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-200'
                      : 'hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  <span className="shrink-0 text-base">{KIND_ICON[r.kind]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {r.title?.trim() || 'Untitled'}
                    </span>
                    {r.snippet && (
                      <span className="block truncate text-xs text-neutral-400">{r.snippet}</span>
                    )}
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
