'use client'

import { useEffect, useState } from 'react'
import { useDemo } from '@/lib/demo/context'
import { initials } from '@/lib/presence'
import { timeAgo } from '@/lib/format-time'
import type { CommentItem, CommentTarget } from '@/lib/comments/types'
import { MentionTextarea, extractMentionIds, renderMessageBody } from '@/components/mentions'

/**
 * Demo fork of CommentsPanel — same UI + leaves (MentionTextarea, chip rendering),
 * but comments live in the DemoStore keyed by `${targetType}:${targetId}`. No
 * Supabase, no realtime, no loaders. Props match CommentsPanel so it drops into
 * the same slots (note modal + docs page). Mirrors the real `loaded` gate so
 * timestamps only render on the client (no SSR/hydration drift).
 */
export function DemoCommentsPanel({
  targetType,
  targetId,
  currentUserId,
  isOwner,
  onClose,
  inline = false,
}: {
  targetType: CommentTarget
  targetId: string
  workspaceId?: string
  currentUserId: string
  isOwner: boolean
  onClose?: () => void
  inline?: boolean
}) {
  const store = useDemo()
  const key = `${targetType}:${targetId}`
  const comments = store.getComments(key)
  const members = store.members

  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  useEffect(() => {
    // Mirror the real panel's client-only load so timestamps don't render on SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaded(true)
  }, [])

  const add = () => {
    const body = draft.trim()
    if (!body) return
    const me = store.memberById(currentUserId)
    const item: CommentItem = {
      id: crypto.randomUUID(),
      authorId: currentUserId,
      authorName: me?.name ?? 'You',
      authorAvatarUrl: me?.avatarUrl ?? null,
      body,
      mentions: extractMentionIds(body, members),
      createdAt: new Date().toISOString(),
      edited: false,
    }
    store.setComments(key, (prev) => [...prev, item])
    setDraft('')
  }

  const saveEdit = (id: string) => {
    const body = editDraft.trim()
    if (!body) return
    setEditingId(null)
    store.setComments(key, (prev) => prev.map((c) => (c.id === id ? { ...c, body, edited: true } : c)))
  }

  const remove = (id: string) => {
    store.setComments(key, (prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <div className={inline ? 'flex flex-col' : 'flex h-full min-h-0 flex-col'}>
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <h3 className="text-sm font-semibold">
          Comments{comments.length > 0 && ` (${comments.length})`}
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close comments"
            className="rounded p-1 text-neutral-400 hover:bg-black/5 hover:text-neutral-600 dark:hover:bg-white/10"
          >
            ✕
          </button>
        )}
      </div>

      <div className={inline ? 'space-y-3 px-1 py-3' : 'min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3'}>
        {loaded && comments.length === 0 && (
          <p className="py-6 text-center text-xs text-neutral-400">No comments yet. Start the conversation.</p>
        )}
        {loaded &&
          comments.map((c) => {
            const mine = c.authorId === currentUserId
            return (
              <div key={c.id} className="group flex gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-indigo-500 text-[10px] font-semibold text-white">
                  {c.authorAvatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.authorAvatarUrl} alt={c.authorName} className="h-full w-full object-cover" />
                  ) : (
                    initials(c.authorName)
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-xs font-semibold">{c.authorName}</span>
                    <span className="shrink-0 text-[10px] text-neutral-400">{timeAgo(c.createdAt)}</span>
                    {c.edited && <span className="shrink-0 text-[10px] text-neutral-400">(edited)</span>}
                    {(mine || isOwner) && editingId !== c.id && (
                      <span className="ml-auto flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
                        {mine && (
                          <button
                            onClick={() => {
                              setEditingId(c.id)
                              setEditDraft(c.body)
                            }}
                            className="text-[10px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                          >
                            Edit
                          </button>
                        )}
                        <button
                          onClick={() => remove(c.id)}
                          className="text-[10px] text-neutral-400 hover:text-red-500"
                        >
                          Delete
                        </button>
                      </span>
                    )}
                  </div>
                  {editingId === c.id ? (
                    <div className="mt-1">
                      <MentionTextarea
                        value={editDraft}
                        onChange={setEditDraft}
                        members={members}
                        onSubmit={() => saveEdit(c.id)}
                        autoFocus
                        ariaLabel="Edit comment"
                      />
                      <div className="mt-1 flex gap-2 text-[11px]">
                        <button
                          onClick={() => saveEdit(c.id)}
                          className="rounded bg-indigo-600 px-2 py-0.5 font-medium text-white hover:bg-indigo-500"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="rounded px-2 py-0.5 text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-neutral-700 dark:text-neutral-300">
                      {renderMessageBody(c.body, members)}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
      </div>

      <div className={inline ? 'border-t border-border px-1 pt-2' : 'shrink-0 border-t border-border p-2'}>
        <MentionTextarea
          value={draft}
          onChange={setDraft}
          members={members}
          onSubmit={add}
          placeholder="Add a comment…  (@ to mention)"
          ariaLabel="Add a comment"
        />
        <div className="mt-1.5 flex justify-end">
          <button
            onClick={add}
            disabled={!draft.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Comment
          </button>
        </div>
      </div>
    </div>
  )
}
