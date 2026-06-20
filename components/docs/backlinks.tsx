'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { loadBacklinks } from '@/lib/docs/load-pages'
import { pageDisplayTitle, pageHref, type Backlink } from '@/lib/docs/types'

/**
 * "Linked references" — the pages that @-mention this one. Reads from the
 * derived page_links table and live-refetches on any page_links/pages change
 * (debounced), mirroring the notes board's realtime pattern.
 */
export function Backlinks({
  pageId,
  workspaceId,
  initial,
}: {
  pageId: string
  workspaceId: string
  initial: Backlink[]
}) {
  const supabase = useMemo(() => createClient(), [])
  const channelId = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [links, setLinks] = useState<Backlink[]>(initial)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doRefetch = useCallback(async () => {
    setLinks(await loadBacklinks(supabase, pageId))
  }, [supabase, pageId])

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void doRefetch(), 400)
  }, [doRefetch])

  useEffect(() => {
    let channel: RealtimeChannel | null = null
    let cancelled = false
    void (async () => {
      const { data } = await supabase.auth.getSession()
      await supabase.realtime.setAuth(data.session?.access_token ?? null)
      if (cancelled) return
      const filter = `workspace_id=eq.${workspaceId}`
      channel = supabase
        .channel(`backlinks:${pageId}:${channelId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'page_links', filter }, schedule)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pages', filter }, schedule)
        .subscribe()
    })()
    return () => {
      cancelled = true
      if (timer.current) clearTimeout(timer.current)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [supabase, workspaceId, pageId, schedule, channelId])

  if (links.length === 0) return null

  return (
    <div className="mt-10 border-t border-border pt-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
        Linked references ({links.length})
      </p>
      <ul className="space-y-0.5">
        {links.map((b) => (
          <li key={b.sourcePageId}>
            <Link
              href={pageHref(b.projectId, b.sourcePageId)}
              className="flex items-center gap-2 rounded px-2 py-1 text-sm text-neutral-600 transition hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/5"
            >
              <span className="w-4 text-center text-xs">📄</span>
              <span className="truncate">{pageDisplayTitle(b.title)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
