'use client'

import { useMemo, useState } from 'react'
import { OPTION_COLOR_CLASSES } from '@/lib/databases/colors'
import { columnRows, groupKeyOf, orderedRows, reorderPlan } from '@/lib/databases/ordering'
import {
  rowTitle,
  titleProperty,
  type DatabaseActions,
  type DbMember,
  type DbProperty,
  type DbRow,
  type DbView,
  type SelectOption,
} from '@/lib/databases/types'
import { MemberAvatar, OptionChip } from './shared'

type DragState = {
  rowId: string
  overColumn: string | null // option id, or null = the "No value" column
  overCardId: string | null
  pos: 'before' | 'after'
} | null

type Column = { key: string | null; name: string; option: SelectOption | null }

function formatDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!m) return value
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

/** Compact read-only property chips shown on a card (skips title + group prop). */
function CardFields({
  row,
  properties,
  members,
  skipIds,
}: {
  row: DbRow
  properties: DbProperty[]
  members: DbMember[]
  skipIds: Set<string>
}) {
  const fields = properties
    .filter((p) => !skipIds.has(p.id))
    .sort((a, b) => a.sort - b.sort)
    .map((p) => {
      const v = row.data[p.id]
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0))
        return null
      if (p.type === 'select' || p.type === 'status') {
        const o = p.options.find((x) => x.id === v)
        return o ? <OptionChip key={p.id} name={o.name} color={o.color} /> : null
      }
      if (p.type === 'multi_select' && Array.isArray(v)) {
        return (
          <span key={p.id} className="flex flex-wrap gap-1">
            {v
              .map((id) => p.options.find((x) => x.id === id))
              .filter((o): o is SelectOption => Boolean(o))
              .map((o) => (
                <OptionChip key={o.id} name={o.name} color={o.color} />
              ))}
          </span>
        )
      }
      if (p.type === 'date' && typeof v === 'string') {
        return (
          <span key={p.id} className="text-xs text-neutral-500 dark:text-neutral-400">
            {formatDate(v)}
          </span>
        )
      }
      if (p.type === 'person') {
        const ids = Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []
        const ms = ids
          .map((id) => members.find((x) => x.id === id))
          .filter((m): m is DbMember => Boolean(m))
        if (ms.length === 0) return null
        return (
          <span key={p.id} className="flex flex-wrap items-center gap-1 text-xs text-neutral-500">
            {ms.map((m) => (
              <span key={m.id} className="flex items-center gap-1">
                <MemberAvatar member={m} size={16} /> {m.name}
              </span>
            ))}
          </span>
        )
      }
      if (p.type === 'text' && typeof v === 'string') {
        return (
          <span key={p.id} className="line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">
            {v}
          </span>
        )
      }
      return null
    })
    .filter(Boolean)
  if (fields.length === 0) return null
  return <div className="mt-1.5 flex flex-col gap-1">{fields}</div>
}

/**
 * Board (Kanban) view. Columns derive from the grouping property's options (in
 * option order) + a leading "No <property>" column for blank rows. Cards drag
 * between columns via native HTML5 DnD (no @dnd-kit) — a cross-column drop updates
 * the grouping cell AND the per-view order in one write; a same-column drop just
 * reorders. Columns horizontally scroll (one-at-a-time snap on mobile).
 */
