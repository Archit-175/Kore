'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useDemo } from '@/lib/demo/context'
import { OnlineAvatars } from '@/components/shell/online-avatars'
import type { ChatAttachment, ChatMessage } from '@/lib/chat/types'
import { ChatTimeline, type ChatTimelineHandle } from '@/components/chat/chat-timeline'
import { DemoMessageComposer } from './demo-message-composer'

/** Demo fork of ChatView: reuses ChatTimeline + MessageRow verbatim, but messages
 *  live in the DemoStore and every send/react/edit/delete is a local mutation. No
 *  realtime channel, no keyset loaders, no Storage. */
export function DemoChatView() {
  const store = useDemo()
  const messages = store.chat
  const members = store.members
  const online = useMemo(() => [store.presenceUser, ...store.onlinePeers], [store])
  const currentUserId = store.currentUserId

  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null)
  const timelineRef = useRef<ChatTimelineHandle>(null)

  // Attachment paths are already usable (blob/data URLs), so map each to itself.
  const urlMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const m of messages) for (const a of m.attachments) map[a.path] = a.path
    return map
  }, [messages])

  const handleSend = useCallback(
    (body: string, mentions: string[], attachments: ChatAttachment[]) => {
      const reply = replyingTo
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        authorId: currentUserId,
        authorName: store.presenceUser.name,
        authorAvatarUrl: store.presenceUser.avatarUrl,
        body,
        parentMessageId: reply?.id ?? null,
        quoted: reply ? { id: reply.id, authorName: reply.authorName, body: reply.body } : null,
        mentions,
        attachments,
        reactions: [],
        editedAt: null,
        createdAt: new Date().toISOString(),
      }
      store.setChat((prev) => [...prev, msg])
      setReplyingTo(null)
      requestAnimationFrame(() => timelineRef.current?.scrollToBottom())
    },
    [store, currentUserId, replyingTo],
  )

  const handleReact = useCallback(
    (messageId: string, emoji: string) => {
      store.setChat((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m
          const existing = m.reactions.find((r) => r.emoji === emoji)
          let reactions
          if (!existing) {
            reactions = [...m.reactions, { emoji, count: 1, mine: true }]
          } else if (existing.mine) {
            reactions = m.reactions
              .map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, mine: false } : r))
              .filter((r) => r.count > 0)
          } else {
            reactions = m.reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, mine: true } : r))
          }
          return { ...m, reactions }
        }),
      )
    },
    [store],
  )

  const handleEdit = useCallback(
    (messageId: string, body: string) => {
      store.setChat((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, body, editedAt: new Date().toISOString() } : m)),
      )
    },
    [store],
  )

  const handleDelete = useCallback(
    (messageId: string) => {
      store.setChat((prev) => prev.filter((m) => m.id !== messageId))
    },
    [store],
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
        currentUserId={currentUserId}
        isOwner
        urlMap={urlMap}
        hasMore={false}
        loadingOlder={false}
        onLoadOlder={() => {}}
        onReply={setReplyingTo}
        onReact={handleReact}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      <DemoMessageComposer
        members={members}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        onSend={handleSend}
      />
    </div>
  )
}
