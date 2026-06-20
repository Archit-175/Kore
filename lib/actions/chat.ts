'use server'

import { createClient } from '@/lib/supabase/server'
import { requireMember, verifySession } from '@/lib/dal'
import type { ChatAttachment } from '@/lib/chat/types'

/**
 * Team chat Server Actions — the real authz boundary (DAL-gated; RLS double-
 * checks: messages are author-scoped for write, owner may delete any). Same
 * conventions as the other action files: stamp workspace_id/author_id from the
 * session (never client input), re-resolve ids server-side (IDOR), return
 * { error }, NO revalidatePath (ChatView owns its realtime + optimistic state).
 */

type Result = { error?: string }
type CreateResult = { error?: string; id?: string }

type Supabase = Awaited<ReturnType<typeof createClient>>

async function activeMemberIds(supabase: Supabase, workspaceId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('memberships')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
  return new Set((data ?? []).map((m) => m.user_id).filter((id): id is string => Boolean(id)))
}

/** Drop any attachment whose path isn't under this workspace's storage prefix
 *  (the storage RLS keys on segment 1 = workspace_id); cap the count. */
function sanitizeAttachments(raw: ChatAttachment[] | undefined, workspaceId: string): ChatAttachment[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((a) => a && typeof a.path === 'string' && a.path.startsWith(`${workspaceId}/`))
    .slice(0, 6)
    .map((a) => ({
      path: a.path,
      mime: String(a.mime ?? ''),
      name: String(a.name ?? 'file').slice(0, 200),
      size: Number.isFinite(a.size) ? a.size : 0,
    }))
}

export async function sendMessage(input: {
  body: string
  parentMessageId?: string | null
  mentions?: string[]
  attachments?: ChatAttachment[]
}): Promise<CreateResult> {
  const membership = await requireMember()
  const user = await verifySession()
  const supabase = await createClient()

  const body = (input.body ?? '').trim()
  const attachments = sanitizeAttachments(input.attachments, membership.workspaceId)
  if (!body && attachments.length === 0) return { error: 'Message is empty.' }

  // Reply target must belong to this workspace.
  let parentId: string | null = null
  if (input.parentMessageId) {
    const { data: parent } = await supabase
      .from('messages')
      .select('id')
      .eq('id', input.parentMessageId)
      .eq('workspace_id', membership.workspaceId)
      .maybeSingle()
    if (!parent) return { error: 'Reply target not found.' }
    parentId = parent.id
  }

  // Mentions must be active members.
  let mentions: string[] = []
  if (input.mentions?.length) {
    const valid = await activeMemberIds(supabase, membership.workspaceId)
    mentions = [...new Set(input.mentions)].filter((id) => valid.has(id))
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      workspace_id: membership.workspaceId,
      author_id: user.id,
      body,
      parent_message_id: parentId,
      mentions,
      attachments: attachments as never,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  return { id: data.id }
}

export async function editMessage(id: string, body: string): Promise<Result> {
  await requireMember()
  const supabase = await createClient()
  const trimmed = (body ?? '').trim()
  if (!trimmed) return { error: 'Message cannot be empty.' }
  // RLS messages_update is author-only (the owner may delete but not edit).
  const { error } = await supabase
    .from('messages')
    .update({ body: trimmed, edited_at: new Date().toISOString() })
    .eq('id', id)
  return error ? { error: error.message } : {}
}

export async function deleteMessage(id: string): Promise<Result> {
  await requireMember()
  const supabase = await createClient()
  // RLS allows author OR workspace owner; a non-author non-owner deletes 0 rows.
  const { error } = await supabase.from('messages').delete().eq('id', id)
  return error ? { error: error.message } : {}
}

export async function toggleReaction(messageId: string, emoji: string): Promise<Result> {
  const membership = await requireMember()
  const user = await verifySession()
  const supabase = await createClient()

  // Message must belong to this workspace (IDOR).
  const { data: msg } = await supabase
    .from('messages')
    .select('id')
    .eq('id', messageId)
    .eq('workspace_id', membership.workspaceId)
    .maybeSingle()
  if (!msg) return { error: 'Message not found.' }

  const e = (emoji ?? '').slice(0, 16)
  if (!e) return { error: 'Invalid reaction.' }

  const { error: insErr } = await supabase.from('message_reactions').insert({
    workspace_id: membership.workspaceId,
    message_id: messageId,
    user_id: user.id,
    emoji: e,
  })
  if (insErr) {
    // Already reacted (unique violation) → toggle OFF.
    if (insErr.code === '23505') {
      const { error: delErr } = await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', user.id)
        .eq('emoji', e)
      return delErr ? { error: delErr.message } : {}
    }
    return { error: insErr.message }
  }
  return {}
}

export async function markChannelRead(lastMessageId: string): Promise<Result> {
  const membership = await requireMember()
  const user = await verifySession()
  const supabase = await createClient()
  // The read cursor must point at a message in THIS workspace (IDOR: the
  // last_read_message_id FK references messages globally).
  const { data: msg } = await supabase
    .from('messages')
    .select('id')
    .eq('id', lastMessageId)
    .eq('workspace_id', membership.workspaceId)
    .maybeSingle()
  if (!msg) return { error: 'Message not found.' }
  const { error } = await supabase.from('message_reads').upsert(
    {
      user_id: user.id,
      workspace_id: membership.workspaceId,
      last_read_message_id: lastMessageId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,workspace_id' },
  )
  return error ? { error: error.message } : {}
}
