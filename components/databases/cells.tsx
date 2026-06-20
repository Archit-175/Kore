'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { OPTION_COLOR_CLASSES } from '@/lib/databases/colors'
import type { CellValue, DbMember, DbProperty, SelectOption } from '@/lib/databases/types'
import { MemberAvatar, OptionChip, Popover } from './shared'

/** A clickable cell surface. NOT a <button> — its children include chips with
 *  their own remove <button>s, and a button-in-button is invalid HTML (hydration
 *  error). role=button + keyboard handler keep it accessible. */
function CellTrigger({
  onOpen,
  fill,
  className,
  children,
}: {
  onOpen: () => void
  fill?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className={`flex min-h-[28px] w-full cursor-pointer items-center gap-1 text-left ${
        fill ? 'px-2 py-1' : 'rounded border border-border px-2 py-1'
      } ${className ?? ''}`}
    >
      {children}
    </div>
  )
}

export type CellProps = {
  property: DbProperty
  value: CellValue
  members: DbMember[]
  onCommit: (value: CellValue) => void
  /** Create a new option on this property (returns its id) — select/status/multi. */
  onCreateOption?: (name: string) => string
  /** Stretch to fill a table cell (vs. the row-detail modal's block layout). */
  fill?: boolean
  autoFocus?: boolean
}

function asString(v: CellValue): string {
  return typeof v === 'string' ? v : ''
}
function asArray(v: CellValue): string[] {
  return Array.isArray(v) ? v : []
}
function optionById(options: SelectOption[], id: string | null): SelectOption | undefined {
  return id ? options.find((o) => o.id === id) : undefined
}

function formatDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!m) return value
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// ----------------------------------------------------------------------------
// Text / Title — local state, debounced save, activeElement guard (never clobber
// active typing when a remote refetch lands).
// ----------------------------------------------------------------------------
function TextCell({ property, value, onCommit, fill, autoFocus }: CellProps) {
  const ref = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(asString(value))
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Refs so the unmount cleanup (empty deps) sees the latest draft + callback.
  const draftRef = useRef(draft)
  const commitRef = useRef(onCommit)
  useEffect(() => {
    draftRef.current = draft
  }, [draft])
  useEffect(() => {
    commitRef.current = onCommit
  }, [onCommit])

  useEffect(() => {
    if (ref.current !== document.activeElement) setDraft(asString(value))
  }, [value])
  // Flush a pending debounced edit on unmount. React's onBlur does NOT fire when a
  // focused input is removed by reconciliation (e.g. a remote refetch swaps the
  // table↔board subtree mid-edit), so without this the last typed text is lost.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current)
        commitRef.current(draftRef.current)
      }
    },
    [],
  )

  const save = (v: string) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onCommit(v), 400)
  }
  const isTitle = property.type === 'title'
  return (
    <input
      ref={ref}
      value={draft}
      autoFocus={autoFocus}
      placeholder={isTitle ? 'Untitled' : 'Empty'}
      onChange={(e) => {
        setDraft(e.target.value)
        save(e.target.value)
      }}
      onBlur={() => {
        if (timer.current) clearTimeout(timer.current)
        if (asString(value) !== draft) onCommit(draft)
      }}
      className={`min-w-0 bg-transparent text-sm outline-none placeholder:text-neutral-300 dark:placeholder:text-neutral-600 ${
        isTitle ? 'font-medium' : ''
      } ${fill ? 'w-full px-2 py-1.5' : 'w-full rounded border border-border px-2 py-1.5 focus:border-indigo-500'}`}
    />
  )
}

