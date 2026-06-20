'use server'

import { createClient } from '@/lib/supabase/server'
import { requireMember, verifySession } from '@/lib/dal'
import type { CommentTarget } from '@/lib/comments/types'

/**
 * Comments Server Actions — DAL-gated; RLS double-checks (author-scoped write,
 * owner may delete any). Stamp workspace_id/author_id server-side, re-resolve the
 * target server-side (IDOR), return { error }, NO revalidatePath (CommentsPanel
 * owns its realtime + optimistic refetch).
 */

type Result = { error?: string }
type CreateResult = { error?: string; id?: string }
type Supabase = Awaited<ReturnType<typeof createClient>>

async function targetInWorkspace(
  supabase: Supabase,
  workspaceId: string,
  targetType: CommentTarget,
  targetId: string,
): Promise<boolean> {
  const table = targetType === 'page' ? 'pages' : 'notes'
  const { data } = await supabase
    .from(table)
    .select('id')
    .eq('id', targetId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  return Boolean(data)
}

async function validMentions(
  supabase: Supabase,
  workspaceId: string,
  ids: string[] | undefined,
): Promise<string[]> {
  if (!ids?.length) return []
  const { data } = await supabase
    .from('memberships')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
  const valid = new Set((data ?? []).map((m) => m.user_id).filter((x): x is string => Boolean(x)))
  return [...new Set(ids)].filter((id) => valid.has(id))
}

export async function addComment(input: {
  targetType: CommentTarget
  targetId: string
  body: string
  mentions?: string[]
}): Promise<CreateResult> {
  const membership = await requireMember()
  const user = await verifySession()
  const supabase = await createClient()

  const body = (input.body ?? '').trim()
  if (!body) return { error: 'Comment is empty.' }
  if (input.targetType !== 'page' && input.targetType !== 'note') {
    return { error: 'Invalid comment target.' }
  }
  if (!(await targetInWorkspace(supabase, membership.workspaceId, input.targetType, input.targetId))) {
    return { error: 'Comment target not found.' }
  }
  const mentions = await validMentions(supabase, membership.workspaceId, input.mentions)

  const { data, error } = await supabase
    .from('comments')
    .insert({
      workspace_id: membership.workspaceId,
      target_type: input.targetType,
      target_id: input.targetId,
      author_id: user.id,
      body,
      mentions,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  return { id: data.id }
}

export async function editComment(id: string, body: string): Promise<Result> {
  await requireMember()
  const supabase = await createClient()
  const trimmed = (body ?? '').trim()
  if (!trimmed) return { error: 'Comment cannot be empty.' }
  // RLS comments_update is author-only.
  const { error } = await supabase.from('comments').update({ body: trimmed }).eq('id', id)
  return error ? { error: error.message } : {}
}

export async function deleteComment(id: string): Promise<Result> {
  await requireMember()
  const supabase = await createClient()
  // RLS allows author OR workspace owner; others delete 0 rows.
  const { error } = await supabase.from('comments').delete().eq('id', id)
  return error ? { error: error.message } : {}
}
