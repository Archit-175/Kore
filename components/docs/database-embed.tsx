'use client'

import { useContext, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  loadDatabase,
  loadProjectDatabases,
  loadWorkspaceMembers,
} from '@/lib/databases/load-database'
import {
  databaseDisplayName,
  dbHref,
  type DatabaseAggregate,
  type DatabaseListItem,
  type DbMember,
} from '@/lib/databases/types'
import { createDatabase } from '@/lib/actions/databases'
import { DatabaseView } from '@/components/databases/database-view'
import { DatabaseEmbedContext } from './database-embed-context'

/**
 * The inline databaseEmbed block body. Stores ONLY a databaseId (opaque in the
 * Yjs/BlockNote doc) — all data flows through DatabaseView's own DAL+RLS load, so
 * embedding can never bypass membership. When unset, shows a picker (create new
 * in this project / select existing). The wrapper is contentEditable=false so
 * BlockNote treats the region as a non-editable void; the interactive popovers
 * inside use a capture-phase outside-click listener so they still work here.
 */
export function DatabaseEmbedView({
  databaseId,
  onPick,
}: {
  databaseId: string
  onPick: (id: string) => void
}) {
  const ctx = useContext(DatabaseEmbedContext)

  return (
    <div
      contentEditable={false}
      className="my-2 overflow-hidden rounded-lg border border-border bg-background"
    >
      {!ctx ? (
        <p className="px-3 py-4 text-sm text-neutral-400">Database embed unavailable.</p>
      ) : !databaseId ? (
        <EmbedPicker ctx={ctx} onPick={onPick} />
      ) : (
        <EmbedBody ctx={ctx} databaseId={databaseId} />
      )}
    </div>
  )
}

function EmbedPicker({
  ctx,
  onPick,
}: {
  ctx: { workspaceId: string; projectId: string }
  onPick: (id: string) => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [list, setList] = useState<DatabaseListItem[] | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      setList(await loadProjectDatabases(supabase, ctx.workspaceId, ctx.projectId))
    })()
  }, [supabase, ctx.workspaceId, ctx.projectId])

  const createNew = async () => {
    setBusy(true)
    const res = await createDatabase({ projectId: ctx.projectId, name: 'Untitled database' })
    setBusy(false)
    if (res.id) onPick(res.id)
  }

  return (
    <div className="p-3">
      <p className="mb-2 text-sm font-medium">Embed a database</p>
      <button
        type="button"
        onClick={() => void createNew()}
        disabled={busy}
        className="mb-2 w-full rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
      >
        + Create new database
      </button>
      {list && list.length > 0 && (
        <>
          <p className="px-1 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            Or pick an existing one
          </p>
          <ul className="max-h-48 space-y-0.5 overflow-y-auto">
            {list.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => onPick(d.id)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <span>{d.icon ?? '🗄'}</span>
                  <span className="min-w-0 flex-1 truncate">{databaseDisplayName(d.name)}</span>
                  <span className="shrink-0 text-xs text-neutral-400">{d.rowCount}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function EmbedBody({
  ctx,
  databaseId,
}: {
  ctx: { workspaceId: string; projectId: string }
  databaseId: string
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [state, setState] = useState<{
    aggregate: DatabaseAggregate | null
    members: DbMember[]
    loading: boolean
  }>({ aggregate: null, members: [], loading: true })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [aggregate, members] = await Promise.all([
        loadDatabase(supabase, ctx.workspaceId, databaseId),
        loadWorkspaceMembers(supabase, ctx.workspaceId),
      ])
      if (!cancelled) setState({ aggregate, members, loading: false })
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, ctx.workspaceId, databaseId])

  if (state.loading) {
    return <div className="h-24 animate-pulse bg-surface" />
  }
  if (!state.aggregate) {
    return <p className="px-3 py-4 text-sm text-neutral-400">This database is no longer available.</p>
  }

  return (
    <div>
      <div className="flex items-center justify-end border-b border-border px-2 py-1">
        <button
          type="button"
          onClick={() => router.push(dbHref(ctx.projectId, databaseId))}
          className="rounded px-2 py-0.5 text-xs text-neutral-400 transition hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          Open full ↗
        </button>
      </div>
      <DatabaseView
        key={databaseId}
        initial={state.aggregate}
        workspaceId={ctx.workspaceId}
        members={state.members}
        isOwner={false}
        embedded
      />
    </div>
  )
}
