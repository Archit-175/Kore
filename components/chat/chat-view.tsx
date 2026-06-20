'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { getSignedUrls } from '@/lib/storage'
import type { PresenceUser } from '@/lib/presence'
import { useWorkspacePresence } from '@/lib/use-workspace-presence'
import { OnlineAvatars } from '@/components/shell/online-avatars'
import {
  CHAT_PAGE_SIZE,
  loadChatMessages,
  loadChatWindow,
} from '@/lib/chat/load-chat'
import {
  deleteMessage,
  editMessage,
  markChannelRead,
  sendMessage,
  toggleReaction,
} from '@/lib/actions/chat'
import type { ChatAttachment, ChatMessage, ChatPage } from '@/lib/chat/types'
import type { MentionMember } from '@/components/mentions'
import { ChatTimeline, type ChatTimelineHandle } from './chat-timeline'
import { MessageComposer } from './message-composer'

const RELOAD_DEBOUNCE = 250

export function ChatView({
  initial,
  members,
  workspaceId,
  user,
  isOwner,
}: {
  initial: ChatPage
  members: MentionMember[]
  workspaceId: string
  user: PresenceUser
  isOwner: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const channelId = useId()
  const online = useWorkspacePresence(workspaceId, user)

  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages)
  const [hasMore, setHasMore] = useState(initial.hasMore)
  const [oldestCursor, setOldestCursor] = useState(initial.oldestCursor)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null)
  const [urlMap, setUrlMap] = useState<Record<string, string>>({})

  const timelineRef = useRef<ChatTimelineHandle>(null)
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastMarkedRef = useRef<string | null>(null)
  const pendingReloadRef = useRef(false)

  // Refs mirroring state for use inside async callbacks (avoid stale closures).
  const oldestRef = useRef(oldestCursor)
  const hasMoreRef = useRef(hasMore)
  const messagesRef = useRef(messages)
  const urlMapRef = useRef(urlMap)
  const replyingRef = useRef(replyingTo)
  const loadingOlderRef = useRef(false)
  useEffect(() => {
    oldestRef.current = oldestCursor
  }, [oldestCursor])
  useEffect(() => {
    hasMoreRef.current = hasMore
  }, [hasMore])
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])
  useEffect(() => {
    urlMapRef.current = urlMap
  }, [urlMap])
  useEffect(() => {
    replyingRef.current = replyingTo
  }, [replyingTo])

  const markReadLatest = useCallback(() => {
    const msgs = messagesRef.current
    const last = msgs[msgs.length - 1]
    if (!last || lastMarkedRef.current === last.id) return
    lastMarkedRef.current = last.id
    void markChannelRead(last.id)
  }, [])

  const reload = useCallback(async () => {
    // Don't run concurrently with a scroll-load (which is moving the anchor and
    // prepending older rows) — defer and let loadOlder re-trigger us afterward.
    if (loadingOlderRef.current) {
      pendingReloadRef.current = true
      return
    }
    const anchor = oldestRef.current
    if (!anchor) {
      const page = await loadChatMessages(supabase, workspaceId, user.id, {})
      setMessages(page.messages)
      setHasMore(page.hasMore)
      setOldestCursor(page.oldestCursor)
      return
    }
    const windowMsgs = await loadChatWindow(supabase, workspaceId, user.id, anchor)
    // A scroll-load that started mid-flight moved the anchor — drop this stale
    // window so we don't clobber the just-prepended page.
    if (oldestRef.current === anchor) setMessages(windowMsgs)
  }, [supabase, workspaceId, user.id])

  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current)
    reloadTimer.current = setTimeout(() => void reload(), RELOAD_DEBOUNCE)
  }, [reload])

  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current || !oldestRef.current || !hasMoreRef.current) return
    loadingOlderRef.current = true
    setLoadingOlder(true)
    try {
      const older = await loadChatMessages(supabase, workspaceId, user.id, {
        before: oldestRef.current,
        limit: CHAT_PAGE_SIZE,
      })
      if (older.messages.length > 0) {
        setMessages((prev) => [...older.messages, ...prev])
      }
      setHasMore(older.hasMore)
      if (older.oldestCursor) setOldestCursor(older.oldestCursor)
    } finally {
      setLoadingOlder(false)
      loadingOlderRef.current = false
      // Flush a realtime reload that arrived while we were loading older rows.
      if (pendingReloadRef.current) {
        pendingReloadRef.current = false
        void reload()
      }
    }
  }, [supabase, workspaceId, user.id, reload])

  // Dedicated realtime channel for the chat route (mirrors DatabaseView). The
  // sidebar badge subscribes separately via the shared singleton.
  useEffect(() => {
    let channel: RealtimeChannel | null = null
    let cancelled = false
    void (async () => {
      const { data } = await supabase.auth.getSession()
      await supabase.realtime.setAuth(data.session?.access_token ?? null)
      if (cancelled) return
      const filter = `workspace_id=eq.${workspaceId}`
      channel = supabase
        .channel(`chat:${workspaceId}:${channelId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter }, scheduleReload)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions', filter }, scheduleReload)
        .subscribe()
    })()
    return () => {
      cancelled = true
      if (reloadTimer.current) clearTimeout(reloadTimer.current)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [supabase, workspaceId, channelId, scheduleReload])

  // Resolve signed URLs for any new attachment paths.
  useEffect(() => {
    const paths = [
      ...new Set(messages.flatMap((m) => m.attachments.map((a) => a.path))),
    ].filter((p) => !(p in urlMapRef.current))
    if (paths.length === 0) return
    let cancelled = false
    void getSignedUrls(supabase, paths).then((map) => {
      if (!cancelled) setUrlMap((prev) => ({ ...prev, ...map }))
    })
    return () => {
      cancelled = true
    }
  }, [messages, supabase])

  // Mark the channel read when the latest message is in view.
  useEffect(() => {
    if (timelineRef.current?.isAtBottom()) markReadLatest()
  }, [messages, markReadLatest])

  // Deep-link from search (`/chat#msg-{id}`): scroll to + flash the message,
  // retrying briefly while the initial page renders. A target older than the
  // loaded window simply isn't found (we stay on the latest messages).
  useEffect(() => {
    const m = window.location.hash.match(/^#msg-(.+)$/)
    if (!m) return
    const id = m[1]
    let tries = 0
    const tick = () => {
      const el = document.getElementById(`msg-${id}`)
      if (el) {
        el.scrollIntoView({ block: 'center' })
        el.classList.add('kore-msg-flash')
        setTimeout(() => el.classList.remove('kore-msg-flash'), 1200)
      } else if (tries++ < 12) {
        setTimeout(tick, 200)
      }
    }
    tick()
  }, [])

  const handleSend = useCallback(
    async (body: string, mentions: string[], attachments: ChatAttachment[]) => {
      const res = await sendMessage({
        body,
        mentions,
        attachments,
        parentMessageId: replyingRef.current?.id ?? null,
      })
      if (res.error) throw new Error(res.error)
      setReplyingTo(null)
      await reload()
      requestAnimationFrame(() => timelineRef.current?.scrollToBottom())
    },
    [reload],
  )

  const handleReact = useCallback(
    (messageId: string, emoji: string) => {
      void toggleReaction(messageId, emoji).then(() => scheduleReload())
    },
    [scheduleReload],
  )

  const handleEdit = useCallback(
    (messageId: string, body: string) => {
      void editMessage(messageId, body).then(() => scheduleReload())
    },
    [scheduleReload],
  )

  const handleDelete = useCallback(
    (messageId: string) => {
      void deleteMessage(messageId).then(() => scheduleReload())
    },
    [scheduleReload],
  )

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold">Team chat</h1>
          <p className="text-xs text-neutral-400">
            {online.length > 0 ? `${online.length} online` : 'Workspace channel'}
          </p>
        </div>
        <OnlineAvatars users={online} />
      </header>

      <ChatTimeline
        handleRef={timelineRef}
        messages={messages}
        members={members}
        currentUserId={user.id}
        isOwner={isOwner}
        urlMap={urlMap}
        hasMore={hasMore}
        loadingOlder={loadingOlder}
        onLoadOlder={loadOlder}
        onReply={setReplyingTo}
        onReact={handleReact}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      <MessageComposer
        workspaceId={workspaceId}
        members={members}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        onSend={handleSend}
      />
    </div>
  )
}
