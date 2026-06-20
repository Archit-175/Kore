'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { loadProjectPages } from '@/lib/docs/load-pages'
import { appendSort, buildTree, midpointSort, siblingsOf, subtreeIds } from '@/lib/docs/tree'
import { pageDisplayTitle, pageHref, type PageNode, type PageTreeNode } from '@/lib/docs/types'
import { createPage, movePage, renamePage, trashPage } from '@/lib/actions/pages'

type DropPos = 'before' | 'after' | 'inside'
type FlatRow = { node: PageTreeNode; depth: number; hasChildren: boolean }

function flatten(tree: PageTreeNode[], expanded: Set<string>, depth = 0): FlatRow[] {
  const out: FlatRow[] = []
  for (const n of tree) {
    const hasChildren = n.children.length > 0
    out.push({ node: n, depth, hasChildren })
    if (hasChildren && expanded.has(n.id)) out.push(...flatten(n.children, expanded, depth + 1))
  }
  return out
}

/**
 * The per-project nested page tree shown under each project in the sidebar.
 * Self-fetches its pages + subscribes to Postgres Changes (the notes-board
 * pattern) so create/rename/move/delete in any window appear live — which is
 * why the page Server Actions skip revalidatePath. Reorder/reparent is native
 * HTML5 drag-and-drop (no extra dependency); the server re-validates the cycle
 * guard that subtreeIds() pre-checks here.
 */
