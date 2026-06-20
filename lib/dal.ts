import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { userColor } from '@/lib/yjs/awareness'
import type { PresenceUser } from '@/lib/presence'
import type { MemberRole } from '@/types/database'

/**
 * Data Access Layer — the REAL authorization boundary (proxy.ts is optimistic
 * only). `cache()` memoizes within a single render pass so repeated calls in a
 * layout + page + leaf components don't re-hit Supabase.
 */

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

export const verifySession = cache(async (): Promise<User> => {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
})

export type ActiveMembership = {
  id: string
  workspaceId: string
  role: MemberRole
  workspace: { id: string; name: string; ownerId: string }
}

export const getActiveMembership = cache(async (): Promise<ActiveMembership | null> => {
  const user = await getCurrentUser()
  if (!user) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('memberships')
    .select('id, workspace_id, role, workspaces!inner ( id, name, owner_id )')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (!data) return null

  const ws = Array.isArray(data.workspaces) ? data.workspaces[0] : data.workspaces
  return {
    id: data.id,
    workspaceId: data.workspace_id,
    role: data.role,
    workspace: { id: ws.id, name: ws.name, ownerId: ws.owner_id },
  }
})

/** Gate for the main app: authenticated AND an active workspace member. */
export const requireMember = cache(async (): Promise<ActiveMembership> => {
  await verifySession()
  const membership = await getActiveMembership()
  if (!membership) redirect('/request-access')
  return membership
})

/** Gate for owner-only actions/pages. */
export async function requireOwner(): Promise<ActiveMembership> {
  const membership = await requireMember()
  if (membership.role !== 'owner') redirect('/')
  return membership
}

/** True if the single workspace has been bootstrapped (RLS-bypassing RPC). */
export const workspaceExists = cache(async (): Promise<boolean> => {
  const supabase = await createClient()
  const { data } = await supabase.rpc('workspace_exists')
  return data ?? false
})

/** The current user as a PresenceUser (cursor color + avatar). */
export const getPresenceUser = cache(async (): Promise<PresenceUser> => {
  const user = await verifySession()
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('full_name, email, avatar_url')
    .eq('id', user.id)
    .maybeSingle()
  const name = data?.full_name || data?.email || user.email || 'Member'
  return { id: user.id, name, color: userColor(user.id), avatarUrl: data?.avatar_url ?? null }
})
