'use server'

import { createClient } from '@/lib/supabase/server'
import { requireMember, requireOwner, verifySession } from '@/lib/dal'
import { logActivity, type ActivityAction } from '@/lib/actions/activity'

/**
 * Whiteboards (Phase 5) Server Actions — the real authz boundary (DAL-gated; RLS
 * double-checks). Same conventions as lib/actions/databases.ts: stamp
 * workspace_id from membership (never client input) + created_by from the
 * session, return { error } on failure, and SKIP revalidatePath (WhiteboardView
 * + sidebar tree own their realtime + optimistic state).
 *
 * Only the ENVELOPE lives here (title/icon/sort/trash). The canvas body is the
 * Yjs doc (doc_type='whiteboard'), synced/persisted by KoreYjsProvider — there is
 * no row data to seed, so a new whiteboard starts as an empty canvas.
 */

type Result = { error?: string }
type CreateResult = { error?: string; id?: string }
type Supabase = Awaited<ReturnType<typeof createClient>>

/** Snapshot a whiteboard's project_id + title and log a coarse activity event.
 *  Call AFTER rename/trash/restore (row still exists) or BEFORE permanent delete. */
async function logWhiteboardEvent(
  supabase: Supabase,
  workspaceId: string,
  actorId: string,
  id: string,
  action: ActivityAction,
): Promise<void> {
  const { data } = await supabase
    .from('whiteboards')
    .select('project_id, title')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (!data) return
  await logActivity(supabase, {
    workspaceId,
    projectId: data.project_id,
    actorId,
    action,
    targetType: 'whiteboard',
    targetId: id,
    targetTitle: data.title,
  })
}

/** Next fractional append rank = (max existing sort in the project) + 1. */
async function nextSort(
  supabase: Supabase,
  workspaceId: string,
  projectId: string,
): Promise<number> {
  const { data } = await supabase
    .from('whiteboards')
    .select('sort')
    .eq('workspace_id', workspaceId)
    .eq('project_id', projectId)
    .order('sort', { ascending: false })
    .limit(1)
  return data && data[0] ? data[0].sort + 1 : 0
}

export async function createWhiteboard(input: {
  projectId: string
  title?: string
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

  const sort = await nextSort(supabase, membership.workspaceId, input.projectId)

  const { data, error } = await supabase
    .from('whiteboards')
    .insert({
      workspace_id: membership.workspaceId,
      project_id: input.projectId,
      title: input.title ?? '',
      sort,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  await logActivity(supabase, {
    workspaceId: membership.workspaceId,
    projectId: input.projectId,
    actorId: user.id,
    action: 'created',
    targetType: 'whiteboard',
    targetId: data.id,
    targetTitle: input.title || 'Untitled',
  })
  return { id: data.id }
}

export async function renameWhiteboard(id: string, title: string): Promise<Result> {
  const membership = await requireMember()
  const user = await verifySession()
  const supabase = await createClient()
  const { error } = await supabase
    .from('whiteboards')
    .update({ title: title ?? '' })
    .eq('id', id)
    .eq('workspace_id', membership.workspaceId)
  if (error) return { error: error.message }
  await logWhiteboardEvent(supabase, membership.workspaceId, user.id, id, 'renamed')
  return {}
}

export async function updateWhiteboardIcon(id: string, icon: string | null): Promise<Result> {
  const membership = await requireMember()
  const supabase = await createClient()
  const { error } = await supabase
    .from('whiteboards')
    .update({ icon })
    .eq('id', id)
    .eq('workspace_id', membership.workspaceId)
  return error ? { error: error.message } : {}
}

export async function reorderWhiteboard(id: string, sort: number): Promise<Result> {
  const membership = await requireMember()
  const supabase = await createClient()
  const { error } = await supabase
    .from('whiteboards')
    .update({ sort })
    .eq('id', id)
    .eq('workspace_id', membership.workspaceId)
  return error ? { error: error.message } : {}
}

export async function trashWhiteboard(id: string): Promise<Result> {
  const membership = await requireMember()
  const user = await verifySession()
  const supabase = await createClient()
  const { error } = await supabase
    .from('whiteboards')
    .update({ trashed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('workspace_id', membership.workspaceId)
  if (error) return { error: error.message }
  await logWhiteboardEvent(supabase, membership.workspaceId, user.id, id, 'trashed')
  return {}
}

export async function restoreWhiteboard(id: string): Promise<Result> {
  const membership = await requireMember()
  const user = await verifySession()
  const supabase = await createClient()
  const { error } = await supabase
    .from('whiteboards')
    .update({ trashed_at: null })
    .eq('id', id)
    .eq('workspace_id', membership.workspaceId)
  if (error) return { error: error.message }
  await logWhiteboardEvent(supabase, membership.workspaceId, user.id, id, 'restored')
  return {}
}

/** Permanent delete — owner-only. The DB AFTER DELETE trigger purges the
 *  matching yjs_documents snapshot. */
export async function deleteWhiteboardPermanent(id: string): Promise<Result> {
  const membership = await requireOwner()
  const user = await verifySession()
  const supabase = await createClient()
  // Snapshot the title BEFORE the row is gone.
  await logWhiteboardEvent(supabase, membership.workspaceId, user.id, id, 'deleted')
  const { error } = await supabase
    .from('whiteboards')
    .delete()
    .eq('id', id)
    .eq('workspace_id', membership.workspaceId)
  return error ? { error: error.message } : {}
}

/** Empty a project's whiteboard trash — owner-only. */
export async function emptyWhiteboardTrash(projectId: string): Promise<Result> {
  await requireOwner()
  const supabase = await createClient()
  const { error } = await supabase.rpc('empty_whiteboard_trash', { p_project_id: projectId })
  return error ? { error: error.message } : {}
}
