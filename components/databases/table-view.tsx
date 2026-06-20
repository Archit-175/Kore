'use client'

import { useMemo } from 'react'
import { orderedRows } from '@/lib/databases/ordering'
import {
  titleProperty,
  type DatabaseActions,
  type DbMember,
  type DbProperty,
  type DbRow,
  type DbView,
} from '@/lib/databases/types'
import { Cell } from './cells'
import { AddPropertyButton, PropertyHeader } from './property-controls'

const COL_W = 184
const TITLE_W = 240

/**
 * Table view: rows × properties. The title column is frozen (sticky left-0) so it
 * stays visible while the rest horizontally scrolls (min-w-max → never squish).
 * Mobile = the same single horizontal scroll.
 */
export function TableView({
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
  const tProp = titleProperty(properties)
  const otherProps = useMemo(
    () => properties.filter((p) => p.id !== tProp?.id).sort((a, b) => a.sort - b.sort),
    [properties, tProp?.id],
  )
  const ordered = useMemo(() => orderedRows(rows, view.id), [rows, view.id])

  return (
    // border-separate (NOT border-collapse): Chrome drops position:sticky on table
    // cells when borders are collapsed, so the header row / title column wouldn't
    // pin. With separate borders + spacing 0 the grid still looks collapsed.
    <div className="min-w-max">
      <table className="kore-db-table w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th
              className="sticky left-0 top-0 z-40 border-b border-r border-border bg-background px-3 py-2 text-left"
              style={{ width: TITLE_W, minWidth: TITLE_W }}
            >
              {tProp ? (
                <PropertyHeader property={tProp} actions={actions} />
              ) : (
                <span className="text-xs text-neutral-400">Name</span>
              )}
            </th>
            {otherProps.map((p) => (
              <th
                key={p.id}
                className="sticky top-0 z-30 border-b border-r border-border bg-background px-3 py-2 text-left"
                style={{ width: COL_W, minWidth: COL_W }}
              >
                <PropertyHeader property={p} actions={actions} />
              </th>
            ))}
            <th className="sticky top-0 z-30 border-b border-border bg-background px-1 py-2 text-left">
              <AddPropertyButton actions={actions} />
            </th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((row) => (
            <tr key={row.id} className="group hover:bg-surface/60">
              <td
                className="sticky left-0 z-20 border-b border-r border-border bg-background px-1 align-top group-hover:bg-surface/60"
                style={{ width: TITLE_W, minWidth: TITLE_W }}
              >
                <div className="flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    {tProp && (
                      <Cell
                        fill
                        property={tProp}
                        value={row.data[tProp.id]}
                        members={members}
                        onCommit={(v) => actions.updateCell(row.id, tProp.id, v)}
                      />
                    )}
                  </div>
                  <div className="flex shrink-0 items-center opacity-0 transition group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => onOpenRow(row.id)}
                      title="Open"
                      className="rounded px-1 text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                    >
                      ⤢
                    </button>
                    <button
                      type="button"
                      onClick={() => actions.deleteRow(row.id)}
                      title="Delete row"
                      className="rounded px-1 text-xs text-neutral-400 hover:text-red-600"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </td>
              {otherProps.map((p) => (
                <td
                  key={p.id}
                  className="border-b border-r border-border px-1 align-top"
                  style={{ width: COL_W, minWidth: COL_W }}
                >
                  <Cell
                    fill
                    property={p}
                    value={row.data[p.id]}
                    members={members}
                    onCommit={(v) => actions.updateCell(row.id, p.id, v)}
                    onCreateOption={(name) => actions.createOption(p.id, name)}
                  />
                </td>
              ))}
              <td className="border-b border-border" />
            </tr>
          ))}
        </tbody>
      </table>

      <button
        type="button"
        onClick={() => actions.addRow()}
        className="sticky left-0 flex w-full items-center gap-1 px-3 py-2 text-left text-sm text-neutral-400 transition hover:bg-surface hover:text-neutral-600 dark:hover:text-neutral-300"
      >
        + New row
      </button>
    </div>
  )
}
