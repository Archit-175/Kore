import { notFound } from 'next/navigation'
import { getPresenceUser, requireMember, verifySession } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'
import { ProjectView } from '@/components/collab/project-view'

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const membership = await requireMember()
  const user = await verifySession()
  const presenceUser = await getPresenceUser()
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, team_id, teams ( name )')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) notFound()

  const { data: fav } = await supabase
    .from('favorites')
    .select('target_id')
    .eq('user_id', user.id)
    .eq('target_type', 'project')
    .eq('target_id', projectId)
    .maybeSingle()

  const team = Array.isArray(project.teams) ? project.teams[0] : project.teams

  return (
    <ProjectView
      project={{ id: project.id, name: project.name, teamName: team?.name ?? 'Team' }}
      user={presenceUser}
      workspaceId={membership.workspaceId}
      isFavorite={Boolean(fav)}
    />
  )
}