// ----------------------------------------------------------------------------
// Option list (shared by single + multi select)
// ----------------------------------------------------------------------------
function OptionList({
  options,
  selected,
  onToggle,
  onCreateOption,
  close,
  single,
}: {
  options: SelectOption[]
  selected: string[]
  onToggle: (id: string) => void
  onCreateOption?: (name: string) => string
  close: () => void
  single: boolean
}) {
  const [query, setQuery] = useState('')
  const filtered = options.filter((o) => o.name.toLowerCase().includes(query.trim().toLowerCase()))
  const exact = options.some((o) => o.name.toLowerCase() === query.trim().toLowerCase())
  return (
    <div className="w-56">
      <div className="px-2 pb-1 pt-1">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search or create…"
          className="w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-indigo-500"
        />
      </div>
      <div className="max-h-56 overflow-y-auto px-1 pb-1">
        {filtered.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => {
              onToggle(o.id)
              if (single) close()
            }}
            className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-black/5 dark:hover:bg-white/5"
          >
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${OPTION_COLOR_CLASSES[o.color].dot}`} />
            <span className="min-w-0 flex-1 truncate text-sm">{o.name || 'Untitled'}</span>
            {selected.includes(o.id) && <span className="text-xs text-indigo-500">✓</span>}
          </button>
        ))}
        {onCreateOption && query.trim() && !exact && (
          <button
            type="button"
            onClick={() => {
              const id = onCreateOption(query.trim())
              onToggle(id)
              setQuery('')
              if (single) close()
            }}
            className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
          >
            <span className="text-neutral-400">+</span> Create “{query.trim()}”
          </button>
        )}
        {filtered.length === 0 && !query.trim() && (
          <p className="px-2 py-1.5 text-xs text-neutral-400">No options yet.</p>
        )}
      </div>
    </div>
  )
}

function SingleSelectCell({ property, value, onCommit, onCreateOption, fill }: CellProps) {
  const current = optionById(property.options, asString(value) || null)
  return (
    <Popover
      panelClass="w-56"
      trigger={({ setOpen }) => (
        <CellTrigger onOpen={() => setOpen(true)} fill={fill}>
          {current ? (
            <OptionChip name={current.name} color={current.color} />
          ) : (
            <span className="text-xs text-neutral-300 dark:text-neutral-600">Empty</span>
          )}
        </CellTrigger>
      )}
    >
      {(close) => (
        <div>
          <OptionList
            single
            options={property.options}
            selected={current ? [current.id] : []}
            onToggle={(id) => onCommit(id === current?.id ? null : id)}
            onCreateOption={onCreateOption}
            close={close}
          />
          {current && (
            <button
              type="button"
              onClick={() => {
                onCommit(null)
                close()
              }}
              className="block w-full border-t border-border px-3 py-1.5 text-left text-xs text-neutral-500 hover:bg-black/5 dark:hover:bg-white/5"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </Popover>
  )
}

function MultiSelectCell({ property, value, onCommit, onCreateOption, fill }: CellProps) {
  const selected = asArray(value)
  const chosen = selected
    .map((id) => optionById(property.options, id))
    .filter((o): o is SelectOption => Boolean(o))
  const toggle = (id: string) =>
    onCommit(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])
  return (
    <Popover
      panelClass="w-56"
      trigger={({ setOpen }) => (
        <CellTrigger onOpen={() => setOpen(true)} fill={fill} className="flex-wrap">
          {chosen.length > 0 ? (
            chosen.map((o) => (
              <OptionChip key={o.id} name={o.name} color={o.color} onRemove={() => toggle(o.id)} />
            ))
          ) : (
            <span className="text-xs text-neutral-300 dark:text-neutral-600">Empty</span>
          )}
        </CellTrigger>
      )}
    >
      {(close) => (
        <OptionList
          single={false}
          options={property.options}
          selected={selected}
          onToggle={toggle}
          onCreateOption={onCreateOption}
          close={close}
        />
      )}
    </Popover>
  )
}

function DateCell({ value, onCommit, fill }: CellProps) {
  const v = asString(value)
  return (
    <Popover
      panelClass="w-auto"
      trigger={({ setOpen }) => (
        <CellTrigger onOpen={() => setOpen(true)} fill={fill} className="text-sm">
          {v ? (
            formatDate(v)
          ) : (
            <span className="text-xs text-neutral-300 dark:text-neutral-600">Empty</span>
          )}
        </CellTrigger>
      )}
    >
      {(close) => (
        <div className="p-2">
          <input
            type="date"
            defaultValue={v}
            onChange={(e) => {
              onCommit(e.target.value || null)
            }}
            className="rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-indigo-500"
          />
          {v && (
            <button
              type="button"
              onClick={() => {
                onCommit(null)
                close()
              }}
              className="mt-2 block w-full rounded px-2 py-1 text-left text-xs text-neutral-500 hover:bg-black/5 dark:hover:bg-white/5"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </Popover>
  )
}

function PersonCell({ value, members, onCommit, fill }: CellProps) {
  // Multi-select: a person cell holds an array of member ids (tolerates a legacy
  // single-id string).
  const selected = Array.isArray(value) ? value : value ? [String(value)] : []
  const chosen = selected
    .map((id) => members.find((m) => m.id === id))
    .filter((m): m is DbMember => Boolean(m))
  const toggle = (id: string) =>
    onCommit(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])
  return (
    <Popover
      panelClass="w-56"
      trigger={({ setOpen }) => (
        <CellTrigger onOpen={() => setOpen(true)} fill={fill} className="flex-wrap">
          {chosen.length > 0 ? (
            chosen.map((m) => (
              <span
                key={m.id}
                className="inline-flex items-center gap-1 rounded bg-black/5 px-1 py-0.5 text-xs dark:bg-white/10"
              >
                <MemberAvatar member={m} size={16} />
                <span className="max-w-[7rem] truncate">{m.name}</span>
              </span>
            ))
          ) : (
            <span className="text-xs text-neutral-300 dark:text-neutral-600">Empty</span>
          )}
        </CellTrigger>
      )}
    >
      {(close) => (
        <div className="px-1 py-1">
          <div className="max-h-56 overflow-y-auto">
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => toggle(m.id)}
                className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-black/5 dark:hover:bg-white/5"
              >
                <MemberAvatar member={m} size={20} />
                <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                {selected.includes(m.id) && <span className="text-xs text-indigo-500">✓</span>}
              </button>
            ))}
            {members.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-neutral-400">No members.</p>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            className="mt-1 block w-full border-t border-border px-3 py-1.5 text-left text-xs text-neutral-500 hover:bg-black/5 dark:hover:bg-white/5"
          >
            Done
          </button>
        </div>
      )}
    </Popover>
  )
}

/** Dispatch to the right editor for a property type. */
export function Cell(props: CellProps) {
  switch (props.property.type) {
    case 'title':
    case 'text':
      return <TextCell {...props} />
    case 'select':
    case 'status':
      return <SingleSelectCell {...props} />
    case 'multi_select':
      return <MultiSelectCell {...props} />
    case 'date':
      return <DateCell {...props} />
    case 'person':
      return <PersonCell {...props} />
    default:
      return <TextCell {...props} />
  }
}
