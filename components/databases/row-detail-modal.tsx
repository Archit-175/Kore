'use client'

import { useEffect } from 'react'
import {
  titleProperty,
  type DatabaseActions,
  type DbMember,
  type DbProperty,
  type DbRow,
} from '@/lib/databases/types'
import { PROPERTY_TYPE_LABELS } from '@/lib/databases/types'
import { Cell } from './cells'

/** Full-row editor (every property as a labeled field). The escape hatch for
 *  wide rows / mobile, and "open" from a board card or table row. */
export function RowDetailModal({
  row,
  properties,
  members,
  actions,
  onClose,
}: {
  row: DbRow
  properties: DbProperty[]
  members: DbMember[]
  actions: DatabaseActions
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const tProp = titleProperty(properties)
  const otherProps = properties.filter((p) => p.id !== tProp?.id).sort((a, b) => a.sort - b.sort)

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-background p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {tProp && (
              <div className="text-xl font-bold">
                <Cell
                  autoFocus
                  property={tProp}
                  value={row.data[tProp.id]}
                  members={members}
                  onCommit={(v) => actions.updateCell(row.id, tProp.id, v)}
                />
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded px-2 py-1 text-neutral-400 hover:bg-black/5 hover:text-neutral-700 dark:hover:bg-white/5 dark:hover:text-neutral-200"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          {otherProps.map((p) => (
            <div key={p.id} className="grid grid-cols-[120px_1fr] items-start gap-2">
              <span className="pt-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                {p.name || PROPERTY_TYPE_LABELS[p.type]}
              </span>
              <Cell
                property={p}
                value={row.data[p.id]}
                members={members}
                onCommit={(v) => actions.updateCell(row.id, p.id, v)}
                onCreateOption={(name) => actions.createOption(p.id, name)}
              />
            </div>
          ))}
        </div>

        <div className="mt-5 flex justify-end border-t border-border pt-3">
          <button
            type="button"
            onClick={() => {
              actions.deleteRow(row.id)
              onClose()
            }}
            className="rounded px-3 py-1.5 text-sm text-red-600 transition hover:bg-red-500/10"
          >
            Delete row
          </button>
        </div>
      </div>
    </div>
  )
}
