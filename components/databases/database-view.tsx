'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { loadDatabase } from '@/lib/databases/load-database'
import { nextOptionColor } from '@/lib/databases/colors'
import {
  type CellValue,
  type DatabaseActions,
  type DatabaseAggregate,
  type DatabaseMeta,
  type DbMember,
  type DbProperty,
  type DbRow,
  type DbView,
} from '@/lib/databases/types'
import * as api from '@/lib/actions/databases'
import { Popover } from './shared'
import { ViewTabStrip } from './view-tab-strip'
import { TableView } from './table-view'
import { BoardView } from './board-view'
import { RowDetailModal } from './row-detail-modal'

const DB_ICONS = [
  '🗄', '📊', '📋', '✅', '🎯', '📁', '🗂️', '🧩',
  '📅', '🚀', '🛠️', '💼', '🏷️', '🔖', '📈', '🧪',
] as const

/** Compact emoji picker for the database header (the docs IconPicker renders at
 *  text-5xl for a page title — too large here). */
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

/** Drop empty cell values (so jsonb stays clean) and patch otherwise. */
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

/**
 * The standalone (and embedded) database surface. Owns realtime (Postgres Changes
 * on the 4 database tables, filtered to THIS database, per-mount useId() channel)
 * + optimistic state, builds the action surface, and renders the view tabs + the
 * active Table/Board view. One channel per database lifetime — switching views is
 * a pure client filter. Mount with key={databaseId}.
 */
