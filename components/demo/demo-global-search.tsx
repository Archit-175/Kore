'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useDemo } from '@/lib/demo/context'
import { pageHref, pageDisplayTitle } from '@/lib/docs/types'
import { dbHref, rowTitle } from '@/lib/databases/types'
import { wbHref } from '@/lib/whiteboards/types'
import { noteTab } from '@/lib/notes/types'

type Hit = { kind: string; icon: string; label: string; sub: string; href: string }

/** In-memory ⌘K search across the demo store — no RPC, no network. Mirrors the
 *  real inline topbar search dropdown. */
export function DemoGlobalSearch() {
  const store = useDemo()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [])

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const out: Hit[] = []
    const push = (h: Hit) => out.length < 12 && out.push(h)

    for (const n of store.notes) {
      if (n.trashedAt) continue
      if (`${n.title} ${n.content}`.toLowerCase().includes(q))
        push({ kind: 'Note', icon: '🗒', label: n.title || 'Untitled note', sub: n.content, href: '/demo/notes' })
    }
    for (const p of store.pages) {
      if (p.trashedAt) continue
      if (p.title.toLowerCase().includes(q))
        push({ kind: 'Page', icon: p.icon ?? '📄', label: pageDisplayTitle(p.title), sub: 'Doc', href: `/demo${pageHref(p.projectId, p.id)}` })
    }
    for (const proj of store.projects) {
      for (const db of store.listDatabases(proj.id)) {
        const agg = store.getDatabase(db.id)
        if (!agg) continue
        if (db.name.toLowerCase().includes(q))
          push({ kind: 'Database', icon: db.icon ?? '🗃', label: db.name, sub: 'Database', href: `/demo${dbHref(proj.id, db.id)}` })
        for (const r of agg.rows) {
          const t = rowTitle(r, agg.properties)
          if (t.toLowerCase().includes(q))
            push({ kind: 'Row', icon: '•', label: t, sub: db.name, href: `/demo${dbHref(proj.id, db.id)}` })
        }
      }
    }
    for (const w of store.whiteboards) {
      if (w.trashedAt) continue
      if (w.title.toLowerCase().includes(q))
        push({ kind: 'Whiteboard', icon: w.icon ?? '🎨', label: w.title, sub: 'Whiteboard', href: `/demo${wbHref(w.projectId, w.id)}` })
    }
    for (const m of store.chat) {
      if (m.body.toLowerCase().includes(q))
        push({ kind: 'Message', icon: '💬', label: m.authorName, sub: m.body, href: '/demo/chat' })
    }
    return out
  }, [query, store])

  // reference noteTab so the notes filter stays consistent if extended later
  void noteTab

  return (
    <div ref={ref} className="relative w-full max-w-md">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search  ⌘K"
        className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
      />
      {open && query.trim() && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-96 overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
          {hits.length === 0 ? (
            <p className="px-3 py-3 text-sm text-neutral-400">No results for “{query.trim()}”.</p>
          ) : (
            hits.map((h, i) => (
              <Link
                key={i}
                href={h.href}
                onClick={() => {
                  setOpen(false)
                  setQuery('')
                }}
                className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
              >
                <span className="w-5 shrink-0 text-center">{h.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{h.label}</span>
                  <span className="block truncate text-xs text-neutral-400">{h.sub}</span>
                </span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-neutral-400">{h.kind}</span>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  )
}
