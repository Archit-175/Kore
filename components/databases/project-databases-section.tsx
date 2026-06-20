'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { loadProjectDatabases, loadTrashedDatabases } from '@/lib/databases/load-database'
import { databaseDisplayName, dbHref, type DatabaseListItem } from '@/lib/databases/types'
import {
  createDatabase,
  deleteDatabasePermanent,
  emptyDatabaseTrash,
  restoreDatabase,
} from '@/lib/actions/databases'

/** The "Databases" section on the project Docs home — lists the project's
 *  databases (icon + name + row count) with create + a Trash drawer. Self-fetches
 *  + subscribes to Postgres Changes (per-mount useId() channel). */
export function ProjectDatabasesSection({
  projectId,
  workspaceId,
  isOwner,
}: {
  projectId: string
  workspaceId: string
  isOwner: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const channelId = useId().replace(/[^a-zA-Z0-9]/g, '')
  const router = useRouter()

  const [databases, setDatabases] = useState<DatabaseListItem[]>([])
  const [trashed, setTrashed] = useState<DatabaseListItem[]>([])
  const [showTrash, setShowTrash] = useState(false)
  const [creating, setCreating] = useState(false)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const doRefetch = useCallback(async () => {
    const [live, trash] = await Promise.all([
      loadProjectDatabases(supabase, workspaceId, projectId),
      loadTrashedDatabases(supabase, workspaceId, projectId),
    ])
    setDatabases(live)
    setTrashed(trash)
  }, [supabase, workspaceId, projectId])

  useEffect(() => {
    let channel: RealtimeChannel | null = null
    let cancelled = false
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void doRefetch(), 300)
    }
    void (async () => {
      await doRefetch()
      const { data } = await supabase.auth.getSession()
      await supabase.realtime.setAuth(data.session?.access_token ?? null)
      if (cancelled) return
      channel = supabase
        .channel(`dbhome:${projectId}:${channelId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'databases', filter: `project_id=eq.${projectId}` },
          schedule,
        )
        .subscribe()
    })()
    return () => {
      cancelled = true
      if (timer.current) clearTimeout(timer.current)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [supabase, workspaceId, projectId, doRefetch, channelId])

  const newDatabase = async () => {
    setCreating(true)
    const res = await createDatabase({ projectId })
    setCreating(false)
    if (res.id) router.push(dbHref(projectId, res.id))
  }

  const onRestore = (id: string) => {
    setTrashed((prev) => prev.filter((d) => d.id !== id))
    void restoreDatabase(id)
  }
  const onDeleteForever = (id: string) => {
    setTrashed((prev) => prev.filter((d) => d.id !== id))
    void deleteDatabasePermanent(id)
  }
  const onEmptyTrash = () => {
    setTrashed([])
    void emptyDatabaseTrash(projectId)
  }

  return (
    <div className="mt-10">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
          Databases
        </p>
        <button
          type="button"
          onClick={() => void newDatabase()}
          disabled={creating}
          className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-500/10 disabled:opacity-60 dark:text-indigo-300"
        >
          + New database
        </button>
      </div>

      {databases.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-8 text-center">
          <p className="text-sm text-neutral-400">No databases yet.</p>
          <button
            type="button"
            onClick={() => void newDatabase()}
            disabled={creating}
            className="mt-1 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-300"
          >
            Create a database
          </button>
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {databases.map((d) => (
            <li key={d.id}>
              <Link
                href={dbHref(projectId, d.id)}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm transition hover:border-neutral-300 dark:hover:border-neutral-600"
              >
                <span className="text-base">{d.icon ?? '🗄'}</span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {databaseDisplayName(d.name)}
                </span>
                <span className="shrink-0 text-xs text-neutral-400">
                  {d.rowCount} {d.rowCount === 1 ? 'row' : 'rows'}
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
              Trashed databases ({trashed.length})
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
              {trashed.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <span className="text-base">{d.icon ?? '🗄'}</span>
                  <span className="min-w-0 flex-1 truncate text-neutral-500 line-through dark:text-neutral-400">
                    {databaseDisplayName(d.name)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRestore(d.id)}
                    className="shrink-0 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-300"
                  >
                    Restore
                  </button>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => onDeleteForever(d.id)}
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
