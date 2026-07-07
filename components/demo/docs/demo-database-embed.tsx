'use client'

import { useContext } from 'react'
import { useRouter } from 'next/navigation'
import { useDemo } from '@/lib/demo/context'
import { databaseDisplayName, dbHref } from '@/lib/databases/types'
import { DatabaseEmbedContext } from '@/components/docs/database-embed-context'
import { DemoDatabaseView } from '@/components/demo/databases/demo-database-view'

/** Demo fork of DatabaseEmbedView — store-backed picker + mounts DemoDatabaseView. */
export function DemoDatabaseEmbedView({
  databaseId,
  onPick,
}: {
  databaseId: string
  onPick: (id: string) => void
}) {
  const ctx = useContext(DatabaseEmbedContext)
  const store = useDemo()
  const router = useRouter()

  return (
    <div contentEditable={false} className="my-2 overflow-hidden rounded-lg border border-border bg-background">
      {!ctx ? (
        <p className="px-3 py-4 text-sm text-neutral-400">Database embed unavailable.</p>
      ) : !databaseId ? (
        <div className="p-3">
          <p className="mb-2 text-sm font-medium">Embed a database</p>
          <button
            type="button"
            onClick={() => onPick(store.createDatabase(ctx.projectId))}
            className="mb-2 w-full rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            + Create new database
          </button>
          {store.listDatabases(ctx.projectId).filter((d) => !d.trashedAt).length > 0 && (
            <>
              <p className="px-1 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                Or pick an existing one
              </p>
              <ul className="max-h-48 space-y-0.5 overflow-y-auto">
                {store
                  .listDatabases(ctx.projectId)
                  .filter((d) => !d.trashedAt)
                  .map((d) => (
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
      ) : (
        <div>
          <div className="flex items-center justify-end border-b border-border px-2 py-1">
            <button
              type="button"
              onClick={() => router.push(`/demo${dbHref(ctx.projectId, databaseId)}`)}
              className="rounded px-2 py-0.5 text-xs text-neutral-400 transition hover:text-neutral-700 dark:hover:text-neutral-200"
            >
              Open full ↗
            </button>
          </div>
          <DemoDatabaseView key={databaseId} databaseId={databaseId} embedded />
        </div>
      )}
    </div>
  )
}