export function DatabaseView({
  initial,
  workspaceId,
  members,
  isOwner,
  embedded = false,
}: {
  initial: DatabaseAggregate
  workspaceId: string
  members: DbMember[]
  isOwner: boolean
  embedded?: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const channelId = useId().replace(/[^a-zA-Z0-9]/g, '')
  const databaseId = initial.database.id

  const [meta, setMeta] = useState<DatabaseMeta>(initial.database)
  const [properties, setProperties] = useState<DbProperty[]>(initial.properties)
  const [views, setViews] = useState<DbView[]>(initial.views)
  const [rows, setRows] = useState<DbRow[]>(initial.rows)
  const [gone, setGone] = useState(false)
  const [openRowId, setOpenRowId] = useState<string | null>(null)

  const propertiesRef = useRef(properties)
  useEffect(() => {
    propertiesRef.current = properties
  }, [properties])

  // active view (per-client; persisted to localStorage)
  const [activeViewId, setActiveViewId] = useState<string>(initial.views[0]?.id ?? '')
  useEffect(() => {
    const saved = localStorage.getItem(`kore-db-view-${databaseId}`)
    if (saved && initial.views.some((v) => v.id === saved)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveViewId(saved)
    }
  }, [databaseId, initial.views])
  const selectView = useCallback(
    (id: string) => {
      setActiveViewId(id)
      localStorage.setItem(`kore-db-view-${databaseId}`, id)
    },
    [databaseId],
  )
  // (activeViewId may point at a just-deleted view; `activeView` below falls back
  // to the first view, and selecting any tab re-syncs it — no effect needed.)

  // --- realtime: debounced full refetch of the aggregate ---------------------
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const doRefetch = useCallback(async () => {
    const agg = await loadDatabase(supabase, workspaceId, databaseId)
    if (!agg) {
      setGone(true)
      return
    }
    setGone(false) // a later successful load clears a transient/trashed "deleted" state
    setMeta(agg.database)
    setProperties(agg.properties)
    setViews(agg.views)
    setRows(agg.rows)
  }, [supabase, workspaceId, databaseId])

  useEffect(() => {
    let channel: RealtimeChannel | null = null
    let cancelled = false
    const schedule = () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current)
      refetchTimer.current = setTimeout(() => void doRefetch(), 300)
    }
    void (async () => {
      const { data } = await supabase.auth.getSession()
      await supabase.realtime.setAuth(data.session?.access_token ?? null)
      if (cancelled) return
      channel = supabase
        .channel(`database:${databaseId}:${channelId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'databases', filter: `id=eq.${databaseId}` },
          schedule,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'database_properties', filter: `database_id=eq.${databaseId}` },
          schedule,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'database_views', filter: `database_id=eq.${databaseId}` },
          schedule,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'database_rows', filter: `database_id=eq.${databaseId}` },
          schedule,
        )
        .subscribe()
    })()
    return () => {
      cancelled = true
      if (refetchTimer.current) clearTimeout(refetchTimer.current)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [supabase, databaseId, channelId, doRefetch])

  // --- optimistic action surface ---------------------------------------------
  const actions: DatabaseActions = useMemo(
    () => ({
      isOwner,
      addRow: async (group) => {
        const data: Record<string, CellValue> =
          group && group.value !== null ? { [group.propertyId]: group.value } : {}
        const res = await api.createDatabaseRow({ databaseId, data })
        if (res.id) {
          const now = new Date().toISOString()
          setRows((prev) => {
            const maxSort = prev.reduce((m, r) => Math.max(m, r.sort), -1)
            return [
              ...prev,
              { id: res.id!, data, sort: maxSort + 1, viewOrder: {}, createdAt: now, updatedAt: now },
            ]
          })
        }
      },
      updateCell: (rowId, propertyId, value) => {
        setRows((prev) =>
          prev.map((r) => (r.id === rowId ? { ...r, data: patchData(r.data, propertyId, value) } : r)),
        )
        void api.updateCell(rowId, propertyId, value)
      },
      deleteRow: (rowId) => {
        setRows((prev) => prev.filter((r) => r.id !== rowId))
        void api.deleteDatabaseRow(rowId)
      },
      moveRowInView: (viewId, rowId, sort) => {
        setRows((prev) =>
          prev.map((r) =>
            r.id === rowId ? { ...r, viewOrder: { ...r.viewOrder, [viewId]: sort } } : r,
          ),
        )
        void api.moveRowInView(viewId, rowId, sort)
      },
      setRowGroup: (viewId, rowId, propertyId, value, sort) => {
        setRows((prev) =>
          prev.map((r) =>
            r.id === rowId
              ? {
                  ...r,
                  data: patchData(r.data, propertyId, value),
                  viewOrder: { ...r.viewOrder, [viewId]: sort },
                }
              : r,
          ),
        )
        void api.setRowGroup(viewId, rowId, propertyId, value, sort)
      },
      addProperty: async (type, name) => {
        await api.createDatabaseProperty({ databaseId, type, name })
        await doRefetch()
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
        void api.updateProperty(propertyId, patch)
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
        void api.deleteDatabaseProperty(propertyId)
      },
      createOption: (propertyId, name) => {
        const prop = propertiesRef.current.find((p) => p.id === propertyId)
        const id = crypto.randomUUID()
        const color = nextOptionColor(prop?.options.length ?? 0)
        const options = [...(prop?.options ?? []), { id, name, color }]
        setProperties((prev) =>
          prev.map((p) => (p.id === propertyId ? { ...p, options } : p)),
        )
        void api.updateProperty(propertyId, { options })
        return id
      },
      addView: async (type, name) => {
        const groupable = propertiesRef.current.find(
          (p) => p.type === 'status' || p.type === 'select',
        )
        const res = await api.createDatabaseView({
          databaseId,
          type,
          name,
          groupPropertyId: type === 'board' ? (groupable?.id ?? null) : null,
        })
        await doRefetch()
        if (res.id) selectView(res.id)
      },
      updateView: (viewId, patch) => {
        setViews((prev) =>
          prev.map((v) =>
            v.id === viewId
              ? {
                  ...v,
                  ...(patch.name !== undefined ? { name: patch.name } : {}),
                  ...(patch.type !== undefined ? { type: patch.type } : {}),
                  ...(patch.groupPropertyId !== undefined
                    ? { groupPropertyId: patch.groupPropertyId }
                    : {}),
                }
              : v,
          ),
        )
        void api.updateView(viewId, patch)
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
        void api.deleteDatabaseView(viewId)
      },
    }),
    [isOwner, databaseId, doRefetch, selectView],
  )

  // --- name (clobber-safe, debounced) ----------------------------------------
  const nameRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(meta.name)
  const nameTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nameDraftRef = useRef(name)
  useEffect(() => {
    nameDraftRef.current = name
  }, [name])
  useEffect(() => {
    if (nameRef.current !== document.activeElement) setName(meta.name)
  }, [meta.name])
  // Flush a pending rename on unmount (an unmount without a prior blur — e.g. a
  // remote refetch that swaps this subtree — would otherwise drop the edit).
  useEffect(
    () => () => {
      if (nameTimer.current) {
        clearTimeout(nameTimer.current)
        void api.renameDatabase(databaseId, nameDraftRef.current)
      }
    },
    [databaseId],
  )
  const onNameChange = (v: string) => {
    setName(v)
    setMeta((m) => ({ ...m, name: v }))
    if (nameTimer.current) clearTimeout(nameTimer.current)
    nameTimer.current = setTimeout(() => void api.renameDatabase(databaseId, v), 500)
  }

  const activeView = views.find((v) => v.id === activeViewId) ?? views[0]
  const openRow = openRowId ? rows.find((r) => r.id === openRowId) : null
  const isBoard = activeView?.type === 'board'
  // Table = ONE scroll container (both axes) so the header row + title column can
  // stay sticky. Board manages its own horizontal scroll + per-column vertical scroll.
  const viewContainerClass = embedded
    ? isBoard
      ? 'h-[60vh] overflow-hidden'
      : 'max-h-[60vh] overflow-auto'
    : isBoard
      ? 'min-h-0 flex-1 overflow-hidden'
      : 'min-h-0 flex-1 overflow-auto'

  if (gone) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-neutral-400">
        This database was deleted.
      </div>
    )
  }

  return (
    <div className={embedded ? 'flex flex-col' : 'flex h-full flex-col'}>
      {/* header */}
      <div className="flex items-center gap-2 px-4 pt-3">
        <DatabaseIconPicker
          value={meta.icon}
          onPick={(emoji) => {
            setMeta((m) => ({ ...m, icon: emoji }))
            void api.updateDatabaseIcon(databaseId, emoji)
          }}
          onRemove={() => {
            setMeta((m) => ({ ...m, icon: null }))
            void api.updateDatabaseIcon(databaseId, null)
          }}
        />
        <input
          ref={nameRef}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
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
            members={members}
            actions={actions}
            onOpenRow={setOpenRowId}
          />
        ) : activeView ? (
          <TableView
            view={activeView}
            properties={properties}
            rows={rows}
            members={members}
            actions={actions}
            onOpenRow={setOpenRowId}
          />
        ) : null}
      </div>

      {openRow && (
        <RowDetailModal
          row={openRow}
          properties={properties}
          members={members}
          actions={actions}
          onClose={() => setOpenRowId(null)}
        />
      )}
    </div>
  )
}
