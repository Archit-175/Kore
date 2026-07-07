'use client'

import { useContext } from 'react'
import { useRouter } from 'next/navigation'
import { useDemo } from '@/lib/demo/context'
import { whiteboardDisplayName, wbHref } from '@/lib/whiteboards/types'
import { WhiteboardEmbedContext } from '@/components/docs/whiteboard-embed-context'
import { DemoWhiteboardView } from '@/components/demo/whiteboards/demo-whiteboard-view'

/** Demo fork of WhiteboardEmbedView — store-backed picker + mounts DemoWhiteboardView. */
export function DemoWhiteboardEmbedView({
  whiteboardId,
  onPick,
}: {
  whiteboardId: string
  onPick: (id: string) => void
}) {
  const ctx = useContext(WhiteboardEmbedContext)
  const store = useDemo()
  const router = useRouter()

  const list = ctx ? store.whiteboards.filter((w) => w.projectId === ctx.projectId && !w.trashedAt) : []

  return (
    <div contentEditable={false} className="my-2 w-full overflow-hidden rounded-lg border border-border bg-background">
      {!ctx ? (
        <p className="px-3 py-4 text-sm text-neutral-400">Whiteboard embed unavailable.</p>
      ) : !whiteboardId ? (
        <div className="p-3">
          <p className="mb-2 text-sm font-medium">Embed a whiteboard</p>
          <button
            type="button"
            onClick={() => onPick(store.createWhiteboard(ctx.projectId))}
            className="mb-2 w-full rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            + Create new whiteboard
          </button>
          {list.length > 0 && (
            <>
              <p className="px-1 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                Or pick an existing one
              </p>
              <ul className="max-h-48 space-y-0.5 overflow-y-auto">
                {list.map((w) => (
                  <li key={w.id}>
                    <button
                      type="button"
                      onClick={() => onPick(w.id)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <span>{w.icon ?? '🎨'}</span>
                      <span className="min-w-0 flex-1 truncate">{whiteboardDisplayName(w.title)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between border-b border-border px-2 py-1">
            <span className="truncate px-1 text-xs text-neutral-400">
              {store.getWhiteboard(whiteboardId)?.icon ?? '🎨'}{' '}
              {whiteboardDisplayName(store.getWhiteboard(whiteboardId)?.title ?? '')}
            </span>
            <button
              type="button"
              onClick={() => router.push(`/demo${wbHref(ctx.projectId, whiteboardId)}`)}
              className="rounded px-2 py-0.5 text-xs text-neutral-400 transition hover:text-neutral-700 dark:hover:text-neutral-200"
            >
              Open full ↗
            </button>
          </div>
          <DemoWhiteboardView key={whiteboardId} whiteboardId={whiteboardId} projectId={ctx.projectId} embedded />
        </div>
      )}
    </div>
  )
}
