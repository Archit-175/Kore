'use client'

import { useEffect, useRef, useState } from 'react'
import type { NoteColor } from '@/lib/notes/colors'
import { NOTE_COLOR_CLASSES } from '@/lib/notes/colors'
import { ColorPicker } from './color-picker'
import { PinFilledIcon, PinIcon } from './icons'

export type ComposerInput = {
  title: string
  content: string
  color: NoteColor
  pinned: boolean
}

/** "Take a note…" quick-add card pinned to the top of the active board. */
export function NoteComposer({ onCreate }: { onCreate: (input: ComposerInput) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [color, setColor] = useState<NoteColor>('default')
  const [pinned, setPinned] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  function reset() {
    setTitle('')
    setContent('')
    setColor('default')
    setPinned(false)
    setExpanded(false)
  }

  async function save() {
    if (title.trim() || content.trim()) {
      await onCreate({ title: title.trim(), content, color, pinned })
    }
    reset()
  }

  useEffect(() => {
    if (!expanded) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) void save()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, title, content, color, pinned])

  return (
    <div
      ref={ref}
      className={`mx-auto mb-6 max-w-xl rounded-lg border shadow-sm transition ${NOTE_COLOR_CLASSES[color].card}`}
    >
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full px-4 py-3 text-left text-sm text-neutral-500"
        >
          Take a note…
        </button>
      ) : (
        <div className="p-3">
          <div className="flex items-start gap-2">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-neutral-400"
            />
            <button
              type="button"
              onClick={() => setPinned((v) => !v)}
              aria-label={pinned ? 'Unpin' : 'Pin'}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition hover:bg-black/5 dark:hover:bg-white/10 ${
                pinned ? 'text-indigo-600 dark:text-indigo-300' : 'text-neutral-400'
              }`}
            >
              {pinned ? <PinFilledIcon className="h-4 w-4" /> : <PinIcon className="h-4 w-4" />}
            </button>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save()
            }}
            placeholder="Take a note…"
            rows={3}
            className="mt-2 w-full resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-neutral-400"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <ColorPicker value={color} onChange={setColor} />
            <button
              type="button"
              onClick={() => void save()}
              className="rounded-md px-3 py-1 text-sm font-medium text-neutral-700 hover:bg-black/5 dark:text-neutral-200 dark:hover:bg-white/10"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
