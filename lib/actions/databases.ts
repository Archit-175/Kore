'use server'

import { createClient } from '@/lib/supabase/server'
import { canAdminProject, requireMember, verifySession } from '@/lib/dal'
import { logActivity, type ActivityAction } from '@/lib/actions/activity'
import type { CellValue, PropertyType, SelectOption } from '@/lib/databases/types'
import { PROPERTY_TYPES } from '@/lib/databases/types'
import type { Json, TablesUpdate } from '@/types/database'

/**
 * Databases (Phase 4) Server Actions — the real authz boundary (DAL-gated; RLS
 * double-checks). Same conventions as lib/actions/pages.ts: stamp workspace_id
 * from membership (never client input) + created_by from the session, return
 * { error } on failure, and SKIP revalidatePath (the DatabaseView + sidebar tree
 * own their realtime + optimistic state).
 *
 * Databases are plain structured rows — NO Yjs. A row's cells share one `data`
 * jsonb, so single-cell writes go through the db_set_cell / db_set_row_group /
 * db_set_view_order RPCs (targeted jsonb writes — concurrent edits to distinct
 * keys merge instead of clobbering).
 */

type Result = { error?: string }
type CreateResult = { error?: string; id?: string }
type Supabase = Awaited<ReturnType<typeof createClient>>

const TYPE_SET: readonly string[] = PROPERTY_TYPES

/** Verify a database exists in the caller's workspace; returns its project_id (or
 *  null if not found / not theirs). Guards every child insert against IDOR. */
async function databaseInWorkspace(
  supabase: Supabase,
  workspaceId: string,
  databaseId: string,
): Promise<{ projectId: string } | null> {
  const { data } = await supabase
    .from('databases')
    .select('project_id')
    .eq('id', databaseId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  return data ? { projectId: data.project_id } : null
}

/** Snapshot a database's project_id + name and log a coarse activity event.
 *  Call AFTER trash/restore/rename (row still exists) or BEFORE permanent delete. */
async function logDatabaseEvent(
  supabase: Supabase,
  workspaceId: string,
  actorId: string,
  id: string,
  action: ActivityAction,
): Promise<void> {
  const { data } = await supabase
    .from('databases')
    .select('project_id, name')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (!data) return
  await logActivity(supabase, {
    workspaceId,
    projectId: data.project_id,
    actorId,
    action,
    targetType: 'database',
    targetId: id,
    targetTitle: data.name,
  })
}

/** Next fractional append rank = (max existing sort) + 1. */
async function nextSort(
  supabase: Supabase,
  table: 'databases' | 'database_properties' | 'database_views' | 'database_rows',
  scope: { column: 'project_id' | 'database_id'; value: string },
  workspaceId: string,
): Promise<number> {
  const { data } = await supabase
    .from(table)
    .select('sort')
    // scope.column is 'project_id' (databases) or 'database_id' (children); the
    // union builder only types the common columns, so assert a valid column name.
    .eq('workspace_id', workspaceId)
    .eq(scope.column as 'workspace_id', scope.value)
    .order('sort', { ascending: false })
    .limit(1)
  return data && data[0] ? data[0].sort + 1 : 0
}

function defaultStatusOptions(): SelectOption[] {
  return [
    { id: crypto.randomUUID(), name: 'To do', color: 'gray' },
    { id: crypto.randomUUID(), name: 'In progress', color: 'blue' },
    { id: crypto.randomUUID(), name: 'Done', color: 'green' },
  ]
}

/** Reject person values that aren't active members of the workspace. */
async function invalidPersonIds(
  supabase: Supabase,
  workspaceId: string,
  ids: string[],
): Promise<boolean> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return false
  const { data } = await supabase
    .from('memberships')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .in('user_id', unique)
  const found = new Set((data ?? []).map((m) => m.user_id))
  return unique.some((id) => !found.has(id))
}

