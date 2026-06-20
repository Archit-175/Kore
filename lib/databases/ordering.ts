// Pure ordering helpers for database rows — no React, no Supabase. Per-view card
// order = the row's `view_order[viewId]` override if present, else its global
// `sort`. Sorted in JS after each refetch (the jsonb override is unscannable by
// SQL, but the dataset is small for an under-10 team). midpointSort is REUSED
// from the docs tree (single source of truth — do not fork).

import { midpointSort } from '@/lib/docs/tree'
import type { CellValue, DbRow } from './types'

export { midpointSort }

const stable = (a: DbRow, b: DbRow) =>
  a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)

/** A row's effective order within a given view. */
export function effectiveOrder(row: DbRow, viewId: string): number {
  const o = row.viewOrder[viewId]
  return typeof o === 'number' ? o : row.sort
}

/** All rows ordered for a given view (effective order, stable tiebreak). */
export function orderedRows(rows: DbRow[], viewId: string): DbRow[] {
  return rows
    .slice()
    .sort((a, b) => effectiveOrder(a, viewId) - effectiveOrder(b, viewId) || stable(a, b))
}

/** Normalize a cell value to the single string group key (or null = "no value"). */
export function groupKeyOf(value: CellValue): string | null {
  return typeof value === 'string' && value ? value : null
}

/** Rows belonging to one board column (group property === optionId, or null),
 *  ordered for the view. */
export function columnRows(
  rows: DbRow[],
  viewId: string,
  groupPropertyId: string,
  optionId: string | null,
): DbRow[] {
  return orderedRows(
    rows.filter((r) => groupKeyOf(r.data[groupPropertyId]) === optionId),
    viewId,
  )
}

export type ReorderPlan = {
  /** Rank to write for the dragged row. */
  draggedSort: number
  /** Extra rows whose rank must be rewritten (only when a reseed was needed). */
  reseeds: { rowId: string; sort: number }[]
}

/**
 * Plan the rank for a card dropped at `insertIndex` within `columnOrdered` (the
 * column's rows in effective order, EXCLUDING the dragged row). Normally one
 * midpoint write (reseeds empty). But a row's effective order mixes two spaces —
 * its global `sort` (until dragged in this view) and its `view_order[viewId]`
 * override — which can make two neighbours TIE; midpointSort(N, N) === N would
 * then NOT land strictly between them. On a tie we reseed the whole column to
 * contiguous integers (with the dragged card at `insertIndex`) so the drop always
 * lands exactly where intended.
 */
export function reorderPlan(
  columnOrdered: DbRow[],
  viewId: string,
  insertIndex: number,
): ReorderPlan {
  const n = columnOrdered.length
  const idx = Math.max(0, Math.min(insertIndex, n))
  const before = idx > 0 ? effectiveOrder(columnOrdered[idx - 1], viewId) : null
  const after = idx < n ? effectiveOrder(columnOrdered[idx], viewId) : null
  if (before === null || after === null || before < after) {
    return { draggedSort: midpointSort(before, after), reseeds: [] }
  }
  // Degenerate: neighbours tie. Reseed the column to contiguous integers, the
  // dragged card occupying `idx` (existing cards shift around the insert slot).
  const reseeds = columnOrdered.map((r, j) => ({ rowId: r.id, sort: j < idx ? j : j + 1 }))
  return { draggedSort: idx, reseeds }
}
