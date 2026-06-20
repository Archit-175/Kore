'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { initials } from '@/lib/presence'
import { timeAgo } from '@/lib/format-time'
import { useWorkspaceTable } from '@/lib/realtime/workspace-tables'
import { loadWorkspaceMembers } from '@/lib/databases/load-database'
import { loadComments } from '@/lib/comments/load-comments'
import type { CommentItem, CommentTarget } from '@/lib/comments/types'
import { addComment, deleteComment, editComment } from '@/lib/actions/comments'
import {
  MentionTextarea,
  extractMentionIds,
  renderMessageBody,
  type MentionMember,
} from '@/components/mentions'

/**
 * Reusable comments thread for a Docs page (right-side panel / mobile drawer) or
 * a Note card (a section in the editor modal). Realtime via the SHARED workspace
 * singleton (useWorkspaceTable) — fires on ANY comment change in the workspace,
 * so the callback refetches THIS target only. Author edits/deletes own; owner may
 * delete any.
 */
export function CommentsPanel({
  targetType,
  targetId,
  workspaceId,
  currentUserId,
  isOwner,
  onClose,
  inline = false,
}: {
  targetType: CommentTarget
  targetId: string
  workspaceId: string
  currentUserId: string
  isOwner: boolean
  onClose?: () => void
  /** inline = natural height for a host that scrolls (e.g. the note modal);
   *  otherwise the panel fills its host's height with its own internal scroll. */
  inline?: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const [members, setMembers] = useState<MentionMember[]>([])
  const [comments, setComments] = useState<CommentItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Members for the @-mention picker + chip rendering (loaded once on mount).
  useEffect(() => {
    let cancelled = false
    void loadWorkspaceMembers(supabase, workspaceId).then((m) => {
      if (!cancelled) setMembers(m)
    })
    return () => {
      cancelled = true
    }
  }, [supabase, workspaceId])

  const refetch = useCallback(async () => {
    const list = await loadComments(supabase, workspaceId, targetType, targetId)
    setComments(list)
    setLoaded(true)
  }, [supabase, workspaceId, targetType, targetId])

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void refetch(), 300)
  }, [refetch])

  useEffect(() => {
    schedule()
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [schedule])

  useWorkspaceTable(workspaceId, 'comments', schedule)

  const add = async () => {
    const body = draft.trim()
    if (!body || busy) return
    setBusy(true)
    const mentions = extractMentionIds(body, members)
    const res = await addComment({ targetType, targetId, body, mentions })
    setBusy(false)
    if (!res.error) {
      setDraft('')
      void refetch()
    }
  }

  const saveEdit = async (id: string) => {
    const body = editDraft.trim()
    if (!body) return
    setEditingId(null)
    const res = await editComment(id, body)
    if (!res.error) void refetch()
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this comment?')) return
    // optimistic
    setComments((prev) => prev.filter((c) => c.id !== id))
    const res = await deleteComment(id)
    if (res.error) void refetch()
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

      <div
        className={
          inline
            ? 'space-y-3 px-1 py-3'
            : 'min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3'
        }
      >
        {loaded && comments.length === 0 && (
          <p className="py-6 text-center text-xs text-neutral-400">
            No comments yet. Start the conversation.
          </p>
        )}
        {comments.map((c) => {
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
                        onClick={() => void remove(c.id)}
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
                      onSubmit={() => void saveEdit(c.id)}
                      autoFocus
                      ariaLabel="Edit comment"
                    />
                    <div className="mt-1 flex gap-2 text-[11px]">
                      <button
                        onClick={() => void saveEdit(c.id)}
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
            disabled={busy || !draft.trim()}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Comment
          </button>
        </div>
      </div>
    </div>
  )
}
