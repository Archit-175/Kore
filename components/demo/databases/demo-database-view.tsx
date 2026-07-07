'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDemo } from '@/lib/demo/context'
import { nextOptionColor } from '@/lib/databases/colors'
import {
  PROPERTY_TYPE_LABELS,
  type CellValue,
  type DatabaseActions,
  type DatabaseAggregate,
  type DbProperty,
  type DbRow,
  type DbView,
  type PropertyType,
} from '@/lib/databases/types'
import { Popover } from '@/components/databases/shared'
import { ViewTabStrip } from '@/components/databases/view-tab-strip'
import { TableView } from '@/components/databases/table-view'
import { BoardView } from '@/components/databases/board-view'
import { RowDetailModal } from '@/components/databases/row-detail-modal'

const DB_ICONS = [
  '🗄', '📊', '📋', '✅', '🎯', '📁', '🗂️', '🧩',
  '📅', '🚀', '🛠️', '💼', '🏷️', '🔖', '📈', '🧪',
] as const

function DatabaseIconPicker({
  value,
  onPick,
  onRemove,
}: {
  value: string | null
  onPick: (emoji: string) => void
  onRemove: () => void
}) {
  return (
    <Popover
      panelClass="w-auto"
      trigger={({ setOpen }) => (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded px-1 text-2xl leading-none transition hover:bg-black/5 dark:hover:bg-white/5"
          aria-label="Database icon"
        >
          {value ?? '🗄'}
        </button>
      )}
    >
      {(close) => (
        <div className="p-2">
          <div className="grid grid-cols-8 gap-0.5">
            {DB_ICONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onPick(emoji)
                  close()
                }}
                className="rounded p-1 text-lg leading-none transition hover:bg-black/5 dark:hover:bg-white/5"
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
                close()
              }}
              className="mt-1 w-full rounded px-2 py-1 text-left text-xs text-neutral-500 hover:bg-black/5 dark:hover:bg-white/5"
            >
              Remove
            </button>
          )}
        </div>
      )}
    </Popover>
  )
}

/** Drop empty cell values (keeps `data` clean), else patch — mirrors the real view. */
function patchData(
  data: Record<string, CellValue>,
  propertyId: string,
  value: CellValue,
): Record<string, CellValue> {
  const isEmpty =
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  if (isEmpty) {
    const rest = { ...data }
    delete rest[propertyId]
    return rest
  }
  return { ...data, [propertyId]: value }
}

type Up<T> = T | ((prev: T) => T)
function ap<T>(prev: T, u: Up<T>): T {
  return typeof u === 'function' ? (u as (p: T) => T)(prev) : u
}

/**
 * Demo fork of DatabaseView. Same leaves + optimistic reducers, but state lives
 * in the DemoStore (so edits persist across navigation within a page load) and
 * every real `api.*` / realtime / loadDatabase call is dropped — the store
 * mutation IS the persistence. Zero Supabase.
 */
