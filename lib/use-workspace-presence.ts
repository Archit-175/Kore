'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PresenceUser } from '@/lib/presence'

/**
 * Workspace-wide "who's online" via a private Supabase Presence channel
 * (topic `presence:{workspaceId}`). Separate from the per-doc presence used by
 * the collaborative scratchpad.
 */
export function useWorkspacePresence(
  workspaceId: string,
  user: PresenceUser,
): PresenceUser[] {
  const [online, setOnline] = useState<PresenceUser[]>([])
  const userRef = useRef(user)
  useEffect(() => {
    userRef.current = user
  }, [user])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(`presence:${workspaceId}`, {
      config: { private: true, presence: { key: userRef.current.id } },
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
      setOnline(users)
    }

    let active = true
    void (async () => {
      // Set the JWT BEFORE subscribe so private-channel authorization passes.
      // setAuth is async in realtime-js — must await.
      const { data } = await supabase.auth.getSession()
      await supabase.realtime.setAuth(data.session?.access_token ?? null)
      if (!active) return
      channel.on('presence', { event: 'sync' }, sync).subscribe(async (status, err) => {
        if (status === 'SUBSCRIBED' && active) await channel.track(userRef.current)
        else if (err) console.error('[kore] presence channel error:', err.message ?? err)
      })
    })()

    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [workspaceId])

  return online
}
