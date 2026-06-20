// Server/client data loaders for whiteboards (envelope only — the canvas body
// loads through the Yjs layer). Both run against an RLS-gated Supabase client
// (server client in RSC, browser client for the realtime refetch), so they need
// no auth logic of their own. Mirrors lib/databases/load-database.ts.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { WhiteboardListItem, WhiteboardMeta } from './types'

type Supabase = SupabaseClient<Database>

/** Load a single whiteboard's envelope. Returns null if it doesn't exist / is
 *  trashed / isn't readable. */
export async function loadWhiteboard(
  client: Supabase,
  workspaceId: string,
  whiteboardId: string,
): Promise<WhiteboardMeta | null> {
  const { data } = await client
    .from('whiteboards')
    .select('id, project_id, title, icon')
    .eq('workspace_id', workspaceId)
    .eq('id', whiteboardId)
    .is('trashed_at', null)
    .maybeSingle()
  if (!data) return null
  return { id: data.id, projectId: data.project_id, title: data.title, icon: data.icon }
}

/** Live (non-trashed) whiteboards of one project, in display order. Used by the
 *  sidebar tree + the project Docs home + the embed picker. */
export async function loadProjectWhiteboards(
  client: Supabase,
  workspaceId: string,
  projectId: string,
): Promise<WhiteboardListItem[]> {
  const { data } = await client
    .from('whiteboards')
    .select('id, title, icon, sort, trashed_at')
    .eq('workspace_id', workspaceId)
    .eq('project_id', projectId)
    .is('trashed_at', null)
    .order('sort', { ascending: true })
  return (data ?? []).map((w) => ({
    id: w.id,
    title: w.title,
    icon: w.icon,
    sort: w.sort,
    trashedAt: w.trashed_at,
  }))
}

/** Trashed whiteboards of one project, most-recently trashed first. */
export async function loadTrashedWhiteboards(
  client: Supabase,
  workspaceId: string,
  projectId: string,
): Promise<WhiteboardListItem[]> {
  const { data } = await client
    .from('whiteboards')
    .select('id, title, icon, sort, trashed_at')
    .eq('workspace_id', workspaceId)
    .eq('project_id', projectId)
    .not('trashed_at', 'is', null)
    .order('trashed_at', { ascending: false })
  return (data ?? []).map((w) => ({
    id: w.id,
    title: w.title,
    icon: w.icon,
    sort: w.sort,
    trashedAt: w.trashed_at,
  }))
}
