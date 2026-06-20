import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Best-effort activity logging for the per-project feed. This is a HELPER (not a
 * Server Action) called INSIDE the existing DAL-gated actions — it reuses their
 * already-authorized supabase client + session, stamps the coarse event, and
 * NEVER throws (a logging failure must not fail the user's real mutation). RLS
 * (activity_log_insert: member + actor_id = auth.uid()) is the boundary.
 */

type Supabase = SupabaseClient<Database>

export type ActivityAction = 'created' | 'renamed' | 'trashed' | 'restored' | 'deleted'
export type ActivityTargetType = 'page' | 'database' | 'whiteboard' | 'note'

export async function logActivity(
  supabase: Supabase,
  input: {
    workspaceId: string
    projectId: string
    actorId: string
    action: ActivityAction
    targetType: ActivityTargetType
    targetId: string
    targetTitle?: string | null
  },
): Promise<void> {
  try {
    await supabase.from('activity_log').insert({
      workspace_id: input.workspaceId,
      project_id: input.projectId,
      actor_id: input.actorId,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId,
      target_title: (input.targetTitle ?? '').slice(0, 200) || null,
    })
  } catch {
    // best-effort: never block the real mutation on a logging failure
  }
}
