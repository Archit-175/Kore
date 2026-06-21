'use server'

import { createClient } from '@/lib/supabase/server'
import { canAdminProject, requireMember, verifySession } from '@/lib/dal'
import { logActivity, type ActivityAction } from '@/lib/actions/activity'

type Supabase = Awaited<ReturnType<typeof createClient>>

/** Snapshot a page's project_id + title and log a coarse activity event. Call
 *  AFTER rename/trash/restore (row still exists) or BEFORE permanent delete. */
async function logPageEvent(
  supabase: Supabase,
  workspaceId: string,
  actorId: string,
  id: string,
  action: ActivityAction,
): Promise<void> {
  const { data } = await supabase
    .from('pages')
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
    targetType: 'page',
    targetId: id,
    targetTitle: data.title,
  })
}

/**
 * Pages (Docs) Server Actions — the real authz boundary (DAL-gated; RLS double-
 * checks). Same conventions as lib/actions/notes.ts: stamp workspace_id from
 * membership (never client input) + created_by from the session, return
 * { error } on failure.
 *
 * NO revalidatePath: the sidebar page tree + backlinks panel are client
 * components that own their own realtime (Postgres Changes) + optimistic state,
 * so revalidating the shell on every keystroke would fight the optimistic UI.
 *
 * The page BODY is not touched here — it is Yjs, persisted by lib/yjs/provider.ts
 * via the save_yjs_snapshot RPC. These actions only mutate the relational
 * envelope (tree + backlink graph).
 */

type Result = { error?: string }
type CreateResult = { error?: string; id?: string }

// ----------------------------------------------------------------------------
// Pages (tree)
// ----------------------------------------------------------------------------
export async function createPage(input: {
  projectId: string
  parentPageId?: string | null
  title?: string
}): Promise<CreateResult> {
  const membership = await requireMember()
  const user = await verifySession()
  const supabase = await createClient()

  // Project must belong to this workspace (project_id is NOT NULL + drives
  // routing, so guard it — unlike a note's optional project_id).
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', input.projectId)
    .eq('workspace_id', membership.workspaceId)
    .maybeSingle()
  if (!project) return { error: 'Project not found.' }

  const parentPageId = input.parentPageId ?? null

  // Append after the last sibling (sort = max sibling sort + 1).
  let q = supabase
    .from('pages')
    .select('sort')
    .eq('workspace_id', membership.workspaceId)
    .eq('project_id', input.projectId)
    .order('sort', { ascending: false })
    .limit(1)
  q = parentPageId === null ? q.is('parent_page_id', null) : q.eq('parent_page_id', parentPageId)
  const { data: lastSibling } = await q
  const sort = lastSibling && lastSibling[0] ? lastSibling[0].sort + 1 : 0

  const { data, error } = await supabase
    .from('pages')
    .insert({
      workspace_id: membership.workspaceId,
      project_id: input.projectId,
      parent_page_id: parentPageId,
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
    targetType: 'page',
    targetId: data.id,
    targetTitle: input.title || 'Untitled',
  })
  return { id: data.id }
}

export async function renamePage(id: string, title: string): Promise<Result> {
  const membership = await requireMember()
  const user = await verifySession()
  const supabase = await createClient()
  const { error } = await supabase.from('pages').update({ title: title ?? '' }).eq('id', id)
  if (error) return { error: error.message }
  await logPageEvent(supabase, membership.workspaceId, user.id, id, 'renamed')
  return {}
}

/** Mirror the page's plain-text body into pages.search_text for global search.
 *  Called debounced from the editor onChange (alongside syncPageLinks). The body
 *  itself is opaque Yjs bytea, so this denormalized column is what ⌘K searches. */
export async function syncPageSearchText(pageId: string, text: string): Promise<Result> {
  const membership = await requireMember()
  const supabase = await createClient()
  const { error } = await supabase
    .from('pages')
    .update({ search_text: (text ?? '').slice(0, 20000) })
    .eq('id', pageId)
    .eq('workspace_id', membership.workspaceId)
  return error ? { error: error.message } : {}
}

export async function updatePageIcon(id: string, icon: string | null): Promise<Result> {
  await requireMember()
  const supabase = await createClient()
  const { error } = await supabase.from('pages').update({ icon }).eq('id', id)
  return error ? { error: error.message } : {}
}

/** Reorder and/or reparent a page. Cycle-guarded: a page cannot be moved into
 *  its own subtree. `sort` is the caller's computed midpoint rank. */
