// Loader for the per-project activity feed. RLS-gated client (server in RSC,
// browser for the realtime refetch). Members read every project's feed.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Supabase = SupabaseClient<Database>

export type ActivityEntry = {
  id: string
  actorName: string
  action: string
  targetType: string
  targetTitle: string | null
  createdAt: string
}

export async function loadProjectActivity(
  client: Supabase,
  workspaceId: string,
  projectId: string,
  limit = 25,
): Promise<ActivityEntry[]> {
  const { data: rows } = await client
    .from('activity_log')
    .select('id, actor_id, action, target_type, target_title, created_at')
    .eq('workspace_id', workspaceId)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit)

  const list = rows ?? []
  const actorIds = [...new Set(list.map((r) => r.actor_id).filter((x): x is string => Boolean(x)))]
  const names = new Map<string, string>()
  if (actorIds.length) {
    const { data: profs } = await client
      .from('profiles')
      .select('id, full_name, email')
      .in('id', actorIds)
    for (const p of profs ?? []) names.set(p.id, p.full_name || p.email || 'Member')
  }

  return list.map((r) => ({
    id: r.id,
    actorName: r.actor_id ? (names.get(r.actor_id) ?? 'Member') : 'Someone',
    action: r.action,
    targetType: r.target_type,
    targetTitle: r.target_title,
    createdAt: r.created_at,
  }))
}
