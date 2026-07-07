'use client'

import { useRef, useState } from 'react'
import type { ChatAttachment, ChatMessage } from '@/lib/chat/types'
import { MentionTextarea, extractMentionIds, type MentionMember } from '@/components/mentions'

/** Demo fork of MessageComposer — same UI, but file "uploads" become in-memory
 *  object URLs (no Supabase Storage). */
export function DemoMessageComposer({
  members,
  replyingTo,
  onCancelReply,
  onSend,
}: {
  members: MentionMember[]
  replyingTo: ChatMessage | null
  onCancelReply: () => void
  onSend: (body: string, mentions: string[], attachments: ChatAttachment[]) => void
}) {
  const [body, setBody] = useState('')
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const pickFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    for (const file of Array.from(files).slice(0, 6)) {
      const url = URL.createObjectURL(file)
      setAttachments((prev) => [...prev, { path: url, mime: file.type, name: file.name, size: file.size }])
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const submit = () => {
    const text = body.trim()
    if (!text && attachments.length === 0) return
    const mentions = extractMentionIds(text, members)
    onSend(text, mentions, attachments)
    setBody('')
    setAttachments([])
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

      <div className="flex items-end gap-2">
        <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => pickFiles(e.target.files)} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
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
          disabled={!body.trim() && attachments.length === 0}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  )
}
