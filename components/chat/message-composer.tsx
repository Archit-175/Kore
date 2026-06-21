'use client'

import { useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadChatFile } from '@/lib/storage'
import type { ChatAttachment, ChatMessage } from '@/lib/chat/types'
import { MentionTextarea, extractMentionIds, type MentionMember } from '@/components/mentions'
import { Spinner } from '@/components/spinner'

export function MessageComposer({
  workspaceId,
  members,
  replyingTo,
  onCancelReply,
  onSend,
}: {
  workspaceId: string
  members: MentionMember[]
  replyingTo: ChatMessage | null
  onCancelReply: () => void
  onSend: (body: string, mentions: string[], attachments: ChatAttachment[]) => Promise<void>
}) {
  const supabase = useMemo(() => createClient(), [])
  const [body, setBody] = useState('')
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const pickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError(null)
    setBusy(true)
    try {
      for (const file of Array.from(files).slice(0, 6)) {
        const res = await uploadChatFile(supabase, { workspaceId, file })
        if (res.error || !res.path) {
          setError(res.error ?? 'Upload failed.')
          continue
        }
        setAttachments((prev) => [
          ...prev,
          { path: res.path!, mime: file.type, name: file.name, size: file.size },
        ])
      }
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const submit = async () => {
    const text = body.trim()
    if ((!text && attachments.length === 0) || busy) return
    setBusy(true)
    setError(null)
    const mentions = extractMentionIds(text, members)
    try {
      await onSend(text, mentions, attachments)
      setBody('')
      setAttachments([])
    } catch {
      setError('Could not send. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-t border-border bg-background px-3 py-2.5">
      {replyingTo && (
        <div className="mb-2 flex items-center gap-2 rounded-md border-l-2 border-indigo-400 bg-indigo-500/5 px-2 py-1 text-xs">
          <span className="font-medium text-indigo-600 dark:text-indigo-300">
            Replying to {replyingTo.authorName}
          </span>
          <span className="min-w-0 flex-1 truncate text-neutral-500">{replyingTo.body}</span>
          <button
            onClick={onCancelReply}
            aria-label="Cancel reply"
            className="shrink-0 rounded px-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
          >
            ✕
          </button>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a, i) => (
            <span
              key={a.path}
              className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-xs"
            >
              <span className="max-w-[10rem] truncate">📎 {a.name}</span>
              <button
                onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                aria-label="Remove attachment"
                className="text-neutral-400 hover:text-red-500"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {error && <p className="mb-1 text-xs text-red-500">{error}</p>}

      <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => void pickFiles(e.target.files)}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          title="Attach a file"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-neutral-500 hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
        >
          📎
        </button>
        <div className="min-w-0 flex-1">
          <MentionTextarea
            value={body}
            onChange={setBody}
            members={members}
            onSubmit={submit}
            placeholder="Message your team…  (@ to mention, Enter to send)"
            ariaLabel="Message"
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={busy || (!body.trim() && attachments.length === 0)}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy && <Spinner className="h-3.5 w-3.5" label="Sending message" />}
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
