'use client'

import { useEffect, useRef, useState } from 'react'

// A small curated emoji set — no dependency / component library (keeps the $0,
// no-UI-kit constraint). Enough variety for page icons without a full picker.
const EMOJIS = [
  '📄', '📝', '📃', '📑', '🗒️', '📋', '📌', '📎',
  '📁', '📂', '🗂️', '🗃️', '📚', '📖', '📕', '📗',
  '💡', '🔥', '⭐', '✨', '🎯', '🚀', '🛠️', '⚙️',
  '✅', '📅', '🗓️', '⏰', '📊', '📈', '📉', '🧩',
  '💬', '📣', '🔔', '❤️', '🧠', '👀', '🙌', '🎉',
  '🌐', '🔗', '🔒', '🔑', '🏠', '🏢', '🧪', '🔬',
  '💻', '📱', '🖥️', '🗄️', '🧾', '💼', '🏷️', '🔖',
]

/** Click-to-set page icon: shows the current emoji (or an "Add icon" affordance)
 *  and opens a compact emoji grid. Closes on outside click / Escape. */
export function IconPicker({
  value,
  onPick,
  onRemove,
}: {
  value: string | null
  onPick: (emoji: string) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          value
            ? 'rounded-lg px-1 text-5xl leading-none transition hover:bg-black/5 dark:hover:bg-white/5'
            : 'rounded px-2 py-1 text-xs text-neutral-400 transition hover:bg-black/5 hover:text-neutral-600 dark:hover:bg-white/5 dark:hover:text-neutral-300'
        }
      >
        {value ?? '＋ Add icon'}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-[17rem] rounded-lg border border-border bg-background p-2 shadow-lg">
          <div className="grid grid-cols-8 gap-0.5">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onPick(emoji)
                  setOpen(false)
                }}
                className="rounded p-1 text-xl leading-none transition hover:bg-black/5 dark:hover:bg-white/5"
              >
                {emoji}
              </button>
            ))}
          </div>
          {value && (
            <button
              type="button"
              onClick={() => {
                onRemove()
                setOpen(false)
              }}
              className="mt-1 w-full rounded px-2 py-1 text-left text-xs text-neutral-500 transition hover:bg-black/5 dark:hover:bg-white/5"
            >
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  )
}