export function DemoDatabaseView({
  databaseId,
  embedded = false,
}: {
  databaseId: string
  embedded?: boolean
}) {
  const store = useDemo()
  const agg = store.getDatabase(databaseId)

  // Store-backed slice setters (accept value | updater), mirroring useState.
  const setRows = useCallback(
    (u: Up<DbRow[]>) => store.setDatabase(databaseId, (a) => ({ ...a, rows: ap(a.rows, u) })),
    [store, databaseId],
  )
  const setProperties = useCallback(
    (u: Up<DbProperty[]>) => store.setDatabase(databaseId, (a) => ({ ...a, properties: ap(a.properties, u) })),
    [store, databaseId],
  )
  const setViews = useCallback(
    (u: Up<DbView[]>) => store.setDatabase(databaseId, (a) => ({ ...a, views: ap(a.views, u) })),
    [store, databaseId],
  )
  const setMeta = useCallback(
    (u: Up<DatabaseAggregate['database']>) =>
      store.setDatabase(databaseId, (a) => ({ ...a, database: ap(a.database, u) })),
    [store, databaseId],
  )

  const properties = agg?.properties ?? []
  const views = agg?.views ?? []
  const rows = agg?.rows ?? []
  const meta = agg?.database

  const [openRowId, setOpenRowId] = useState<string | null>(null)
  const [activeViewId, setActiveViewId] = useState<string>(views[0]?.id ?? '')
  useEffect(() => {
    const saved = localStorage.getItem(`kore-demo-db-view-${databaseId}`)
    if (saved && views.some((v) => v.id === saved)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveViewId(saved)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [databaseId])
  const selectView = useCallback(
    (id: string) => {
      setActiveViewId(id)
      try {
        localStorage.setItem(`kore-demo-db-view-${databaseId}`, id)
      } catch {
        // ignore
      }
    },
    [databaseId],
  )

  const actions: DatabaseActions = useMemo(
    () => ({
      isOwner: true,
      addRow: (group) => {
        const data: Record<string, CellValue> =
          group && group.value !== null ? { [group.propertyId]: group.value } : {}
        const now = new Date().toISOString()
        setRows((prev) => {
          const maxSort = prev.reduce((m, r) => Math.max(m, r.sort), -1)
          return [
            ...prev,
            { id: crypto.randomUUID(), data, sort: maxSort + 1, viewOrder: {}, createdAt: now, updatedAt: now },
          ]
        })
      },
      updateCell: (rowId, propertyId, value) => {
        setRows((prev) =>
          prev.map((r) => (r.id === rowId ? { ...r, data: patchData(r.data, propertyId, value) } : r)),
        )
      },
      deleteRow: (rowId) => setRows((prev) => prev.filter((r) => r.id !== rowId)),
      moveRowInView: (viewId, rowId, sort) =>
        setRows((prev) =>
          prev.map((r) => (r.id === rowId ? { ...r, viewOrder: { ...r.viewOrder, [viewId]: sort } } : r)),
        ),
      setRowGroup: (viewId, rowId, propertyId, value, sort) =>
        setRows((prev) =>
          prev.map((r) =>
            r.id === rowId
              ? { ...r, data: patchData(r.data, propertyId, value), viewOrder: { ...r.viewOrder, [viewId]: sort } }
              : r,
          ),
        ),
      addProperty: (type: PropertyType, name) => {
        setProperties((prev) => {
          const maxSort = prev.reduce((m, p) => Math.max(m, p.sort), -1)
          return [
            ...prev,
            { id: crypto.randomUUID(), name: name ?? PROPERTY_TYPE_LABELS[type], type, options: [], sort: maxSort + 1 },
          ]
        })
      },
      updateProperty: (propertyId, patch) => {
        setProperties((prev) =>
          prev.map((p) =>
            p.id === propertyId
              ? {
                  ...p,
                  ...(patch.name !== undefined ? { name: patch.name } : {}),
                  ...(patch.type !== undefined ? { type: patch.type } : {}),
                  ...(patch.options !== undefined ? { options: patch.options } : {}),
                }
              : p,
          ),
        )
      },
      deleteProperty: (propertyId) => {
        setProperties((prev) => prev.filter((p) => p.id !== propertyId))
        setRows((prev) =>
          prev.map((r) => {
            if (!(propertyId in r.data)) return r
            const data = { ...r.data }
            delete data[propertyId]
            return { ...r, data }
          }),
        )
        setViews((prev) =>
          prev.map((v) => (v.groupPropertyId === propertyId ? { ...v, groupPropertyId: null } : v)),
        )
      },
      createOption: (propertyId, name) => {
        const prop = store.getDatabase(databaseId)?.properties.find((p) => p.id === propertyId)
        const id = crypto.randomUUID()
        const color = nextOptionColor(prop?.options.length ?? 0)
        const options = [...(prop?.options ?? []), { id, name, color }]
        setProperties((prev) => prev.map((p) => (p.id === propertyId ? { ...p, options } : p)))
        return id
      },
      addView: (type, name) => {
        const groupable = store
          .getDatabase(databaseId)
          ?.properties.find((p) => p.type === 'status' || p.type === 'select')
        const id = crypto.randomUUID()
        setViews((prev) => {
          const maxSort = prev.reduce((m, v) => Math.max(m, v.sort), -1)
          return [
            ...prev,
            {
              id,
              name: name ?? (type === 'board' ? 'Board' : 'Table'),
              type,
              groupPropertyId: type === 'board' ? (groupable?.id ?? null) : null,
              sort: maxSort + 1,
              config: {},
            },
          ]
        })
        selectView(id)
      },
      updateView: (viewId, patch) => {
        setViews((prev) =>
          prev.map((v) =>
            v.id === viewId
              ? {
                  ...v,
                  ...(patch.name !== undefined ? { name: patch.name } : {}),
                  ...(patch.type !== undefined ? { type: patch.type } : {}),
                  ...(patch.groupPropertyId !== undefined ? { groupPropertyId: patch.groupPropertyId } : {}),
                }
              : v,
          ),
        )
      },
      deleteView: (viewId) => {
        setViews((prev) => prev.filter((v) => v.id !== viewId))
        setRows((prev) =>
          prev.map((r) => {
            if (!(viewId in r.viewOrder)) return r
            const viewOrder = { ...r.viewOrder }
            delete viewOrder[viewId]
            return { ...r, viewOrder }
          }),
        )
      },
    }),
    [store, databaseId, setRows, setProperties, setViews, selectView],
  )

  if (!agg || !meta) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-neutral-400">
        This database was deleted.
      </div>
    )
  }

  const activeView = views.find((v) => v.id === activeViewId) ?? views[0]
  const openRow = openRowId ? rows.find((r) => r.id === openRowId) : null
  const isBoard = activeView?.type === 'board'
  const viewContainerClass = embedded
    ? isBoard
      ? 'h-[60vh] overflow-hidden'
      : 'max-h-[60vh] overflow-auto'
    : isBoard
      ? 'min-h-0 flex-1 overflow-hidden'
      : 'min-h-0 flex-1 overflow-auto'

  return (
    <div className={embedded ? 'flex flex-col' : 'flex h-full flex-col'}>
      <div className="flex items-center gap-2 px-4 pt-3">
        <DatabaseIconPicker
          value={meta.icon}
          onPick={(emoji) => setMeta((m) => ({ ...m, icon: emoji }))}
          onRemove={() => setMeta((m) => ({ ...m, icon: null }))}
        />
        <input
          value={meta.name}
          onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))}
          placeholder="Untitled"
          aria-label="Database name"
          className="min-w-0 flex-1 bg-transparent text-lg font-bold outline-none placeholder:text-neutral-300 dark:placeholder:text-neutral-600"
        />
      </div>

      {activeView && (
        <ViewTabStrip
          views={[...views].sort((a, b) => a.sort - b.sort)}
          properties={properties}
          activeViewId={activeView.id}
          onSelect={selectView}
          actions={actions}
        />
      )}

      <div className={viewContainerClass}>
        {activeView?.type === 'board' ? (
          <BoardView
            view={activeView}
            properties={properties}
            rows={rows}
            members={store.members}
            actions={actions}
            onOpenRow={setOpenRowId}
          />
        ) : activeView ? (
          <TableView
            view={activeView}
            properties={properties}
            rows={rows}
            members={store.members}
            actions={actions}
            onOpenRow={setOpenRowId}
          />
        ) : null}
      </div>

      {openRow && (
        <RowDetailModal
          row={openRow}
          properties={properties}
          members={store.members}
          actions={actions}
          onClose={() => setOpenRowId(null)}
        />
      )}
    </div>
  )
}