export function ProjectPagesTree({
  projectId,
  workspaceId,
  onNavigate,
}: {
  projectId: string
  workspaceId: string
  onNavigate?: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  // Unique per mount so navigation/HMR never reuses a still-closing channel.
  const channelId = useId().replace(/[^a-zA-Z0-9]/g, '')
  const router = useRouter()
  const pathname = usePathname()

  const [pages, setPages] = useState<PageNode[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ id: string; over: string | null; pos: DropPos } | null>(null)
  const [creating, setCreating] = useState(false)

  const tree = useMemo(() => buildTree(pages), [pages])
  const rows = useMemo(() => flatten(tree, expanded), [tree, expanded])

  // --- load + realtime -------------------------------------------------------
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const doRefetch = useCallback(async () => {
    setPages(await loadProjectPages(supabase, workspaceId, projectId))
  }, [supabase, workspaceId, projectId])
  const schedule = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current)
    refetchTimer.current = setTimeout(() => void doRefetch(), 300)
  }, [doRefetch])

  useEffect(() => {
    const saved = localStorage.getItem(`kore-pagetree-${projectId}`)
    if (saved) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setExpanded(new Set(JSON.parse(saved) as string[]))
      } catch {
        // ignore malformed persisted state
      }
    }
  }, [projectId])

  useEffect(() => {
    let channel: RealtimeChannel | null = null
    let cancelled = false
    void (async () => {
      await doRefetch()
      const { data } = await supabase.auth.getSession()
      await supabase.realtime.setAuth(data.session?.access_token ?? null)
      if (cancelled) return
      channel = supabase
        .channel(`pagetree:${projectId}:${channelId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'pages', filter: `workspace_id=eq.${workspaceId}` },
          schedule,
        )
        .subscribe()
    })()
    return () => {
      cancelled = true
      if (refetchTimer.current) clearTimeout(refetchTimer.current)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [supabase, workspaceId, projectId, doRefetch, schedule, channelId])

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      localStorage.setItem(`kore-pagetree-${projectId}`, JSON.stringify([...next]))
      return next
    })
  }

  // --- mutations (optimistic; realtime reconciles) ---------------------------
  const handleCreate = async (parentPageId: string | null) => {
    if (parentPageId) setExpanded((prev) => new Set(prev).add(parentPageId))
    const res = await createPage({ projectId, parentPageId })
    if (res.id) {
      await doRefetch()
      router.push(pageHref(projectId, res.id))
      onNavigate?.()
    }
  }

  const handleRename = (id: string, title: string) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, title } : p)))
    setEditingId(null)
    void renamePage(id, title)
  }

  const handleTrash = (id: string) => {
    setMenuId(null)
    setPages((prev) => {
      const gone = subtreeIds(prev, id)
      return prev.filter((p) => !gone.has(p.id))
    })
    void trashPage(id)
  }

  // --- drag and drop ---------------------------------------------------------
  const onDrop = (targetId: string, pos: DropPos) => {
    const dragId = drag?.id
    setDrag(null)
    if (!dragId || dragId === targetId) return

    // Reparenting a page under its own subtree is a cycle — block it (server re-checks).
    if (subtreeIds(pages, dragId).has(targetId)) return

    const target = pages.find((p) => p.id === targetId)
    if (!target) return

    let parentPageId: string | null
    let sort: number
    if (pos === 'inside') {
      parentPageId = target.id
      sort = appendSort(pages, target.id)
    } else {
      parentPageId = target.parentPageId
      const sibs = siblingsOf(pages, parentPageId).filter((p) => p.id !== dragId)
      const idx = sibs.findIndex((p) => p.id === targetId)
      if (pos === 'before') {
        sort = midpointSort(sibs[idx - 1]?.sort ?? null, target.sort)
      } else {
        sort = midpointSort(target.sort, sibs[idx + 1]?.sort ?? null)
      }
    }

    setPages((prev) => prev.map((p) => (p.id === dragId ? { ...p, parentPageId, sort } : p)))
    if (pos === 'inside') setExpanded((prev) => new Set(prev).add(target.id))
    void movePage(dragId, { parentPageId, sort })
  }

  return (
    <div className="mt-0.5">
      {rows.map(({ node, depth, hasChildren }) => {
        const href = pageHref(projectId, node.id)
        const active = pathname === href
        const isDropOver = drag?.over === node.id
        return (
          <div
            key={node.id}
            draggable={editingId !== node.id}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              setDrag({ id: node.id, over: null, pos: 'inside' })
            }}
            onDragOver={(e) => {
              if (!drag || drag.id === node.id) return
              e.preventDefault()
              const r = e.currentTarget.getBoundingClientRect()
              const y = e.clientY - r.top
              const pos: DropPos = y < r.height * 0.25 ? 'before' : y > r.height * 0.75 ? 'after' : 'inside'
              if (drag.over !== node.id || drag.pos !== pos) {
                setDrag({ ...drag, over: node.id, pos })
              }
            }}
            onDrop={(e) => {
              e.preventDefault()
              onDrop(node.id, drag?.pos ?? 'inside')
            }}
            onDragEnd={() => setDrag(null)}
            className={
              isDropOver && drag?.pos === 'inside'
                ? 'rounded bg-indigo-500/10 ring-1 ring-inset ring-indigo-400'
                : isDropOver && drag?.pos === 'before'
                  ? 'border-t-2 border-indigo-400'
                  : isDropOver && drag?.pos === 'after'
                    ? 'border-b-2 border-indigo-400'
                    : ''
            }
          >
            <div
              className={`group flex items-center gap-1 rounded px-1 py-1 text-sm transition ${
                active
                  ? 'bg-indigo-500/10 font-medium text-indigo-600 dark:text-indigo-300'
                  : 'text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/5'
              }`}
              style={{ paddingLeft: depth * 12 + 4 }}
            >
              <button
                type="button"
                onClick={() => hasChildren && toggleExpand(node.id)}
                className={`w-3 shrink-0 text-[10px] text-neutral-400 ${hasChildren ? '' : 'invisible'}`}
                aria-label={expanded.has(node.id) ? 'Collapse' : 'Expand'}
              >
                {expanded.has(node.id) ? '▾' : '▸'}
              </button>
              <span className="w-4 shrink-0 text-center text-xs">{node.icon ?? '📄'}</span>

              {editingId === node.id ? (
                <RenameInput
                  initial={node.title}
                  onSubmit={(title) => handleRename(node.id, title)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <Link
                  href={href}
                  onClick={onNavigate}
                  onDoubleClick={(e) => {
                    e.preventDefault()
                    setEditingId(node.id)
                  }}
                  className="min-w-0 flex-1 truncate"
                >
                  {pageDisplayTitle(node.title)}
                </Link>
              )}

              {/* Hover actions */}
              <button
                type="button"
                onClick={() => void handleCreate(node.id)}
                title="Add sub-page"
                className="hidden shrink-0 rounded px-1 text-neutral-400 hover:text-neutral-700 group-hover:block dark:hover:text-neutral-200"
              >
                +
              </button>
              <div className="relative hidden shrink-0 group-hover:block">
                <button
                  type="button"
                  onClick={() => setMenuId((cur) => (cur === node.id ? null : node.id))}
                  title="More"
                  className="rounded px-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                >
                  ⋯
                </button>
                {menuId === node.id && (
                  <div
                    className="absolute right-0 top-6 z-20 w-32 overflow-hidden rounded-md border border-border bg-background py-1 text-sm shadow-lg"
                    onMouseLeave={() => setMenuId(null)}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setMenuId(null)
                        setEditingId(node.id)
                      }}
                      className="block w-full px-3 py-1 text-left hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTrash(node.id)}
                      className="block w-full px-3 py-1 text-left text-red-600 hover:bg-red-500/10"
                    >
                      Move to trash
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}

      {creating ? (
        <div style={{ paddingLeft: 8 }}>
          <RenameInput
            initial=""
            placeholder="Page title"
            onSubmit={async (title) => {
              setCreating(false)
              const res = await createPage({ projectId, parentPageId: null, title })
              if (res.id) {
                await doRefetch()
                router.push(pageHref(projectId, res.id))
                onNavigate?.()
              }
            }}
            onCancel={() => setCreating(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="w-full rounded px-2 py-1 text-left text-xs text-neutral-400 transition hover:bg-black/5 hover:text-neutral-600 dark:hover:bg-white/5 dark:hover:text-neutral-300"
          style={{ paddingLeft: 8 }}
        >
          + New page
        </button>
      )}
    </div>
  )
}

function RenameInput({
  initial,
  placeholder,
  onSubmit,
  onCancel,
}: {
  initial: string
  placeholder?: string
  onSubmit: (value: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <input
      ref={ref}
      defaultValue={initial}
      placeholder={placeholder}
      onBlur={(e) => onSubmit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSubmit((e.target as HTMLInputElement).value)
        else if (e.key === 'Escape') onCancel()
      }}
      className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-0.5 text-sm outline-none focus:border-indigo-500"
    />
  )
}
