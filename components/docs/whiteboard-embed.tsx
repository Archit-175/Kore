'use client'

import { useContext, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { loadProjectWhiteboards, loadWhiteboard } from '@/lib/whiteboards/load-whiteboards'
import {
  whiteboardDisplayName,
  wbHref,
  type WhiteboardListItem,
  type WhiteboardMeta,
} from '@/lib/whiteboards/types'
import { createWhiteboard } from '@/lib/actions/whiteboards'
import { WhiteboardView } from '@/components/whiteboards/whiteboard-view'
import { WhiteboardEmbedContext, type WhiteboardEmbedCtx } from './whiteboard-embed-context'

/**
 * The inline whiteboardEmbed block body. Stores ONLY a whiteboardId (opaque in
 * the Yjs/BlockNote doc) — all data flows through WhiteboardView's own
 * useKoreYDoc + DAL/RLS load, so embedding can never bypass membership. When
 * unset, shows a picker. The wrapper is contentEditable=false so BlockNote treats
 * the region as a non-editable void (meta:{selectable:false} stops ProseMirror
 * from node-selecting/deleting it or hijacking the canvas pointer/drag). The
 * embedded canvas shares the SAME Yjs doc as the full route, so it is live.
 */
export function WhiteboardEmbedView({
  whiteboardId,
  onPick,
}: {
  whiteboardId: string
  onPick: (id: string) => void
}) {
  const ctx = useContext(WhiteboardEmbedContext)

  return (
    <div
      contentEditable={false}
      // w-full: BlockNote's .bn-block-content is display:flex, and Excalidraw has
      // no intrinsic width, so without this the embed collapses to min-content.
      className="my-2 w-full overflow-hidden rounded-lg border border-border bg-background"
    >
      {!ctx ? (
        <p className="px-3 py-4 text-sm text-neutral-400">Whiteboard embed unavailable.</p>
      ) : !whiteboardId ? (
        <EmbedPicker ctx={ctx} onPick={onPick} />
      ) : (
        <EmbedBody ctx={ctx} whiteboardId={whiteboardId} />
      )}
    </div>
  )
}

function EmbedPicker({
  ctx,
  onPick,
}: {
  ctx: WhiteboardEmbedCtx
  onPick: (id: string) => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [list, setList] = useState<WhiteboardListItem[] | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      setList(await loadProjectWhiteboards(supabase, ctx.workspaceId, ctx.projectId))
    })()
  }, [supabase, ctx.workspaceId, ctx.projectId])

  const createNew = async () => {
    setBusy(true)
    const res = await createWhiteboard({ projectId: ctx.projectId, title: 'Untitled whiteboard' })
    setBusy(false)
    if (res.id) onPick(res.id)
  }

  return (
    <div className="p-3">
      <p className="mb-2 text-sm font-medium">Embed a whiteboard</p>
      <button
        type="button"
        onClick={() => void createNew()}
        disabled={busy}
        className="mb-2 w-full rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
      >
        + Create new whiteboard
      </button>
      {list && list.length > 0 && (
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
  )
}

function EmbedBody({
  ctx,
  whiteboardId,
}: {
  ctx: WhiteboardEmbedCtx
  whiteboardId: string
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [state, setState] = useState<{ meta: WhiteboardMeta | null; loading: boolean }>({
    meta: null,
    loading: true,
  })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const meta = await loadWhiteboard(supabase, ctx.workspaceId, whiteboardId)
      if (!cancelled) setState({ meta, loading: false })
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, ctx.workspaceId, whiteboardId])

  if (state.loading) {
    return <div className="h-24 animate-pulse bg-surface" />
  }
  if (!state.meta) {
    return (
      <p className="px-3 py-4 text-sm text-neutral-400">This whiteboard is no longer available.</p>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b border-border px-2 py-1">
        <span className="truncate px-1 text-xs text-neutral-400">
          {state.meta.icon ?? '🎨'} {whiteboardDisplayName(state.meta.title)}
        </span>
        <button
          type="button"
          onClick={() => router.push(wbHref(ctx.projectId, whiteboardId))}
          className="rounded px-2 py-0.5 text-xs text-neutral-400 transition hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          Open full ↗
        </button>
      </div>
      <WhiteboardView
        key={whiteboardId}
        whiteboardId={whiteboardId}
        projectId={ctx.projectId}
        workspaceId={ctx.workspaceId}
        user={ctx.user}
        initialMeta={state.meta}
        embedded
      />
    </div>
  )
}
