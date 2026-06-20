'use client'

import { useEffect, useState } from 'react'
import { initials } from '@/lib/presence'
import { clockTime } from '@/lib/format-time'
import { REACTION_EMOJI, type ChatMessage } from '@/lib/chat/types'
import {
  MentionTextarea,
  extractMentionIds,
  renderMessageBody,
  type MentionMember,
} from '@/components/mentions'

function scrollToMessage(id: string) {
  const el = document.getElementById(`msg-${id}`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('kore-msg-flash')
  setTimeout(() => el.classList.remove('kore-msg-flash'), 1200)
}

/** Render the message time CLIENT-ONLY: clockTime is locale/timezone-dependent,
 *  and the initial messages are SSR'd, so rendering it on the server would always
 *  mismatch the browser's locale/TZ on hydration. Empty on the server → no diff. */
function ClockTime({ iso }: { iso: string }) {
  const [text, setText] = useState('')
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(clockTime(iso))
  }, [iso])
  return (
    <span className="shrink-0 text-[11px] text-neutral-400" suppressHydrationWarning>
      {text}
    </span>
  )
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-indigo-500 text-[11px] font-semibold text-white">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  )
}

function isImage(mime: string): boolean {
  return mime.startsWith('image/')
}

export function MessageRow({
  message,
  members,
  currentUserId,
  isOwner,
  urlMap,
  onReply,
  onReact,
  onEdit,
  onDelete,
}: {
  message: ChatMessage
  members: MentionMember[]
  currentUserId: string
  isOwner: boolean
  urlMap: Record<string, string>
  onReply: (m: ChatMessage) => void
  onReact: (messageId: string, emoji: string) => void
  onEdit: (messageId: string, body: string) => void
  onDelete: (messageId: string) => void
}) {
  const mine = message.authorId === currentUserId
  const [pickerOpen, setPickerOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.body)

  const saveEdit = () => {
    const next = draft.trim()
    if (next && next !== message.body) onEdit(message.id, next)
    setEditing(false)
  }

  return (
    <div id={`msg-${message.id}`} className="group relative flex gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-black/[0.03] dark:hover:bg-white/[0.03]">
      <Avatar name={message.authorName} url={message.authorAvatarUrl} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold">{message.authorName}</span>
          <ClockTime iso={message.createdAt} />
          {message.editedAt && <span className="shrink-0 text-[11px] text-neutral-400">(edited)</span>}
        </div>

        {/* Quoted parent (WhatsApp-style inline reply) */}
        {message.quoted && (
          <button
            type="button"
            onClick={() => message.quoted && scrollToMessage(message.quoted.id)}
            className="mt-1 flex w-full max-w-md flex-col items-start gap-0.5 rounded-md border-l-2 border-indigo-400 bg-indigo-500/5 px-2 py-1 text-left"
          >
            <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-300">
              {message.quoted.authorName}
            </span>
            <span className="line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">
              {message.quoted.body || 'message unavailable'}
            </span>
          </button>
        )}

        {editing ? (
          <div className="mt-1">
            <MentionTextarea
              value={draft}
              onChange={setDraft}
              members={members}
              onSubmit={saveEdit}
              autoFocus
              ariaLabel="Edit message"
            />
            <div className="mt-1 flex gap-2 text-xs">
              <button onClick={saveEdit} className="rounded bg-indigo-600 px-2 py-1 font-medium text-white hover:bg-indigo-500">
                Save
              </button>
              <button
                onClick={() => {
                  setDraft(message.body)
                  setEditing(false)
                }}
                className="rounded px-2 py-1 text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10"
              >
                Cancel
              </button>
              <span className="self-center text-neutral-400">Enter to save · Esc to cancel</span>
            </div>
          </div>
        ) : (
          message.body && (
            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-neutral-800 dark:text-neutral-200">
              {renderMessageBody(message.body, members)}
            </p>
          )
        )}

        {/* Attachments */}
        {message.attachments.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-2">
            {message.attachments.map((att) => {
              const url = urlMap[att.path]
              if (isImage(att.mime) && url) {
                return (
                  <a key={att.path} href={url} target="_blank" rel="noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={att.name}
                      className="max-h-48 max-w-[16rem] rounded-lg border border-border object-cover"
                    />
                  </a>
                )
              }
              return (
                <a
                  key={att.path}
                  href={url ?? '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <span>📎</span>
                  <span className="max-w-[12rem] truncate">{att.name}</span>
                </a>
              )
            })}
          </div>
        )}

        {/* Reactions */}
        {message.reactions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => onReact(message.id, r.emoji)}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${
                  r.mine
                    ? 'border-indigo-400 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300'
                    : 'border-border bg-surface hover:bg-black/5 dark:hover:bg-white/5'
                }`}
                title={r.mine ? 'Remove your reaction' : 'React'}
              >
                <span>{r.emoji}</span>
                <span>{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hover toolbar */}
      {!editing && (
        <div className="absolute right-2 top-0 flex -translate-y-1/2 items-center gap-0.5 rounded-md border border-border bg-background p-0.5 opacity-0 shadow-sm transition group-hover:opacity-100">
          <div className="relative">
            <button
              onClick={() => setPickerOpen((v) => !v)}
              title="React"
              className="flex h-7 w-7 items-center justify-center rounded text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10"
            >
              <span className="text-sm">☺</span>
            </button>
            {pickerOpen && (
              <div className="absolute right-0 top-8 z-20 flex gap-0.5 rounded-lg border border-border bg-surface p-1 shadow-lg">
                {REACTION_EMOJI.map((e) => (
                  <button
                    key={e}
                    onClick={() => {
                      onReact(message.id, e)
                      setPickerOpen(false)
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded text-base hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => onReply(message)}
            title="Reply"
            className="flex h-7 w-7 items-center justify-center rounded text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10"
          >
            <span className="text-sm">↩</span>
          </button>
          {mine && (
            <button
              onClick={() => {
                setDraft(message.body)
                setEditing(true)
              }}
              title="Edit"
              className="flex h-7 w-7 items-center justify-center rounded text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10"
            >
              <span className="text-xs">✏️</span>
            </button>
          )}
          {(mine || isOwner) && (
            <button
              onClick={() => {
                if (confirm('Delete this message?')) onDelete(message.id)
              }}
              title="Delete"
              className="flex h-7 w-7 items-center justify-center rounded text-red-500 hover:bg-red-500/10"
            >
              <span className="text-xs">🗑</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Re-export so message-row consumers can reuse the extractor without a deep import.
export { extractMentionIds }
