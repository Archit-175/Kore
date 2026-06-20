// Phase 4 (Databases) domain types — the camelCased shapes the UI renders, plus
// small pure helpers. Storage is JSONB: a row's cell values live in `data` keyed
// by property id; per-view card order overrides live in `viewOrder` ({viewId:n}).

import type { OptionColor } from './colors'

/** The 7 property (column) types in scope for v1. */
export const PROPERTY_TYPES = [
  'title',
  'text',
  'select',
  'multi_select',
  'status',
  'date',
  'person',
] as const
export type PropertyType = (typeof PROPERTY_TYPES)[number]

/** Types whose options can drive a Board's columns (single-value selects). */
export const GROUPABLE_TYPES: readonly PropertyType[] = ['status', 'select']
export function isGroupable(type: PropertyType): boolean {
  return GROUPABLE_TYPES.includes(type)
}

/** Human label for a property type (type picker). */
export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  title: 'Title',
  text: 'Text',
  select: 'Select',
  multi_select: 'Multi-select',
  status: 'Status',
  date: 'Date',
  person: 'Person',
}

/** A single option of a select/multi_select/status property. */
export type SelectOption = {
  id: string
  name: string
  color: OptionColor
}

/** A column definition. */
export type DbProperty = {
  id: string
  name: string
  type: PropertyType
  options: SelectOption[]
  sort: number
}

/** A saved view (a Table or Board tab). */
export type DbView = {
  id: string
  name: string
  type: 'table' | 'board'
  groupPropertyId: string | null
  sort: number
  config: Record<string, unknown>
}

/** A cell value. Shape depends on the property type:
 *  - title/text: string · date: ISO string · status/select: option id · person: user id
 *  - multi_select: array of option ids · empty: '' / [] / undefined */
export type CellValue = string | string[] | null | undefined

/** A record (row). `data` is keyed by property id. */
export type DbRow = {
  id: string
  data: Record<string, CellValue>
  sort: number
  viewOrder: Record<string, number>
  createdAt: string
  updatedAt: string
}

/** The database envelope (without its rows/props/views). */
export type DatabaseMeta = {
  id: string
  projectId: string
  name: string
  icon: string | null
}

/** Everything the standalone view needs in one shot (SSR + realtime refetch). */
export type DatabaseAggregate = {
  database: DatabaseMeta
  properties: DbProperty[]
  views: DbView[]
  rows: DbRow[]
}

/** A row in the project's database list (sidebar + project-home). */
export type DatabaseListItem = {
  id: string
  name: string
  icon: string | null
  sort: number
  trashedAt: string | null
  rowCount: number
}

/** A workspace member, for resolving `person` cells to a name + avatar. */
export type DbMember = {
  id: string
  name: string
  avatarUrl: string | null
}

// ----------------------------------------------------------------------------
// Patch shapes for the optimistic action surface
// ----------------------------------------------------------------------------
export type PropertyPatch = {
  name?: string
  type?: PropertyType
  options?: SelectOption[]
}
export type ViewPatch = {
  name?: string
  type?: 'table' | 'board'
  groupPropertyId?: string | null
}

/** The callback surface DatabaseView builds (optimistic local patch + server
 *  action) and passes down to the table/board/cells. */
export type DatabaseActions = {
  isOwner: boolean
  // rows
  addRow: (group?: { propertyId: string; value: string | null }) => void
  updateCell: (rowId: string, propertyId: string, value: CellValue) => void
  deleteRow: (rowId: string) => void
  moveRowInView: (viewId: string, rowId: string, sort: number) => void
  setRowGroup: (
    viewId: string,
    rowId: string,
    propertyId: string,
    value: string | null,
    sort: number,
  ) => void
  // properties
  addProperty: (type: PropertyType, name?: string) => void
  updateProperty: (propertyId: string, patch: PropertyPatch) => void
  deleteProperty: (propertyId: string) => void
  /** Append a new option to a select-like property and return its id (synchronous
   *  so a cell can immediately commit the new value). */
  createOption: (propertyId: string, name: string) => string
  // views
  addView: (type: 'table' | 'board', name?: string) => void
  updateView: (viewId: string, patch: ViewPatch) => void
  deleteView: (viewId: string) => void
}

// ----------------------------------------------------------------------------
// Small pure helpers
// ----------------------------------------------------------------------------
export function databaseDisplayName(name: string): string {
  return name.trim() || 'Untitled'
}

export function dbHref(projectId: string, databaseId: string): string {
  return `/p/${projectId}/db/${databaseId}`
}

/** The (single) title property of a database, or the first property as a fallback. */
export function titleProperty(properties: DbProperty[]): DbProperty | undefined {
  return properties.find((p) => p.type === 'title') ?? properties[0]
}

/** Render a row's title text (the title property's value), with a fallback. */
export function rowTitle(row: DbRow, properties: DbProperty[]): string {
  const tp = titleProperty(properties)
  const raw = tp ? row.data[tp.id] : undefined
  return typeof raw === 'string' && raw.trim() ? raw : 'Untitled'
}
