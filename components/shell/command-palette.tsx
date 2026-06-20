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

export function CommandPalette({
  workspaceId,
  onClose,
}: {
  workspaceId: string
  onClose: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    const q = query.trim()
    // All setState happens inside the (async) timeout — never synchronously in
    // the effect body — so a keystroke never triggers a cascading render.
    debounce.current = setTimeout(async () => {
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
    }, q ? 200 : 0)
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [query, supabase, workspaceId])

  const go = (r: SearchResult | undefined) => {
    if (!r) return
    onClose()
    router.push(hrefFor(r))
  }

  // Keep the active row visible.
  useEffect(() => {
    document.getElementById(`kore-search-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(results[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <svg
            width="16"
            height="16"
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
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search notes, pages, databases, whiteboards, chat…"
            className="flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-neutral-400"
          />
          <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-neutral-400 sm:inline">
            Esc
          </kbd>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {query.trim() && !loading && results.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-neutral-400">No results.</p>
          )}
          {loading && results.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-neutral-400">Searching…</p>
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
      </div>
    </div>
  )
}
