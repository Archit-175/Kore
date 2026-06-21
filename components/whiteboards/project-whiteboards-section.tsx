'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useWorkspaceTable } from '@/lib/realtime/workspace-tables'
import { loadProjectWhiteboards, loadTrashedWhiteboards } from '@/lib/whiteboards/load-whiteboards'
import { whiteboardDisplayName, wbHref, type WhiteboardListItem } from '@/lib/whiteboards/types'
import {
  createWhiteboard,
  deleteWhiteboardPermanent,
  emptyWhiteboardTrash,
  restoreWhiteboard,
} from '@/lib/actions/whiteboards'
import { Spinner } from '@/components/spinner'

/** The "Whiteboards" section on the project Docs home — lists the project's
 *  whiteboards (icon + title) with create + a Trash drawer. Self-fetches +
 *  subscribes to Postgres Changes (per-mount useId() channel). Mirror of
 *  ProjectDatabasesSection. */
export function ProjectWhiteboardsSection({
  projectId,
  workspaceId,
  isOwner,
}: {
  projectId: string
  workspaceId: string
  isOwner: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [whiteboards, setWhiteboards] = useState<WhiteboardListItem[]>([])
  const [trashed, setTrashed] = useState<WhiteboardListItem[]>([])
  const [showTrash, setShowTrash] = useState(false)
  const [creating, setCreating] = useState(false)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const doRefetch = useCallback(async () => {
    const [live, trash] = await Promise.all([
      loadProjectWhiteboards(supabase, workspaceId, projectId),
      loadTrashedWhiteboards(supabase, workspaceId, projectId),
    ])
    setWhiteboards(live)
    setTrashed(trash)
  }, [supabase, workspaceId, projectId])

  // Realtime via the ONE shared workspace channel (see lib/realtime/workspace-tables.ts).
  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void doRefetch(), 300)
  }, [doRefetch])
  useEffect(() => {
    void (async () => {
      await doRefetch()
    })()
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [doRefetch])
  useWorkspaceTable(workspaceId, 'whiteboards', schedule)

  const newWhiteboard = async () => {
    setCreating(true)
    const res = await createWhiteboard({ projectId })
    setCreating(false)
    if (res.id) router.push(wbHref(projectId, res.id))
  }

  const onRestore = (id: string) => {
    setTrashed((prev) => prev.filter((w) => w.id !== id))
    void restoreWhiteboard(id)
  }
  const onDeleteForever = (id: string) => {
    setTrashed((prev) => prev.filter((w) => w.id !== id))
    void deleteWhiteboardPermanent(id)
  }
  const onEmptyTrash = () => {
    setTrashed([])
    void emptyWhiteboardTrash(projectId)
  }

  return (
    <div className="mt-10">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
          Whiteboards
        </p>
        <button
          type="button"
          onClick={() => void newWhiteboard()}
          disabled={creating}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-500/10 disabled:opacity-60 dark:text-indigo-300"
        >
          {creating && <Spinner className="h-3 w-3" />}
          {creating ? 'Creating…' : '+ New whiteboard'}
        </button>
      </div>

      {whiteboards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-8 text-center">
          <p className="text-sm text-neutral-400">No whiteboards yet.</p>
          <button
            type="button"
            onClick={() => void newWhiteboard()}
            disabled={creating}
            className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline disabled:opacity-60 dark:text-indigo-300"
          >
            {creating && <Spinner className="h-3.5 w-3.5" />}
            {creating ? 'Creating…' : 'Create a whiteboard'}
          </button>
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {whiteboards.map((w) => (
            <li key={w.id}>
              <Link
                href={wbHref(projectId, w.id)}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm transition hover:border-neutral-300 dark:hover:border-neutral-600"
              >
                <span className="text-base">{w.icon ?? '🎨'}</span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {whiteboardDisplayName(w.title)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {trashed.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowTrash((v) => !v)}
              className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 transition hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              <span className="text-[10px]">{showTrash ? '▾' : '▸'}</span>
              Trashed whiteboards ({trashed.length})
            </button>
            {isOwner && showTrash && (
              <button
                type="button"
                onClick={onEmptyTrash}
                className="rounded px-2 py-0.5 text-xs text-red-600 transition hover:bg-red-500/10"
              >
                Empty trash
              </button>
            )}
          </div>
          {showTrash && (
            <ul className="mt-2 space-y-0.5">
              {trashed.map((w) => (
                <li
                  key={w.id}
                  className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <span className="text-base">{w.icon ?? '🎨'}</span>
                  <span className="min-w-0 flex-1 truncate text-neutral-500 line-through dark:text-neutral-400">
                    {whiteboardDisplayName(w.title)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRestore(w.id)}
                    className="shrink-0 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-300"
                  >
                    Restore
                  </button>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => onDeleteForever(w.id)}
                      className="shrink-0 text-xs text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
