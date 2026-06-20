'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { userColor } from '@/lib/yjs/awareness'
import { OPTION_COLOR_CLASSES, type OptionColor } from '@/lib/databases/colors'
import type { DbMember, PropertyType } from '@/lib/databases/types'

/** Initials for an avatar fallback. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * A small click-outside popover. The PANEL is rendered in a portal on document.body
 * with fixed positioning measured from the trigger — so it is never clipped by the
 * table/board scroll containers (which must use overflow for h/v scrolling). The
 * outside-click listener runs in the CAPTURE phase (robust even inside the Docs
 * inline embed, where the databaseEmbed block is selectable:false so ProseMirror
 * doesn't hijack inner clicks/drags). Clicks on the trigger or panel are ignored by
 * the outside handler, so the trigger's onClick toggles cleanly (no double-fire).
 */
export function Popover({
  trigger,
  children,
  align = 'left',
  panelClass,
}: {
  trigger: (o: { open: boolean; setOpen: (v: boolean) => void }) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  panelClass?: string
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Position from the trigger, then CLAMP to the viewport so a panel never spills
  // off an edge (the bug: an align=right menu near the left edge rendered half off
  // screen). Measures the already-rendered (but invisible) panel for its real size,
  // and flips above the trigger when there's no room below.
  const place = () => {
    const t = triggerRef.current
    if (!t) return
    const r = t.getBoundingClientRect()
    const m = 8
    const pw = panelRef.current?.offsetWidth ?? 224
    const ph = panelRef.current?.offsetHeight ?? 0
    let left = align === 'right' ? r.right - pw : r.left
    left = Math.max(m, Math.min(left, window.innerWidth - pw - m))
    let top = r.bottom + 4
    if (ph && top + ph > window.innerHeight - m) top = Math.max(m, r.top - ph - 4)
    setPos({ top, left })
  }

  useEffect(() => {
    // Reset/position after the panel is committed to the DOM (place() reads its
    // real size) — a legitimate layout-sync, not a derived-state cascade.
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPos(null)
      return
    }
    place()
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const reposition = () => place()
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <div ref={triggerRef} className="relative">
      {trigger({ open, setOpen })}
      {open &&
        createPortal(
          // Rendered (invisible) before `pos` exists so place() can measure it; then
          // shown at the clamped position. opacity (not visibility) so the autoFocus
          // search input inside still focuses.
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              opacity: pos ? 1 : 0,
              pointerEvents: pos ? 'auto' : 'none',
            }}
            className={`z-50 ${
              panelClass ?? 'w-56'
            } overflow-hidden rounded-md border border-border bg-background py-1 shadow-xl`}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </div>
  )
}

/** A colored option/tag chip (select / multi_select / status values). */
export function OptionChip({
  name,
  color,
  onRemove,
  className,
}: {
  name: string
  color: OptionColor
  onRemove?: () => void
  className?: string
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${OPTION_COLOR_CLASSES[color].chip} ${className ?? ''}`}
    >
      <span className="truncate">{name || 'Untitled'}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="-mr-0.5 shrink-0 rounded-sm px-0.5 leading-none opacity-60 hover:opacity-100"
          aria-label={`Remove ${name}`}
        >
          ×
        </button>
      )}
    </span>
  )
}

/** A member avatar (image or colored initials) — for `person` cells. */
export function MemberAvatar({
  member,
  size = 20,
}: {
  member: DbMember
  size?: number
}) {
  if (member.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={member.avatarUrl}
        alt={member.name}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
      style={{ width: size, height: size, backgroundColor: userColor(member.id) }}
    >
      {initials(member.name)}
    </span>
  )
}

/** A tiny icon for each property type (used in headers + the type picker). */
export const PROPERTY_TYPE_ICON: Record<PropertyType, string> = {
  title: 'T',
  text: '≡',
  select: '◉',
  multi_select: '☰',
  status: '◍',
  date: '📅',
  person: '👤',
}
