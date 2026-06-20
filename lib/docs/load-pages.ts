// Server/client data loaders for pages + backlinks. Both run against an
// RLS-gated Supabase client (server client in RSC, browser client for the
// realtime refetch — same pattern as lib/notes/load-board.ts), so they need no
// auth logic of their own. Backlinks use two simple queries rather than an embed
// (database.ts has empty Relationships, and there are two FKs pages→page_links).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { Backlink, PageNode } from './types'

type Supabase = SupabaseClient<Database>

const PAGE_COLUMNS =
  'id, project_id, parent_page_id, title, icon, sort, trashed_at, created_at, updated_at'

type PageRow = {
  id: string
  project_id: string
  parent_page_id: string | null
  title: string
  icon: string | null
  sort: number
  trashed_at: string | null
  created_at: string
  updated_at: string
}

function rowToNode(r: PageRow): PageNode {
  return {
    id: r.id,
    projectId: r.project_id,
    parentPageId: r.parent_page_id,
    title: r.title,
    icon: r.icon,
    sort: r.sort,
    trashedAt: r.trashed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** Live (non-trashed) pages of one project (flat; nest with buildTree). */
export async function loadProjectPages(
  client: Supabase,
  workspaceId: string,
  projectId: string,
): Promise<PageNode[]> {
  const { data } = await client
    .from('pages')
    .select(PAGE_COLUMNS)
    .eq('workspace_id', workspaceId)
    .eq('project_id', projectId)
    .is('trashed_at', null)
    .order('sort', { ascending: true })
  return (data ?? []).map(rowToNode)
}

/** Live (non-trashed) pages across the workspace — resolves live mention titles. */
export async function loadWorkspacePages(
  client: Supabase,
  workspaceId: string,
): Promise<PageNode[]> {
  const { data } = await client
    .from('pages')
    .select(PAGE_COLUMNS)
    .eq('workspace_id', workspaceId)
    .is('trashed_at', null)
    .order('sort', { ascending: true })
  return (data ?? []).map(rowToNode)
}

/** Trashed pages of one project, most-recently trashed first. */
export async function loadTrashedPages(
  client: Supabase,
  workspaceId: string,
  projectId: string,
): Promise<PageNode[]> {
  const { data } = await client
    .from('pages')
    .select(PAGE_COLUMNS)
    .eq('workspace_id', workspaceId)
    .eq('project_id', projectId)
    .not('trashed_at', 'is', null)
    .order('trashed_at', { ascending: false })
  return (data ?? []).map(rowToNode)
}

/** Pages that @-mention `pageId` (its "Linked references"). */
export async function loadBacklinks(client: Supabase, pageId: string): Promise<Backlink[]> {
  const { data: links } = await client
    .from('page_links')
    .select('source_page_id')
    .eq('target_page_id', pageId)
  const sourceIds = [...new Set((links ?? []).map((l) => l.source_page_id))]
  if (sourceIds.length === 0) return []

  const { data: pages } = await client
    .from('pages')
    .select('id, title, project_id')
    .in('id', sourceIds)
    .is('trashed_at', null)
  return (pages ?? []).map((p) => ({
    sourcePageId: p.id,
    title: p.title,
    projectId: p.project_id,
  }))
}
