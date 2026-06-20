'use client'

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import type { ChatMessage } from '@/lib/chat/types'
import type { MentionMember } from '@/components/mentions'
import { MessageRow } from './message-row'

export type ChatTimelineHandle = { scrollToBottom: () => void; isAtBottom: () => boolean }

/**
 * The single-column message list. Owns scroll behaviour:
 *  - infinite scroll UP via an IntersectionObserver sentinel at the top; on
 *    prepend it restores scrollTop so the viewport stays on the same message.
 *  - sticks to the bottom on new messages only when the user is already there.
 */
export function ChatTimeline({
  messages,
  members,
  currentUserId,
  isOwner,
  urlMap,
  hasMore,
  loadingOlder,
  onLoadOlder,
  onReply,
  onReact,
  onEdit,
  onDelete,
  handleRef,
}: {
  messages: ChatMessage[]
  members: MentionMember[]
  currentUserId: string
  isOwner: boolean
  urlMap: Record<string, string>
  hasMore: boolean
  loadingOlder: boolean
  onLoadOlder: () => void
  onReply: (m: ChatMessage) => void
  onReact: (messageId: string, emoji: string) => void
  onEdit: (messageId: string, body: string) => void
  onDelete: (messageId: string) => void
  handleRef?: React.Ref<ChatTimelineHandle>
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const prependingRef = useRef(false)
  const prevHeightRef = useRef(0)
  const prevTopRef = useRef(0)

  const isAtBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }, [])

  useImperativeHandle(
    handleRef,
    () => ({
      scrollToBottom: () => {
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
      },
      isAtBottom,
    }),
    [isAtBottom],
  )

  // Safety: if a scroll-load resolved with NO older rows, `messages` doesn't
  // change so the layout effect below never runs — clear the prepend flag here
  // when loading ends so future prepends/stick-to-bottom aren't frozen.
  useEffect(() => {
    if (!loadingOlder) prependingRef.current = false
  }, [loadingOlder])

  // After the message list changes: restore scroll on prepend, else stick to
  // bottom when the user was already there.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (prependingRef.current) {
      el.scrollTop = el.scrollHeight - prevHeightRef.current + prevTopRef.current
      prependingRef.current = false
    } else if (stickRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  // Top sentinel → load older.
  useEffect(() => {
    const root = scrollRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel || !hasMore) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingOlder && !prependingRef.current) {
          prependingRef.current = true
          prevHeightRef.current = root.scrollHeight
          prevTopRef.current = root.scrollTop
          onLoadOlder()
        }
      },
      { root, rootMargin: '120px 0px 0px 0px' },
    )
    obs.observe(sentinel)
    return () => obs.disconnect()
  }, [hasMore, loadingOlder, onLoadOlder])

  return (
    <div
      ref={scrollRef}
      onScroll={() => {
        stickRef.current = isAtBottom()
      }}
      className="min-h-0 flex-1 overflow-y-auto px-2 py-3 sm:px-4"
    >
      <div ref={sentinelRef} />
      {hasMore && (
        <p className="py-2 text-center text-xs text-neutral-400">
          {loadingOlder ? 'Loading earlier messages…' : 'Scroll up for earlier messages'}
        </p>
      )}
      {messages.length === 0 && (
        <div className="flex h-full flex-col items-center justify-center py-16 text-center text-sm text-neutral-400">
          <p className="text-2xl">💬</p>
          <p className="mt-2">No messages yet. Say hello to your team.</p>
        </div>
      )}
      <div className="flex flex-col gap-0.5">
        {messages.map((m) => (
          <MessageRow
            key={m.id}
            message={m}
            members={members}
            currentUserId={currentUserId}
            isOwner={isOwner}
            urlMap={urlMap}
            onReply={onReply}
            onReact={onReact}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}