// ----------------------------------------------------------------------------
// databases (the envelope)
// ----------------------------------------------------------------------------
export async function createDatabase(input: {
  projectId: string
  name?: string
}): Promise<CreateResult> {
  const membership = await requireMember()
  const user = await verifySession()
  const supabase = await createClient()

  // Project must belong to this workspace (project_id is NOT NULL + drives routing).
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', input.projectId)
    .eq('workspace_id', membership.workspaceId)
    .maybeSingle()
  if (!project) return { error: 'Project not found.' }

  const sort = await nextSort(
    supabase,
    'databases',
    { column: 'project_id', value: input.projectId },
    membership.workspaceId,
  )

  const { data: db, error } = await supabase
    .from('databases')
    .insert({
      workspace_id: membership.workspaceId,
      project_id: input.projectId,
      name: input.name ?? '',
      sort,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  // Seed: a Title ("Name") + a Status property, and a default Table view, so the
  // database (and a Board grouped by Status) works out of the box.
  const { error: propErr } = await supabase.from('database_properties').insert([
    {
      workspace_id: membership.workspaceId,
      database_id: db.id,
      name: 'Name',
      type: 'title',
      options: [],
      sort: 0,
    },
    {
      workspace_id: membership.workspaceId,
      database_id: db.id,
      name: 'Status',
      type: 'status',
      options: defaultStatusOptions(),
      sort: 1,
    },
  ])
  if (propErr) return { error: propErr.message }

  const { error: viewErr } = await supabase.from('database_views').insert({
    workspace_id: membership.workspaceId,
    database_id: db.id,
    name: 'Table',
    type: 'table',
    sort: 0,
    created_by: user.id,
  })
  if (viewErr) return { error: viewErr.message }

  await logActivity(supabase, {
    workspaceId: membership.workspaceId,
    projectId: input.projectId,
    actorId: user.id,
    action: 'created',
    targetType: 'database',
    targetId: db.id,
    targetTitle: input.name || 'Untitled',
  })
  return { id: db.id }
}

export async function renameDatabase(id: string, name: string): Promise<Result> {
  const membership = await requireMember()
  const user = await verifySession()
  const supabase = await createClient()
  const { error } = await supabase
    .from('databases')
    .update({ name: name ?? '' })
    .eq('id', id)
    .eq('workspace_id', membership.workspaceId)
  if (error) return { error: error.message }
  await logDatabaseEvent(supabase, membership.workspaceId, user.id, id, 'renamed')
  return {}
}

export async function updateDatabaseIcon(id: string, icon: string | null): Promise<Result> {
  const membership = await requireMember()
  const supabase = await createClient()
  const { error } = await supabase
    .from('databases')
    .update({ icon })
    .eq('id', id)
    .eq('workspace_id', membership.workspaceId)
  return error ? { error: error.message } : {}
}

export async function reorderDatabase(id: string, sort: number): Promise<Result> {
  const membership = await requireMember()
  const supabase = await createClient()
  const { error } = await supabase
    .from('databases')
    .update({ sort })
    .eq('id', id)
    .eq('workspace_id', membership.workspaceId)
  return error ? { error: error.message } : {}
}

export async function trashDatabase(id: string): Promise<Result> {
  const membership = await requireMember()
  const user = await verifySession()
  const supabase = await createClient()
  const { error } = await supabase
    .from('databases')
    .update({ trashed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('workspace_id', membership.workspaceId)
  if (error) return { error: error.message }
  await logDatabaseEvent(supabase, membership.workspaceId, user.id, id, 'trashed')
  return {}
}

export async function restoreDatabase(id: string): Promise<Result> {
  const membership = await requireMember()
  const user = await verifySession()
  const supabase = await createClient()
  const { error } = await supabase
    .from('databases')
    .update({ trashed_at: null })
    .eq('id', id)
    .eq('workspace_id', membership.workspaceId)
  if (error) return { error: error.message }
  await logDatabaseEvent(supabase, membership.workspaceId, user.id, id, 'restored')
  return {}
}

/** Permanent delete — owner-only. FK cascade removes properties/views/rows. */
export async function deleteDatabasePermanent(id: string): Promise<Result> {
  const membership = await requireMember()
  const user = await verifySession()
  const supabase = await createClient()
  const { data: db } = await supabase
    .from('databases')
    .select('project_id')
    .eq('id', id)
    .maybeSingle()
  if (!db) return { error: 'Database not found.' }
  if (!(await canAdminProject(db.project_id)))
    return { error: 'Only team members can permanently delete this.' }
  // Snapshot the title BEFORE the row is gone.
  await logDatabaseEvent(supabase, membership.workspaceId, user.id, id, 'deleted')
  const { error } = await supabase
    .from('databases')
    .delete()
    .eq('id', id)
    .eq('workspace_id', membership.workspaceId)
  return error ? { error: error.message } : {}
}

/** Empty a project's database trash — team admins (owner or team member). */
export async function emptyDatabaseTrash(projectId: string): Promise<Result> {
  await requireMember()
  if (!(await canAdminProject(projectId)))
    return { error: 'Only team members can empty the trash.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('empty_database_trash', { p_project_id: projectId })
  return error ? { error: error.message } : {}
}

// ----------------------------------------------------------------------------
// database_properties (columns)
// ----------------------------------------------------------------------------
export async function createDatabaseProperty(input: {
  databaseId: string
  type: PropertyType
  name?: string
}): Promise<CreateResult> {
  const membership = await requireMember()
  const supabase = await createClient()
  const db = await databaseInWorkspace(supabase, membership.workspaceId, input.databaseId)
  if (!db) return { error: 'Database not found.' }

  const type = TYPE_SET.includes(input.type) ? input.type : 'text'
  const sort = await nextSort(
    supabase,
    'database_properties',
    { column: 'database_id', value: input.databaseId },
    membership.workspaceId,
  )
  const options = type === 'status' ? defaultStatusOptions() : []
  const defaultName =
    input.name ?? (type === 'status' ? 'Status' : type === 'date' ? 'Date' : type === 'person' ? 'Person' : 'Property')

  const { data, error } = await supabase
    .from('database_properties')
    .insert({
      workspace_id: membership.workspaceId,
      database_id: input.databaseId,
      name: defaultName,
      type,
      options,
      sort,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  return { id: data.id }
}

export async function updateProperty(
  id: string,
  patch: { name?: string; type?: PropertyType; options?: SelectOption[] },
): Promise<Result> {
  const membership = await requireMember()
  const supabase = await createClient()

  const update: TablesUpdate<'database_properties'> = {}
  if (patch.name !== undefined) update.name = patch.name
  if (patch.type !== undefined && TYPE_SET.includes(patch.type)) update.type = patch.type
  if (patch.options !== undefined) update.options = patch.options as unknown as Json
  if (Object.keys(update).length === 0) return {}

  const { error } = await supabase
    .from('database_properties')
    .update(update)
    .eq('id', id)
    .eq('workspace_id', membership.workspaceId)
  return error ? { error: error.message } : {}
}

export async function reorderProperty(id: string, sort: number): Promise<Result> {
  const membership = await requireMember()
  const supabase = await createClient()
  const { error } = await supabase
    .from('database_properties')
    .update({ sort })
    .eq('id', id)
    .eq('workspace_id', membership.workspaceId)
  return error ? { error: error.message } : {}
}

/** Delete a column (member). Also strips the orphaned key from every row's data. */
export async function deleteDatabaseProperty(id: string): Promise<Result> {
  const membership = await requireMember()
  const supabase = await createClient()

  const { data: prop } = await supabase
    .from('database_properties')
    .select('database_id, type')
    .eq('id', id)
    .eq('workspace_id', membership.workspaceId)
    .maybeSingle()
  if (!prop) return { error: 'Property not found.' }
  if (prop.type === 'title') return { error: 'The title column cannot be deleted.' }

  const { error } = await supabase
    .from('database_properties')
    .delete()
    .eq('id', id)
    .eq('workspace_id', membership.workspaceId)
  if (error) return { error: error.message }

  // Strip the orphaned jsonb key from every row (FK cascade can't reach jsonb).
  await supabase.rpc('db_strip_property', { p_database_id: prop.database_id, p_property_id: id })
  return {}
}

// ----------------------------------------------------------------------------
// database_views (tabs)
// ----------------------------------------------------------------------------
export async function createDatabaseView(input: {
  databaseId: string
  type: 'table' | 'board'
  name?: string
  groupPropertyId?: string | null
}): Promise<CreateResult> {
  const membership = await requireMember()
  const user = await verifySession()
  const supabase = await createClient()
  const db = await databaseInWorkspace(supabase, membership.workspaceId, input.databaseId)
  if (!db) return { error: 'Database not found.' }

  // A board's grouping column must belong to THIS database.
  if (input.groupPropertyId) {
    const { data: gp } = await supabase
      .from('database_properties')
      .select('id')
      .eq('id', input.groupPropertyId)
      .eq('database_id', input.databaseId)
      .eq('workspace_id', membership.workspaceId)
      .maybeSingle()
    if (!gp) return { error: 'Invalid grouping property.' }
  }

  const type = input.type === 'board' ? 'board' : 'table'
  const sort = await nextSort(
    supabase,
    'database_views',
    { column: 'database_id', value: input.databaseId },
    membership.workspaceId,
  )

  const { data, error } = await supabase
    .from('database_views')
    .insert({
      workspace_id: membership.workspaceId,
      database_id: input.databaseId,
      name: input.name ?? (type === 'board' ? 'Board' : 'Table'),
      type,
      group_property_id: input.groupPropertyId ?? null,
      sort,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  return { id: data.id }
}

export async function updateView(
  id: string,
  patch: { name?: string; type?: 'table' | 'board'; groupPropertyId?: string | null },
): Promise<Result> {
  const membership = await requireMember()
  const supabase = await createClient()

  // A non-null grouping column must belong to this view's database.
  if (patch.groupPropertyId) {
    const { data: view } = await supabase
      .from('database_views')
      .select('database_id')
      .eq('id', id)
      .eq('workspace_id', membership.workspaceId)
      .maybeSingle()
    if (!view) return { error: 'View not found.' }
    const { data: gp } = await supabase
      .from('database_properties')
      .select('id')
      .eq('id', patch.groupPropertyId)
      .eq('database_id', view.database_id)
      .eq('workspace_id', membership.workspaceId)
      .maybeSingle()
    if (!gp) return { error: 'Invalid grouping property.' }
  }

  const update: TablesUpdate<'database_views'> = {}
  if (patch.name !== undefined) update.name = patch.name
  if (patch.type !== undefined) update.type = patch.type === 'board' ? 'board' : 'table'
  if (patch.groupPropertyId !== undefined) update.group_property_id = patch.groupPropertyId
  if (Object.keys(update).length === 0) return {}

  const { error } = await supabase
    .from('database_views')
    .update(update)
    .eq('id', id)
    .eq('workspace_id', membership.workspaceId)
  return error ? { error: error.message } : {}
}

export async function reorderView(id: string, sort: number): Promise<Result> {
  const membership = await requireMember()
  const supabase = await createClient()
  const { error } = await supabase
    .from('database_views')
    .update({ sort })
    .eq('id', id)
    .eq('workspace_id', membership.workspaceId)
  return error ? { error: error.message } : {}
}

/** Delete a view (member). Strips the orphaned view_order key from every row. */
export async function deleteDatabaseView(id: string): Promise<Result> {
  const membership = await requireMember()
  const supabase = await createClient()

  const { data: view } = await supabase
    .from('database_views')
    .select('database_id')
    .eq('id', id)
    .eq('workspace_id', membership.workspaceId)
    .maybeSingle()
  if (!view) return { error: 'View not found.' }

  const { error } = await supabase
    .from('database_views')
    .delete()
    .eq('id', id)
    .eq('workspace_id', membership.workspaceId)
  if (error) return { error: error.message }

  await supabase.rpc('db_strip_view_order', { p_database_id: view.database_id, p_view_id: id })
  return {}
}

// ----------------------------------------------------------------------------
// database_rows (records)
// ----------------------------------------------------------------------------
export async function createDatabaseRow(input: {
  databaseId: string
  data?: Record<string, CellValue>
  sort?: number
}): Promise<CreateResult> {
  const membership = await requireMember()
  const user = await verifySession()
  const supabase = await createClient()
  const db = await databaseInWorkspace(supabase, membership.workspaceId, input.databaseId)
  if (!db) return { error: 'Database not found.' }

  const sort =
    input.sort ??
    (await nextSort(
      supabase,
      'database_rows',
      { column: 'database_id', value: input.databaseId },
      membership.workspaceId,
    ))

  const { data, error } = await supabase
    .from('database_rows')
    .insert({
      workspace_id: membership.workspaceId,
      database_id: input.databaseId,
      data: input.data ?? {},
      sort,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  return { id: data.id }
}

/** Set one cell. For a `person` property, validates the user id(s) are members. */
export async function updateCell(
  rowId: string,
  propertyId: string,
  value: CellValue,
): Promise<Result> {
  const membership = await requireMember()
  const supabase = await createClient()

  // Resolve the property (authoritative type + owning database, scoped to ws).
  const { data: prop } = await supabase
    .from('database_properties')
    .select('type, database_id')
    .eq('id', propertyId)
    .eq('workspace_id', membership.workspaceId)
    .maybeSingle()
  if (!prop) return { error: 'Property not found.' }

  // Confirm the row is in the same database (and thus the same workspace).
  const { data: row } = await supabase
    .from('database_rows')
    .select('id')
    .eq('id', rowId)
    .eq('database_id', prop.database_id)
    .eq('workspace_id', membership.workspaceId)
    .maybeSingle()
  if (!row) return { error: 'Row not found.' }

  if (prop.type === 'person') {
    const ids = Array.isArray(value) ? value : value ? [String(value)] : []
    if (await invalidPersonIds(supabase, membership.workspaceId, ids)) {
      return { error: 'Person must be a workspace member.' }
    }
  }

  // Empty values clear the key; jsonb_set otherwise (targeted, no clobber).
  const isEmpty =
    value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
  const { error } = await supabase.rpc('db_set_cell', {
    p_row_id: rowId,
    p_key: propertyId,
    p_value: isEmpty ? null : (value as never),
  })
  return error ? { error: error.message } : {}
}

/** Reorder a row within a view (drag in a board column / table row reorder). */
export async function moveRowInView(
  viewId: string,
  rowId: string,
  sort: number,
): Promise<Result> {
  await requireMember()
  const supabase = await createClient()
  const { error } = await supabase.rpc('db_set_view_order', {
    p_row_id: rowId,
    p_view_id: viewId,
    p_sort: sort,
  })
  return error ? { error: error.message } : {}
}

/** Board cross-column drop: set the grouping cell value AND the view order in one
 *  partial write. `value` null clears the group ("No <property>" column). */
export async function setRowGroup(
  viewId: string,
  rowId: string,
  propertyId: string,
  value: string | null,
  sort: number,
): Promise<Result> {
  const membership = await requireMember()
  const supabase = await createClient()

  // The server action is the real authz boundary, not the board UI: the grouping
  // key must be a real status/select column in this workspace (never a person/title
  // column, and never an arbitrary jsonb key), and the row must belong to it.
  const { data: prop } = await supabase
    .from('database_properties')
    .select('type, database_id')
    .eq('id', propertyId)
    .eq('workspace_id', membership.workspaceId)
    .maybeSingle()
  if (!prop) return { error: 'Property not found.' }
  if (prop.type !== 'status' && prop.type !== 'select') {
    return { error: 'Cannot group by this property.' }
  }
  const { data: row } = await supabase
    .from('database_rows')
    .select('id')
    .eq('id', rowId)
    .eq('database_id', prop.database_id)
    .eq('workspace_id', membership.workspaceId)
    .maybeSingle()
  if (!row) return { error: 'Row not found.' }

  const { error } = await supabase.rpc('db_set_row_group', {
    p_row_id: rowId,
    p_group_key: propertyId,
    p_value: value === null ? null : (value as never),
    p_view_id: viewId,
    p_sort: sort,
  })
  return error ? { error: error.message } : {}
}

/** Delete a record (member hard delete — no row-level trash). */
export async function deleteDatabaseRow(rowId: string): Promise<Result> {
  const membership = await requireMember()
  const supabase = await createClient()
  const { error } = await supabase
    .from('database_rows')
    .delete()
    .eq('id', rowId)
    .eq('workspace_id', membership.workspaceId)
  return error ? { error: error.message } : {}
}
