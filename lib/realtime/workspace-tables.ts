'use client'

import { useEffect } from 'react'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/types/database'

/**
 * ONE shared Realtime channel per workspace for the envelope tables that the
 * sidebar trees + project-home sections + the open doc/whiteboard view watch.
 *
 * Why: every tree/section/view used to open its OWN `postgres_changes` channel
 * (one per project, per table). On the free tier those subscriptions exhaust
 * Realtime's connection pool ("IncreaseConnectionPool") once a couple of windows
 * are open. Multiplexing all of them onto a single channel with several
 * `.on('postgres_changes')` listeners (the pattern DatabaseView already uses for
 * its 4 tables) keeps the subscription count flat regardless of project count.
 *
 * Components register `(table, callback)`; the singleton fans every matching
 * row-change (filtered server-side by workspace_id) to the registered callbacks,
 * which refetch their own scoped query. Ref-counted: the channel is created on
 * the first subscriber and torn down after the last unsubscribes.
 */

export type WatchedTable =
  | 'pages'
  | 'databases'
  | 'whiteboards'
  | 'messages'
  | 'message_reactions'
  | 'message_reads'
  | 'comments'
  | 'activity_log'
const WATCHED: WatchedTable[] = [
  'pages',
  'databases',
  'whiteboards',
  'messages',
  'message_reactions',
  'message_reads',
  'comments',
  'activity_log',
]

type Registry = {
  supabase: SupabaseClient<Database>
  channel: RealtimeChannel | null
  listeners: Map<WatchedTable, Set<() => void>>
  refcount: number
}

const registries = new Map<string, Registry>()
let seq = 0 // unique channel-topic suffix so a recreate never reuses a still-closing topic

function getRegistry(workspaceId: string): Registry {
  const existing = registries.get(workspaceId)
  if (existing) return existing

  const supabase = createClient()
  const reg: Registry = { supabase, channel: null, listeners: new Map(), refcount: 0 }
  registries.set(workspaceId, reg)

  const fire = (table: WatchedTable) => () => {
    reg.listeners.get(table)?.forEach((cb) => cb())
  }

  void (async () => {
    const { data } = await supabase.auth.getSession()
    await supabase.realtime.setAuth(data.session?.access_token ?? null)
    // Torn down while we awaited the session — don't open a leaked channel.
    if (registries.get(workspaceId) !== reg) return
    let ch = supabase.channel(`wstables:${workspaceId}:${seq++}`)
    for (const table of WATCHED) {
      ch = ch.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `workspace_id=eq.${workspaceId}` },
        fire(table),
      )
    }
    ch.subscribe()
    reg.channel = ch
  })()

  return reg
}

/**
 * Subscribe a stable callback to row-changes on one workspace table. `onChange`
 * MUST be referentially stable (wrap it in useCallback) — it's used as the Set
 * key and effect dep. Debounce inside `onChange` if you refetch.
 */
export function useWorkspaceTable(
  workspaceId: string,
  table: WatchedTable,
  onChange: () => void,
): void {
  useEffect(() => {
    const reg = getRegistry(workspaceId)
    let set = reg.listeners.get(table)
    if (!set) {
      set = new Set()
      reg.listeners.set(table, set)
    }
    set.add(onChange)
    reg.refcount++

    return () => {
      const current = registries.get(workspaceId)
      if (!current) return
      current.listeners.get(table)?.delete(onChange)
      current.refcount--
      if (current.refcount <= 0) {
        if (current.channel) void current.supabase.removeChannel(current.channel)
        registries.delete(workspaceId)
      }
    }
  }, [workspaceId, table, onChange])
}
