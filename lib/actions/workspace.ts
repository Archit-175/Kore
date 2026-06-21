'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  canAdminProject,
  getActiveMembership,
  requireMember,
  requireOwner,
  verifySession,
} from '@/lib/dal'

export type ActionState = { error?: string } | undefined

// ----------------------------------------------------------------------------
// Onboarding
// ----------------------------------------------------------------------------
export async function bootstrapWorkspace(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await verifySession()
  const name = String(formData.get('name') ?? '').trim() || 'Kore'

  const supabase = await createClient()
  const { error } = await supabase.rpc('bootstrap_workspace', { p_name: name })
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  redirect('/')
}

// ----------------------------------------------------------------------------
// Teams (owner-only)
// ----------------------------------------------------------------------------
export async function createTeam(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const membership = await requireOwner()
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Team name is required.' }

  const supabase = await createClient()
  const { error } = await supabase.from('teams').insert({
    workspace_id: membership.workspaceId,
    name,
    created_by: (await verifySession()).id,
  })
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
}

/** Rename a team (owner-only, mirrors teams_update RLS). */
export async function renameTeam(teamId: string, name: string): Promise<ActionState> {
  await requireOwner()
  const trimmed = name.trim()
  if (!trimmed) return { error: 'Team name is required.' }

  const supabase = await createClient()
  const { error } = await supabase.from('teams').update({ name: trimmed }).eq('id', teamId)
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
}

/** Delete a team — cascades to its projects and their content (owner-only). */
export async function deleteTeam(teamId: string) {
  await requireOwner()
  const supabase = await createClient()
  await supabase.from('teams').delete().eq('id', teamId)
  revalidatePath('/', 'layout')
  redirect('/')
}

// ----------------------------------------------------------------------------
// Projects (members create/edit; owner deletes)
// ----------------------------------------------------------------------------
export async function createProject(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const membership = await requireMember()
  const teamId = String(formData.get('teamId') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  if (!teamId) return { error: 'Missing team.' }
  if (!name) return { error: 'Project name is required.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('projects')
    .insert({
      workspace_id: membership.workspaceId,
      team_id: teamId,
      name,
      created_by: (await verifySession()).id,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  redirect(`/p/${data.id}`)
}

/** Rename a project (any member, mirrors projects_update RLS). */
export async function renameProject(projectId: string, name: string): Promise<ActionState> {
  await requireMember()
  const trimmed = name.trim()
  if (!trimmed) return { error: 'Project name is required.' }

  const supabase = await createClient()
  const { error } = await supabase.from('projects').update({ name: trimmed }).eq('id', projectId)
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
}

export async function deleteProject(projectId: string) {
  await requireMember()
  if (!(await canAdminProject(projectId))) redirect('/')
  const supabase = await createClient()
  await supabase.from('projects').delete().eq('id', projectId)
  revalidatePath('/', 'layout')
  redirect('/')
}

/** Cosmetic project icon — any member (mirrors renameProject). */
export async function setProjectIcon(
  projectId: string,
  icon: string | null,
): Promise<ActionState> {
  await requireMember()
  const supabase = await createClient()
  const { error } = await supabase.from('projects').update({ icon }).eq('id', projectId)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
}

// ----------------------------------------------------------------------------
// Invites / members (owner-only)
// ----------------------------------------------------------------------------
export async function createInvite(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireOwner()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email || !email.includes('@')) return { error: 'Enter a valid email.' }

  const supabase = await createClient()
  // RPC links the invite to an existing user immediately, or leaves it pending
  // for the signup trigger to resolve.
  const { error } = await supabase.rpc('invite_member', { p_email: email })
  if (error) {
    if (error.code === '23505') return { error: 'That email is already invited.' }
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
}

export async function removeMember(membershipId: string) {
  await requireOwner()
  const supabase = await createClient()
  await supabase.from('memberships').delete().eq('id', membershipId)
  revalidatePath('/', 'layout')
}

/** Owner approves a join request → active Editor. */
export async function approveMember(membershipId: string) {
  await requireOwner()
  const supabase = await createClient()
  await supabase
    .from('memberships')
    .update({ status: 'active', joined_at: new Date().toISOString() })
    .eq('id', membershipId)
  revalidatePath('/', 'layout')
}

/** A signed-in non-member files a request to join the workspace. */
export async function requestAccess() {
  await verifySession()
  const supabase = await createClient()
  await supabase.rpc('request_access')
  revalidatePath('/', 'layout')
}

// ----------------------------------------------------------------------------
// Team roster + team icon (workspace owner manages; RLS enforces it too).
// Team members gain owner-like powers over the team's PROJECTS (see can_admin_project).
// ----------------------------------------------------------------------------
export async function addTeamMember(teamId: string, userId: string): Promise<ActionState> {
  const membership = await requireOwner()
  const me = await verifySession()
  const supabase = await createClient()
  const { error } = await supabase.from('team_members').insert({
    team_id: teamId,
    user_id: userId,
    workspace_id: membership.workspaceId,
    added_by: me.id,
  })
  if (error) {
    if (error.code === '23505') return { error: 'Already on this team.' }
    return { error: error.message }
  }
  revalidatePath('/', 'layout')
}

export async function removeTeamMember(teamId: string, userId: string): Promise<ActionState> {
  await requireOwner()
  const supabase = await createClient()
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
}

/** Team icon — workspace owner only (managing the team entity). */
export async function setTeamIcon(teamId: string, icon: string | null): Promise<ActionState> {
  await requireOwner()
  const supabase = await createClient()
  const { error } = await supabase.from('teams').update({ icon }).eq('id', teamId)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
}

// ----------------------------------------------------------------------------
// Favorites / recents (any member, own rows)
// ----------------------------------------------------------------------------
export async function toggleFavorite(targetType: string, targetId: string) {
  const membership = await requireMember()
  const user = await verifySession()
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('favorites')
    .select('target_id')
    .eq('user_id', user.id)
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('target_type', targetType)
      .eq('target_id', targetId)
  } else {
    await supabase.from('favorites').insert({
      user_id: user.id,
      workspace_id: membership.workspaceId,
      target_type: targetType,
      target_id: targetId,
    })
  }
  revalidatePath('/', 'layout')
}

export async function touchRecent(targetType: string, targetId: string) {
  const membership = await getActiveMembership()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!membership || !user) return

  await supabase.from('recents').upsert(
    {
      user_id: user.id,
      workspace_id: membership.workspaceId,
      target_type: targetType,
      target_id: targetId,
      visited_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,target_type,target_id' },
  )
}