export async function movePage(
  id: string,
  target: { parentPageId: string | null; sort: number },
): Promise<Result> {
  await requireMember()
  const supabase = await createClient()

  const parentPageId = target.parentPageId ?? null
  if (parentPageId !== null) {
    if (parentPageId === id) return { error: 'A page cannot be its own parent.' }
    const { data: subtree, error: subErr } = await supabase.rpc('page_subtree_ids', { p_root: id })
    if (subErr) return { error: subErr.message }
    if ((subtree ?? []).some((r) => r.id === parentPageId)) {
      return { error: 'Cannot move a page into its own subtree.' }
    }
  }

  const { error } = await supabase
    .from('pages')
    .update({ parent_page_id: parentPageId, sort: target.sort })
    .eq('id', id)
  return error ? { error: error.message } : {}
}

/** Collect a page + its whole subtree (via the SQL recursive helper). Used by
 *  trash/restore so an action covers the page and everything nested under it. */
async function subtreeIdsOf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<string[]> {
  const { data } = await supabase.rpc('page_subtree_ids', { p_root: id })
  const ids = (data ?? []).map((r) => r.id)
  return ids.length > 0 ? ids : [id]
}

/** Move a page + its subtree to the trash (member-allowed, reversible). Just an
 *  UPDATE, so it rides the same RLS as any edit. The pages realtime feed drops
 *  the trashed rows from every open tree. */
export async function trashPage(id: string): Promise<Result> {
  const membership = await requireMember()
  const user = await verifySession()
  const supabase = await createClient()
  const ids = await subtreeIdsOf(supabase, id)
  const { error } = await supabase
    .from('pages')
    .update({ trashed_at: new Date().toISOString() })
    .in('id', ids)
  if (error) return { error: error.message }
  await logPageEvent(supabase, membership.workspaceId, user.id, id, 'trashed')
  return {}
}

/** Restore a trashed page + its subtree (member-allowed). */
export async function restorePage(id: string): Promise<Result> {
  const membership = await requireMember()
  const user = await verifySession()
  const supabase = await createClient()
  const ids = await subtreeIdsOf(supabase, id)
  const { error } = await supabase.from('pages').update({ trashed_at: null }).in('id', ids)
  if (error) return { error: error.message }
  await logPageEvent(supabase, membership.workspaceId, user.id, id, 'restored')
  return {}
}

/** Permanent delete — owner-only (mirrors projects_delete / deleteNotePermanent).
 *  FK cascade removes the subtree + page_links; the pages_purge_yjs trigger
 *  removes each page's Yjs snapshot. */
export async function deletePagePermanent(id: string): Promise<Result> {
  const membership = await requireMember()
  const user = await verifySession()
  const supabase = await createClient()
  const { data: page } = await supabase.from('pages').select('project_id').eq('id', id).maybeSingle()
  if (!page) return { error: 'Page not found.' }
  if (!(await canAdminProject(page.project_id)))
    return { error: 'Only team members can permanently delete this.' }
  // Snapshot the title BEFORE the row is gone.
  await logPageEvent(supabase, membership.workspaceId, user.id, id, 'deleted')
  const { error } = await supabase.from('pages').delete().eq('id', id)
  return error ? { error: error.message } : {}
}

/** Empty a project's trash — team admins (owner or team member). Hard-deletes
 *  every trashed page in the project (cascade + snapshot purge follow). */
export async function emptyProjectTrash(projectId: string): Promise<Result> {
  const membership = await requireMember()
  if (!(await canAdminProject(projectId)))
    return { error: 'Only team members can empty the trash.' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('pages')
    .delete()
    .eq('workspace_id', membership.workspaceId)
    .eq('project_id', projectId)
    .not('trashed_at', 'is', null)
  return error ? { error: error.message } : {}
}

// ----------------------------------------------------------------------------
// Backlinks (derived page_links graph)
// ----------------------------------------------------------------------------
/** Replace `sourcePageId`'s outgoing links with the current set of @-mentioned
 *  target pages. Called debounced from the editor's onChange. Delete-all-then-
 *  insert keeps it idempotent. */
export async function syncPageLinks(
  sourcePageId: string,
  targetPageIds: string[],
): Promise<Result> {
  const membership = await requireMember()
  const supabase = await createClient()

  const { error: delErr } = await supabase
    .from('page_links')
    .delete()
    .eq('source_page_id', sourcePageId)
  if (delErr) return { error: delErr.message }

  const unique = [...new Set(targetPageIds)].filter((t) => t && t !== sourcePageId)
  if (unique.length === 0) return {}

  const { error } = await supabase.from('page_links').insert(
    unique.map((target) => ({
      source_page_id: sourcePageId,
      target_page_id: target,
      workspace_id: membership.workspaceId,
    })),
  )
  return error ? { error: error.message } : {}
}
