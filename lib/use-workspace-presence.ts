'use client'

import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { PresenceUser } from '@/lib/presence'
import type { Database } from '@/types/database'

/**
 * Workspace-wide "who's online" via a private Supabase Presence channel
 * (topic `presence:{workspaceId}`). Separate from the per-doc presence used by
 * the collaborative editor.
 *
 * REF-COUNTED SINGLETON (one channel per workspace, multiplexed to every
 * consumer): more than one component may mount this hook on the same page (the
 * Topbar always, plus e.g. the Chat header). Opening a SECOND channel on the same
 * `presence:{ws}` topic threw "cannot add presence callbacks after subscribe()".
 * Mirrors lib/realtime/workspace-tables.ts.
 */

type Reg = {
  client: SupabaseClient<Database>
  channel: RealtimeChannel | null
  online: PresenceUser[]
  listeners: Set<(users: PresenceUser[]) => void>
  refcount: number
}

const registries = new Map<string, Reg>()

function getReg(workspaceId: string, user: PresenceUser): Reg {
  const existing = registries.get(workspaceId)
  if (existing) return existing

  const client = createClient()
  const reg: Reg = { client, channel: null, online: [], listeners: new Set(), refcount: 0 }
  registries.set(workspaceId, reg)

  const channel = client.channel(`presence:${workspaceId}`, {
    config: { private: true, presence: { key: user.id } },
  })

  const sync = () => {
    const state = channel.presenceState<PresenceUser>()
    const users: PresenceUser[] = []
    const seen = new Set<string>()
    for (const key of Object.keys(state)) {
      for (const meta of state[key]) {
        if (meta?.id && !seen.has(meta.id)) {
          seen.add(meta.id)
          users.push({
            id: meta.id,
            name: meta.name,
            color: meta.color,
            avatarUrl: meta.avatarUrl ?? null,
          })
        }
      }
    }
    reg.online = users
    reg.listeners.forEach((l) => l(users))
  }

  void (async () => {
    // Set the JWT BEFORE subscribe so private-channel authorization passes.
    const { data } = await client.auth.getSession()
    await client.realtime.setAuth(data.session?.access_token ?? null)
    if (registries.get(workspaceId) !== reg) return // torn down while awaiting
    channel.on('presence', { event: 'sync' }, sync).subscribe(async (status, err) => {
      if (status === 'SUBSCRIBED') await channel.track(user)
      else if (err) console.error('[kore] presence channel error:', err.message ?? err)
    })
  })()
  reg.channel = channel
  return reg
}

export function useWorkspacePresence(workspaceId: string, user: PresenceUser): PresenceUser[] {
  const [online, setOnline] = useState<PresenceUser[]>([])
  const userRef = useRef(user)
  useEffect(() => {
    userRef.current = user
  }, [user])

  useEffect(() => {
    const reg = getReg(workspaceId, userRef.current)
    const listener = (users: PresenceUser[]) => setOnline(users)
    reg.listeners.add(listener)
    reg.refcount++
    // Seed with the current roster (deferred so it's not a synchronous setState
    // in the effect body) — covers a late consumer joining an already-synced channel.
    queueMicrotask(() => listener(reg.online))

    return () => {
      const cur = registries.get(workspaceId)
      if (!cur) return
      cur.listeners.delete(listener)
      cur.refcount--
      if (cur.refcount <= 0) {
        if (cur.channel) void cur.client.removeChannel(cur.channel)
        registries.delete(workspaceId)
      }
    }
  }, [workspaceId])

  return online
}
