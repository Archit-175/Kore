// Server/client data loaders for databases. Both run against an RLS-gated
// Supabase client (server client in RSC, browser client for the realtime
// refetch — same pattern as lib/notes/load-board.ts), so they need no auth logic
// of their own.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { normalizeOptionColor } from './colors'
import type {
  CellValue,
  DatabaseAggregate,
  DatabaseListItem,
  DbMember,
  DbProperty,
  DbRow,
  DbView,
  PropertyType,
  SelectOption,
} from './types'
import { PROPERTY_TYPES } from './types'

type Supabase = SupabaseClient<Database>

function normalizeType(t: unknown): PropertyType {
  return (PROPERTY_TYPES as readonly string[]).includes(t as string)
    ? (t as PropertyType)
    : 'text'
}

function parseOptions(raw: unknown): SelectOption[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((o): o is Record<string, unknown> => typeof o === 'object' && o !== null)
    .map((o) => ({
      id: String(o.id ?? ''),
      name: String(o.name ?? ''),
      color: normalizeOptionColor(o.color),
    }))
    .filter((o) => o.id)
}

function parseData(raw: unknown): Record<string, CellValue> {
  if (typeof raw !== 'object' || raw === null) return {}
  return raw as Record<string, CellValue>
}

function parseViewOrder(raw: unknown): Record<string, number> {
  if (typeof raw !== 'object' || raw === null) return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'number') out[k] = v
  }
  return out
}

/** Load a single database's full aggregate (envelope + properties + views + rows).
 *  Returns null if the database doesn't exist / is trashed / isn't readable. */
export async function loadDatabase(
  client: Supabase,
  workspaceId: string,
  databaseId: string,
): Promise<DatabaseAggregate | null> {
  const [dbRes, propsRes, viewsRes, rowsRes] = await Promise.all([
    client
      .from('databases')
      .select('id, project_id, name, icon')
      .eq('workspace_id', workspaceId)
      .eq('id', databaseId)
      .is('trashed_at', null)
      .maybeSingle(),
    client
      .from('database_properties')
      .select('id, name, type, options, sort')
      .eq('workspace_id', workspaceId)
      .eq('database_id', databaseId)
      .order('sort', { ascending: true }),
    client
      .from('database_views')
      .select('id, name, type, group_property_id, sort, config')
      .eq('workspace_id', workspaceId)
      .eq('database_id', databaseId)
      .order('sort', { ascending: true }),
    client
      .from('database_rows')
      .select('id, data, sort, view_order, created_at, updated_at')
      .eq('workspace_id', workspaceId)
      .eq('database_id', databaseId)
      .order('sort', { ascending: true }),
  ])

  if (!dbRes.data) return null

  const properties: DbProperty[] = (propsRes.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    type: normalizeType(p.type),
    options: parseOptions(p.options),
    sort: p.sort,
  }))

  const views: DbView[] = (viewsRes.data ?? []).map((v) => ({
    id: v.id,
    name: v.name,
    type: v.type === 'board' ? 'board' : 'table',
    groupPropertyId: v.group_property_id,
    sort: v.sort,
    config: (typeof v.config === 'object' && v.config !== null ? v.config : {}) as Record<
      string,
      unknown
    >,
  }))

  const rows: DbRow[] = (rowsRes.data ?? []).map((r) => ({
    id: r.id,
    data: parseData(r.data),
    sort: r.sort,
    viewOrder: parseViewOrder(r.view_order),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))

  return {
    database: {
      id: dbRes.data.id,
      projectId: dbRes.data.project_id,
      name: dbRes.data.name,
      icon: dbRes.data.icon,
    },
    properties,
    views,
    rows,
  }
}

/** Live (non-trashed) databases of one project, in display order, with a row
 *  count each. Used by the sidebar tree + the project Docs home. */
export async function loadProjectDatabases(
  client: Supabase,
  workspaceId: string,
  projectId: string,
): Promise<DatabaseListItem[]> {
  const { data: dbs } = await client
    .from('databases')
    .select('id, name, icon, sort, trashed_at')
    .eq('workspace_id', workspaceId)
    .eq('project_id', projectId)
    .is('trashed_at', null)
    .order('sort', { ascending: true })

  const list = dbs ?? []
  if (list.length === 0) return []

  // One query for all row ids in this project's databases, then count in JS.
  const { data: rows } = await client
    .from('database_rows')
    .select('database_id')
    .eq('workspace_id', workspaceId)
    .in(
      'database_id',
      list.map((d) => d.id),
    )
  const counts = new Map<string, number>()
  for (const r of rows ?? []) counts.set(r.database_id, (counts.get(r.database_id) ?? 0) + 1)

  return list.map((d) => ({
    id: d.id,
    name: d.name,
    icon: d.icon,
    sort: d.sort,
    trashedAt: d.trashed_at,
    rowCount: counts.get(d.id) ?? 0,
  }))
}

/** Active workspace members (id + display name + avatar) for `person` cells.
 *  Resolves memberships → profiles (the members-page pattern). */
export async function loadWorkspaceMembers(
  client: Supabase,
  workspaceId: string,
): Promise<DbMember[]> {
  const { data: ms } = await client
    .from('memberships')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
  const ids = (ms ?? [])
    .map((m) => m.user_id)
    .filter((id): id is string => Boolean(id))
  if (ids.length === 0) return []

  const { data: profs } = await client
    .from('profiles')
    .select('id, full_name, email, avatar_url')
    .in('id', ids)
  return (profs ?? []).map((p) => ({
    id: p.id,
    name: p.full_name || p.email || 'Member',
    avatarUrl: p.avatar_url,
  }))
}

/** Trashed databases of one project, most-recently trashed first. */
export async function loadTrashedDatabases(
  client: Supabase,
  workspaceId: string,
  projectId: string,
): Promise<DatabaseListItem[]> {
  const { data } = await client
    .from('databases')
    .select('id, name, icon, sort, trashed_at')
    .eq('workspace_id', workspaceId)
    .eq('project_id', projectId)
    .not('trashed_at', 'is', null)
    .order('trashed_at', { ascending: false })
  return (data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    icon: d.icon,
    sort: d.sort,
    trashedAt: d.trashed_at,
    rowCount: 0,
  }))
}
