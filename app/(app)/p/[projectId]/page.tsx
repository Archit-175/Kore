import { notFound } from 'next/navigation'
import { canAdminProject, requireMember, verifySession } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'
import { loadProjectPages, loadTrashedPages } from '@/lib/docs/load-pages'
import { ProjectDocsHome } from '@/components/docs/project-docs-home'

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const membership = await requireMember()
  const user = await verifySession()
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, icon, team_id, teams ( name )')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) notFound()

  const canAdmin = await canAdminProject(projectId)

  const { data: fav } = await supabase
    .from('favorites')
    .select('target_id')
    .eq('user_id', user.id)
    .eq('target_type', 'project')
    .eq('target_id', projectId)
    .maybeSingle()

  const team = Array.isArray(project.teams) ? project.teams[0] : project.teams
  const [initialPages, initialTrashed] = await Promise.all([
    loadProjectPages(supabase, membership.workspaceId, projectId),
    loadTrashedPages(supabase, membership.workspaceId, projectId),
  ])

  return (
    <ProjectDocsHome
      projectId={project.id}
      projectName={project.name}
      projectIcon={project.icon}
      teamName={team?.name ?? 'Team'}
      workspaceId={membership.workspaceId}
      canAdmin={canAdmin}
      isFavorite={Boolean(fav)}
      initialPages={initialPages}
      initialTrashed={initialTrashed}
    />
  )
}
