'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import type { BoardNote, NoteBoardActions } from '@/lib/notes/types'
import { ALLOWED_IMAGE_TYPES } from '@/lib/storage'
import { CloseIcon, ImageIcon } from './icons'

/** Thumbnail grid of a note's images + an upload button (used in the editor). */
export function ImageUploader({
  note,
  actions,
}: {
  note: BoardNote
  actions: NoteBoardActions
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy(true)
    setError(null)
    for (const file of Array.from(files)) {
      const err = await actions.uploadImage(note.id, file)
      if (err) {
        setError(err)
        break
      }
    }
    setBusy(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div>
      {note.attachments.length > 0 && (
        <div className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {note.attachments.map((att) =>
            att.signedUrl ? (
              <div key={att.id} className="group relative aspect-square overflow-hidden rounded-md border border-border">
                <Image
                  src={att.signedUrl}
                  alt=""
                  fill
                  sizes="120px"
                  className="object-cover"
                  unoptimized
                />
                <button
                  type="button"
                  onClick={() => actions.removeAttachment(note.id, att.id)}
                  aria-label="Remove image"
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null,
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(',')}
        multiple
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-neutral-500 transition hover:bg-black/5 hover:text-foreground disabled:opacity-60 dark:hover:bg-white/10"
      >
        <ImageIcon className="h-3.5 w-3.5" />
        {busy ? 'Uploading…' : 'Add image'}
      </button>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}
