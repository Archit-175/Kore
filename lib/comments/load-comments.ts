// Loader for comments on a page/note. RLS-gated client (server in RSC, browser
// for the realtime refetch) — scopes rows to workspace members automatically.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { CommentItem, CommentTarget } from './types'

type Supabase = SupabaseClient<Database>

export async function loadComments(
  client: Supabase,
  workspaceId: string,
  targetType: CommentTarget,
  targetId: string,
): Promise<CommentItem[]> {
  const { data: rows } = await client
    .from('comments')
    .select('id, author_id, body, mentions, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .order('created_at', { ascending: true })

  const list = rows ?? []
  const authorIds = [...new Set(list.map((r) => r.author_id))]
  const names = new Map<string, { name: string; avatarUrl: string | null }>()
  if (authorIds.length) {
    const { data: profs } = await client
      .from('profiles')
      .select('id, full_name, email, avatar_url')
      .in('id', authorIds)
    for (const p of profs ?? []) {
      names.set(p.id, { name: p.full_name || p.email || 'Member', avatarUrl: p.avatar_url })
    }
  }

  return list.map((r) => ({
    id: r.id,
    authorId: r.author_id,
    authorName: names.get(r.author_id)?.name ?? 'Member',
    authorAvatarUrl: names.get(r.author_id)?.avatarUrl ?? null,
    body: r.body,
    mentions: (r.mentions ?? []) as string[],
    createdAt: r.created_at,
    edited: r.updated_at !== r.created_at,
  }))
}