export function BoardView({
  view,
  properties,
  rows,
  members,
  actions,
  onOpenRow,
}: {
  view: DbView
  properties: DbProperty[]
  rows: DbRow[]
  members: DbMember[]
  actions: DatabaseActions
  onOpenRow: (rowId: string) => void
}) {
  const [drag, setDrag] = useState<DragState>(null)
  const tProp = titleProperty(properties)
  const groupProp = useMemo(
    () =>
      properties.find(
        (p) => p.id === view.groupPropertyId && (p.type === 'status' || p.type === 'select'),
      ) ?? null,
    [properties, view.groupPropertyId],
  )

  const columns: Column[] = useMemo(() => {
    if (!groupProp) return [{ key: null, name: 'All', option: null }]
    return [
      { key: null, name: `No ${groupProp.name || 'value'}`, option: null },
      ...groupProp.options.map((o) => ({ key: o.id, name: o.name, option: o })),
    ]
  }, [groupProp])

  const skipIds = useMemo(
    () => new Set([tProp?.id, groupProp?.id].filter((x): x is string => Boolean(x))),
    [tProp?.id, groupProp?.id],
  )

  const rowsFor = (colKey: string | null): DbRow[] =>
    groupProp
      ? columnRows(rows, view.id, groupProp.id, colKey)
      : orderedRows(rows, view.id)

  const handleDrop = () => {
    const d = drag
    setDrag(null)
    if (!d) return
    const row = rows.find((r) => r.id === d.rowId)
    if (!row) return
    const colRows = rowsFor(d.overColumn).filter((r) => r.id !== d.rowId)
    // Insert index within the column (excluding the dragged card). Over a card =
    // before/after it; over empty column space = append.
    let insertIndex = colRows.length
    if (d.overCardId) {
      const ti = colRows.findIndex((r) => r.id === d.overCardId)
      if (ti !== -1) insertIndex = d.pos === 'before' ? ti : ti + 1
    }
    const plan = reorderPlan(colRows, view.id, insertIndex)
    const currentKey = groupProp ? groupKeyOf(row.data[groupProp.id]) : null
    if (groupProp && d.overColumn !== currentKey) {
      actions.setRowGroup(view.id, d.rowId, groupProp.id, d.overColumn, plan.draggedSort)
    } else {
      actions.moveRowInView(view.id, d.rowId, plan.draggedSort)
    }
    // On a degenerate tie, the column was reseeded — persist the shifted neighbours.
    for (const w of plan.reseeds) actions.moveRowInView(view.id, w.rowId, w.sort)
  }

  if (!groupProp) {
    return (
      <div className="px-4 py-3">
        <p className="rounded-md border border-dashed border-border px-4 py-3 text-sm text-neutral-500">
          This board has no grouping. Pick a <strong>Status</strong> or <strong>Select</strong>{' '}
          property to group by from the view menu.
        </p>
        <BoardColumn
          column={{ key: null, name: 'All', option: null }}
          rows={rowsFor(null)}
          properties={properties}
          members={members}
          skipIds={skipIds}
          drag={drag}
          setDrag={setDrag}
          onDrop={handleDrop}
          onOpenRow={onOpenRow}
          onAddCard={() => actions.addRow()}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full gap-3 overflow-x-auto overscroll-x-contain px-4 py-3 [scroll-snap-type:x_proximity]">
      {columns.map((col) => (
        <BoardColumn
          key={col.key ?? '__none__'}
          column={col}
          rows={rowsFor(col.key)}
          properties={properties}
          members={members}
          skipIds={skipIds}
          drag={drag}
          setDrag={setDrag}
          onDrop={handleDrop}
          onOpenRow={onOpenRow}
          onAddCard={() =>
            actions.addRow(
              col.key ? { propertyId: groupProp.id, value: col.key } : undefined,
            )
          }
        />
      ))}
    </div>
  )
}

function BoardColumn({
  column,
  rows,
  properties,
  members,
  skipIds,
  drag,
  setDrag,
  onDrop,
  onOpenRow,
  onAddCard,
}: {
  column: Column
  rows: DbRow[]
  properties: DbProperty[]
  members: DbMember[]
  skipIds: Set<string>
  drag: DragState
  setDrag: (d: DragState) => void
  onDrop: () => void
  onOpenRow: (rowId: string) => void
  onAddCard: () => void
}) {
  const isOver = drag && drag.overColumn === column.key
  return (
    <div
      className="flex h-full min-w-[80vw] max-w-[80vw] shrink-0 flex-col sm:min-w-[272px] sm:max-w-[272px] [scroll-snap-align:start]"
      onDragOver={(e) => {
        if (!drag) return
        e.preventDefault()
        if (drag.overColumn !== column.key || drag.overCardId !== null) {
          setDrag({ ...drag, overColumn: column.key, overCardId: null, pos: 'after' })
        }
      }}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
    >
      <div className="mb-2 flex shrink-0 items-center gap-1.5 px-1">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            column.option ? OPTION_COLOR_CLASSES[column.option.color].dot : 'bg-neutral-300 dark:bg-neutral-600'
          }`}
        />
        <span className="truncate text-sm font-medium">{column.name}</span>
        <span className="text-xs text-neutral-400">{rows.length}</span>
        <button
          type="button"
          onClick={onAddCard}
          title="Add card"
          className="ml-auto rounded px-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          +
        </button>
      </div>

      <div
        className={`flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-lg p-1.5 transition ${
          isOver ? 'bg-indigo-500/5 ring-1 ring-inset ring-indigo-400/50' : ''
        }`}
      >
        {rows.map((row) => {
          const overCard = drag?.overCardId === row.id
          return (
            <div
              key={row.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move'
                setDrag({ rowId: row.id, overColumn: column.key, overCardId: null, pos: 'after' })
              }}
              onDragOver={(e) => {
                if (!drag || drag.rowId === row.id) return
                e.preventDefault()
                e.stopPropagation()
                const r = e.currentTarget.getBoundingClientRect()
                const pos = e.clientY - r.top < r.height / 2 ? 'before' : 'after'
                if (drag.overColumn !== column.key || drag.overCardId !== row.id || drag.pos !== pos) {
                  setDrag({ ...drag, overColumn: column.key, overCardId: row.id, pos })
                }
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onDrop()
              }}
              onDragEnd={() => setDrag(null)}
              onClick={() => onOpenRow(row.id)}
              className={`cursor-pointer rounded-lg border border-border bg-surface p-2 text-sm shadow-sm transition hover:border-neutral-300 dark:hover:border-neutral-600 ${
                drag?.rowId === row.id ? 'opacity-40' : ''
              } ${overCard && drag?.pos === 'before' ? 'border-t-2 border-t-indigo-400' : ''} ${
                overCard && drag?.pos === 'after' ? 'border-b-2 border-b-indigo-400' : ''
              }`}
            >
              <p className="font-medium">{rowTitle(row, properties)}</p>
              <CardFields row={row} properties={properties} members={members} skipIds={skipIds} />
            </div>
          )
        })}

        <button
          type="button"
          onClick={onAddCard}
          className="rounded-lg px-2 py-1.5 text-left text-xs text-neutral-400 transition hover:bg-black/5 hover:text-neutral-600 dark:hover:bg-white/5 dark:hover:text-neutral-300"
        >
          + New
        </button>
      </div>
    </div>
  )
}
