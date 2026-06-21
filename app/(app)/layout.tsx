import { getPresenceUser, getTeamMemberships, requireMember, verifySession } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'
import { loadUnreadCount } from '@/lib/chat/load-chat'
import { AppShell } from '@/components/shell/app-shell'
import type { SidebarData, SidebarLink } from '@/components/shell/sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const membership = await requireMember()
  const user = await verifySession()
  const presenceUser = await getPresenceUser()
  const supabase = await createClient()

  const [teamsRes, projectsRes, favRes, recentRes, chatUnread, myTeamIds] = await Promise.all([
    supabase.from('teams').select('id, name, icon, position').order('position'),
    supabase.from('projects').select('id, name, icon, team_id, position').order('position'),
    supabase.from('favorites').select('target_type, target_id').eq('user_id', user.id),
    supabase
      .from('recents')
      .select('target_type, target_id, visited_at')
      .eq('user_id', user.id)
      .order('visited_at', { ascending: false })
      .limit(8),
    loadUnreadCount(supabase, membership.workspaceId, user.id),
    getTeamMemberships(),
  ])

  const teams = teamsRes.data ?? []
  const projects = projectsRes.data ?? []
  const projectById = new Map(projects.map((p) => [p.id, p]))

  const toLink = (targetId: string): SidebarLink | null => {
    const p = projectById.get(targetId)
    return p ? { id: p.id, name: p.name, href: `/p/${p.id}` } : null
  }

  const favorites = (favRes.data ?? [])
    .filter((f) => f.target_type === 'project')
    .map((f) => toLink(f.target_id))
    .filter((x): x is SidebarLink => x !== null)

  const recents = (recentRes.data ?? [])
    .filter((r) => r.target_type === 'project')
    .map((r) => toLink(r.target_id))
    .filter((x): x is SidebarLink => x !== null)

  const sidebar: SidebarData = {
    workspaceId: membership.workspaceId,
    workspaceName: membership.workspace.name,
    currentUserId: user.id,
    chatUnread,
    isOwner: membership.role === 'owner',
    myTeamIds,
    teams: teams.map((t) => ({ id: t.id, name: t.name, icon: t.icon })),
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      icon: p.icon,
      teamId: p.team_id,
    })),
    favorites,
    recents,
  }

  return (
    <AppShell
      sidebar={sidebar}
      user={presenceUser}
      email={user.email ?? ''}
      workspaceId={membership.workspaceId}
      isOwner={membership.role === 'owner'}
    >
      {children}
    </AppShell>
  )
}
