'use client'

import { useState } from 'react'
import {
  isGroupable,
  type DatabaseActions,
  type DbProperty,
  type DbView,
} from '@/lib/databases/types'
import { Popover } from './shared'

const VIEW_ICON: Record<'table' | 'board', string> = { table: '▦', board: '▥' }

/** The view tabs (Table/Board) + add/rename/regroup/delete. The active view is a
 *  per-client choice (persisted to localStorage by DatabaseView), not synced. */
export function ViewTabStrip({
  views,
  properties,
  activeViewId,
  onSelect,
  actions,
}: {
  views: DbView[]
  properties: DbProperty[]
  activeViewId: string
  onSelect: (id: string) => void
  actions: DatabaseActions
}) {
  const groupable = properties.filter((p) => isGroupable(p.type))
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-2">
      {views.map((v) => {
        const active = v.id === activeViewId
        return (
          <div key={v.id} className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => onSelect(v.id)}
              className={`flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-sm transition ${
                active
                  ? 'border-indigo-500 font-medium text-indigo-600 dark:text-indigo-300'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              <span className="text-xs text-neutral-400">{VIEW_ICON[v.type]}</span>
              {v.name || (v.type === 'board' ? 'Board' : 'Table')}
            </button>
            {active && (
              <ViewMenu view={v} groupable={groupable} views={views} actions={actions} onSelect={onSelect} />
            )}
          </div>
        )
      })}
      <AddViewButton actions={actions} groupable={groupable} />
    </div>
  )
}

function ViewMenu({
  view,
  groupable,
  views,
  actions,
  onSelect,
}: {
  view: DbView
  groupable: DbProperty[]
  views: DbView[]
  actions: DatabaseActions
  onSelect: (id: string) => void
}) {
  const [name, setName] = useState(view.name)
  return (
    <Popover
      align="right"
      panelClass="w-60"
      trigger={({ setOpen }) => (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="View options"
          className="rounded px-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          ⌄
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="px-2 py-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name !== view.name && actions.updateView(view.id, { name })}
              className="w-full rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-indigo-500"
            />
          </div>
          <div className="px-2 pb-1.5">
            <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              Layout
            </p>
            <div className="flex gap-1">
              {(['table', 'board'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => actions.updateView(view.id, { type: t })}
                  className={`flex-1 rounded border px-2 py-1 text-sm capitalize transition ${
                    view.type === t
                      ? 'border-indigo-400 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300'
                      : 'border-border hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {view.type === 'board' && (
            <div className="px-2 pb-1.5">
              <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                Group by
              </p>
              <select
                value={view.groupPropertyId ?? ''}
                onChange={(e) =>
                  actions.updateView(view.id, { groupPropertyId: e.target.value || null })
                }
                className="w-full rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-indigo-500"
              >
                <option value="">None</option>
                {groupable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || 'Untitled'}
                  </option>
                ))}
              </select>
              {groupable.length === 0 && (
                <p className="px-1 pt-1 text-xs text-neutral-400">
                  Add a Status or Select column first.
                </p>
              )}
            </div>
          )}
          {views.length > 1 && (
            <button
              type="button"
              onClick={() => {
                const remaining = views.find((v) => v.id !== view.id)
                actions.deleteView(view.id)
                if (remaining) onSelect(remaining.id)
                close()
              }}
              className="block w-full border-t border-border px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-500/10"
            >
              Delete view
            </button>
          )}
        </div>
      )}
    </Popover>
  )
}

function AddViewButton({
  actions,
  groupable,
}: {
  actions: DatabaseActions
  groupable: DbProperty[]
}) {
  return (
    <Popover
      panelClass="w-40"
      trigger={({ setOpen }) => (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Add view"
          className="shrink-0 rounded px-2 py-2 text-sm text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          +
        </button>
      )}
    >
      {(close) => (
        <div className="py-0.5">
          <button
            type="button"
            onClick={() => {
              actions.addView('table')
              close()
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
          >
            <span className="text-neutral-400">▦</span> Table
          </button>
          <button
            type="button"
            onClick={() => {
              actions.addView('board', undefined)
              close()
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
          >
            <span className="text-neutral-400">▥</span> Board
          </button>
          {groupable.length === 0 && (
            <p className="px-3 py-1 text-[11px] text-neutral-400">
              Boards group by a Status/Select column.
            </p>
          )}
        </div>
      )}
    </Popover>
  )
}
