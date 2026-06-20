'use client'

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { initials } from '@/lib/presence'
import type { MentionMember } from './mention-utils'

/**
 * A controlled <textarea> with a lightweight member @-mention popup (BlockNote's
 * SuggestionMenuController only works inside BlockNote, so the plain-textarea
 * surfaces — chat + comments composers — need their own). The popup opens when an
 * `@word` token sits under the caret; ↑/↓ move, Enter/Tab insert `@Name `, Esc
 * closes. When the popup is CLOSED, Enter (without Shift) submits via `onSubmit`.
 *
 * Mentions are recovered from the final text at send time via extractMentionIds —
 * this component only manages insertion + the popup, not the id list.
 */

const TOKEN = /(?:^|[\s(])@([\p{L}\p{N}_.-]*)$/u

export type MentionTextareaHandle = { focus: () => void }

export function MentionTextarea({
  value,
  onChange,
  members,
  onSubmit,
  placeholder,
  disabled,
  autoFocus,
  maxRows = 8,
  className,
  ariaLabel,
  handleRef,
}: {
  value: string
  onChange: (text: string) => void
  members: MentionMember[]
  onSubmit?: () => void
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
  maxRows?: number
  className?: string
  ariaLabel?: string
  handleRef?: React.Ref<MentionTextareaHandle>
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  // caret position to restore after a controlled insert
  const pendingCaret = useRef<number | null>(null)

  useImperativeHandle(handleRef, () => ({ focus: () => ref.current?.focus() }), [])

  const matches = useMemo(() => {
    if (!open) return []
    const q = query.toLowerCase()
    // Match by handle OR display name so typing either finds the person; the
    // inserted token is always the handle (see insertMention).
    return members
      .filter(
        (m) =>
          m.handle?.trim() &&
          (m.handle.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)),
      )
      .slice(0, 8)
  }, [open, query, members])

  // Auto-grow up to maxRows.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const line = parseFloat(getComputedStyle(el).lineHeight || '20') || 20
    const max = line * maxRows + 16
    el.style.height = `${Math.min(el.scrollHeight, max)}px`
  }, [value, maxRows])

  // Restore caret after a programmatic insert.
  useEffect(() => {
    if (pendingCaret.current != null && ref.current) {
      const pos = pendingCaret.current
      pendingCaret.current = null
      ref.current.focus()
      ref.current.setSelectionRange(pos, pos)
    }
  }, [value])

  const refreshToken = useCallback(() => {
    const el = ref.current
    if (!el) return
    // Read the LIVE DOM value/caret (the controlled `value` prop may lag a frame
    // behind the keystroke that scheduled this via requestAnimationFrame).
    const caret = el.selectionStart ?? 0
    const before = el.value.slice(0, caret)
    const m = before.match(TOKEN)
    if (m) {
      setQuery(m[1] ?? '')
      setActive(0)
      setOpen(true)
    } else {
      setOpen(false)
    }
  }, [])

  const insertMention = useCallback(
    (member: MentionMember) => {
      const el = ref.current
      if (!el) return
      const caret = el.selectionStart ?? value.length
      const before = value.slice(0, caret)
      const after = value.slice(caret)
      const m = before.match(TOKEN)
      if (!m) return
      // Keep the leading boundary char (the (?:^|[\s(]) group), drop the @token.
      const tokenStart = before.length - (m[1]?.length ?? 0) - 1 // index of '@'
      const next = `${value.slice(0, tokenStart)}@${member.handle} ${after}`
      pendingCaret.current = tokenStart + member.handle.length + 2 // after "@handle "
      setOpen(false)
      onChange(next)
    },
    [value, onChange],
  )

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && matches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((a) => (a + 1) % matches.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => (a - 1 + matches.length) % matches.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(matches[active] ?? matches[0])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && onSubmit) {
      e.preventDefault()
      setOpen(false)
      onSubmit()
    }
  }

  return (
    <div className="relative w-full">
      {open && matches.length > 0 && (
        <ul
          className="absolute bottom-full left-0 z-50 mb-1 max-h-56 w-60 overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-lg"
          role="listbox"
        >
          {matches.map((m, i) => (
            <li key={m.id}>
              <button
                type="button"
                // Prevent the textarea from losing focus before the click lands.
                onMouseDown={(e) => {
                  e.preventDefault()
                  insertMention(m)
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm ${
                  i === active
                    ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300'
                    : 'text-foreground hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-indigo-500 text-[10px] font-semibold text-white">
                  {m.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.avatarUrl} alt={m.name} className="h-full w-full object-cover" />
                  ) : (
                    initials(m.name)
                  )}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{m.name}</span>
                  <span className="truncate text-xs text-neutral-400">@{m.handle}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <textarea
        ref={ref}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        placeholder={placeholder}
        rows={1}
        onChange={(e) => {
          onChange(e.target.value)
          // token recompute happens against the NEW value on the next tick
          requestAnimationFrame(refreshToken)
        }}
        onKeyUp={refreshToken}
        onClick={refreshToken}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        className={
          className ??
          'w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-neutral-400 focus:border-indigo-400'
        }
      />
    </div>
  )
}
