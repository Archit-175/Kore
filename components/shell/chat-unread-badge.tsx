'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useWorkspaceTable } from '@/lib/realtime/workspace-tables'
import { loadUnreadCount } from '@/lib/chat/load-chat'

/**
 * The small client island that keeps the sidebar Chat badge live without making
 * the server-rendered layout reactive. Subscribes via the SHARED workspace
 * singleton (messages + message_reads) and recomputes the unread count; clears
 * instantly while the user is on /chat (the chat view marks the channel read).
 */
export function ChatUnreadBadge({
  workspaceId,
  currentUserId,
  initial,
  dot = false,
}: {
  workspaceId: string
  currentUserId: string
  initial: number
  /** dot = a compact indicator for the collapsed rail; otherwise a count pill. */
  dot?: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const pathname = usePathname()
  const [count, setCount] = useState(initial)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onChat = pathname === '/chat'

  const refetch = useCallback(async () => {
    setCount(await loadUnreadCount(supabase, workspaceId, currentUserId))
  }, [supabase, workspaceId, currentUserId])

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void refetch(), 400)
  }, [refetch])

  useWorkspaceTable(workspaceId, 'messages', schedule)
  useWorkspaceTable(workspaceId, 'message_reads', schedule)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  // Optimistically clear while viewing the channel.
  const shown = onChat ? 0 : count
  if (shown <= 0) return null

  if (dot) {
    return (
      <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-indigo-500 ring-2 ring-surface" />
    )
  }
  return (
    <span className="ml-auto shrink-0 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
      {shown > 99 ? '99+' : shown}
    </span>
  )
}
