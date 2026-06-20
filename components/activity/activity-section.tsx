'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspaceTable } from '@/lib/realtime/workspace-tables'
import { timeAgo } from '@/lib/format-time'
import { loadProjectActivity, type ActivityEntry } from '@/lib/activity/load-activity'

const TARGET_ICON: Record<string, string> = {
  page: '📄',
  database: '🗄',
  whiteboard: '🎨',
  note: '🗒',
}

/**
 * Per-project activity feed (change history). Coarse events written by
 * logActivity() inside the DAL-gated actions. Realtime via the SHARED workspace
 * singleton (useWorkspaceTable) — fires on any activity_log change, the callback
 * refetches THIS project. Hidden until there's something to show.
 */
export function ActivitySection({
  projectId,
  workspaceId,
}: {
  projectId: string
  workspaceId: string
}) {
  const supabase = useMemo(() => createClient(), [])
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refetch = useCallback(async () => {
    setEntries(await loadProjectActivity(supabase, workspaceId, projectId))
    setLoaded(true)
  }, [supabase, workspaceId, projectId])

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void refetch(), 300)
  }, [refetch])

  useEffect(() => {
    schedule()
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [schedule])

  useWorkspaceTable(workspaceId, 'activity_log', schedule)

  // Nothing to show on a brand-new project — keep the home uncluttered.
  if (loaded && entries.length === 0) return null

  return (
    <div className="mt-10 border-t border-border pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 transition hover:text-neutral-600 dark:hover:text-neutral-300"
      >
        <span className="text-[10px]">{open ? '▾' : '▸'}</span>
        Activity
      </button>
      {open && (
        <ul className="mt-2 space-y-1">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start gap-2 px-1 py-1 text-sm">
              <span className="mt-0.5 text-sm">{TARGET_ICON[e.targetType] ?? '•'}</span>
              <span className="min-w-0 flex-1 text-neutral-600 dark:text-neutral-300">
                <span className="font-medium text-foreground">{e.actorName}</span>{' '}
                {e.action} {e.targetType}
                {e.targetTitle ? (
                  <>
                    {' '}
                    <span className="font-medium text-foreground">
                      “{e.targetTitle}”
                    </span>
                  </>
                ) : null}
                <span className="ml-1.5 text-xs text-neutral-400">· {timeAgo(e.createdAt)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
