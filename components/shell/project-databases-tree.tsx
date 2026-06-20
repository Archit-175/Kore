'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useWorkspaceTable } from '@/lib/realtime/workspace-tables'
import { loadProjectDatabases } from '@/lib/databases/load-database'
import { databaseDisplayName, dbHref, type DatabaseListItem } from '@/lib/databases/types'
import { createDatabase, renameDatabase, trashDatabase } from '@/lib/actions/databases'

/**
 * The per-project flat list of databases shown under the page tree in the
 * sidebar. Self-fetches + subscribes to Postgres Changes (the notes/pages
 * pattern, per-mount useId() channel) so create/rename/trash anywhere appears
 * live — which is why the database Server Actions skip revalidatePath.
 */
export function ProjectDatabasesTree({
  projectId,
  workspaceId,
  onNavigate,
}: {
  projectId: string
  workspaceId: string
  onNavigate?: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const pathname = usePathname()

  const [databases, setDatabases] = useState<DatabaseListItem[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)

  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const doRefetch = useCallback(async () => {
    setDatabases(await loadProjectDatabases(supabase, workspaceId, projectId))
  }, [supabase, workspaceId, projectId])
  const schedule = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current)
    refetchTimer.current = setTimeout(() => void doRefetch(), 300)
  }, [doRefetch])

  // Initial load + realtime via the ONE shared workspace channel (avoids a
  // postgres_changes channel per tree — see lib/realtime/workspace-tables.ts).
  useEffect(() => {
    void (async () => {
      await doRefetch()
    })()
    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current)
    }
  }, [doRefetch])
  useWorkspaceTable(workspaceId, 'databases', schedule)

  const handleCreate = async () => {
    const res = await createDatabase({ projectId })
    if (res.id) {
      await doRefetch()
      router.push(dbHref(projectId, res.id))
      onNavigate?.()
    }
  }

  const handleRename = (id: string, name: string) => {
    setDatabases((prev) => prev.map((d) => (d.id === id ? { ...d, name } : d)))
    setEditingId(null)
    void renameDatabase(id, name)
  }

  const handleTrash = (id: string) => {
    setMenuId(null)
    setDatabases((prev) => prev.filter((d) => d.id !== id))
    void trashDatabase(id)
  }

  return (
    <div className="mt-0.5">
      {databases.map((d) => {
        const href = dbHref(projectId, d.id)
        const active = pathname === href
        return (
          <div
            key={d.id}
            className={`group flex items-center gap-1 rounded px-1 py-1 text-sm transition ${
              active
                ? 'bg-indigo-500/10 font-medium text-indigo-600 dark:text-indigo-300'
                : 'text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/5'
            }`}
            style={{ paddingLeft: 4 }}
          >
            <span className="w-4 shrink-0 text-center text-xs">{d.icon ?? '🗄'}</span>
            {editingId === d.id ? (
              <RenameInput
                initial={d.name}
                onSubmit={(name) => handleRename(d.id, name)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <Link
                href={href}
                onClick={onNavigate}
                onDoubleClick={(e) => {
                  e.preventDefault()
                  setEditingId(d.id)
                }}
                className="min-w-0 flex-1 truncate"
              >
                {databaseDisplayName(d.name)}
              </Link>
            )}
            <div className="relative hidden shrink-0 group-hover:block">
              <button
                type="button"
                onClick={() => setMenuId((cur) => (cur === d.id ? null : d.id))}
                title="More"
                className="rounded px-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
              >
                ⋯
              </button>
              {menuId === d.id && (
                <div
                  className="absolute right-0 top-6 z-20 w-32 overflow-hidden rounded-md border border-border bg-background py-1 text-sm shadow-lg"
                  onMouseLeave={() => setMenuId(null)}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMenuId(null)
                      setEditingId(d.id)
                    }}
                    className="block w-full px-3 py-1 text-left hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTrash(d.id)}
                    className="block w-full px-3 py-1 text-left text-red-600 hover:bg-red-500/10"
                  >
                    Move to trash
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}

      <button
        type="button"
        onClick={() => void handleCreate()}
        className="w-full rounded px-2 py-1 text-left text-xs text-neutral-400 transition hover:bg-black/5 hover:text-neutral-600 dark:hover:bg-white/5 dark:hover:text-neutral-300"
        style={{ paddingLeft: 8 }}
      >
        + New database
      </button>
    </div>
  )
}

function RenameInput({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: string
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
      onBlur={(e) => onSubmit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSubmit((e.target as HTMLInputElement).value)
        else if (e.key === 'Escape') onCancel()
      }}
      className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-0.5 text-sm outline-none focus:border-indigo-500"
    />
  )
}
