import { notFound } from 'next/navigation'
import { getPresenceUser, requireMember } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'
import { loadBacklinks } from '@/lib/docs/load-pages'
import { PageDocView } from '@/components/docs/page-doc-view'

export default async function PageEditorRoute({
  params,
}: {
  params: Promise<{ projectId: string; pageId: string }>
}) {
  const { projectId, pageId } = await params
  const membership = await requireMember()
  const presenceUser = await getPresenceUser()
  const supabase = await createClient()

  const { data: page } = await supabase
    .from('pages')
    .select('id, title, icon, project_id, projects ( name )')
    .eq('id', pageId)
    .eq('project_id', projectId)
    .maybeSingle()
  if (!page) notFound()

  const project = Array.isArray(page.projects) ? page.projects[0] : page.projects
  const initialBacklinks = await loadBacklinks(supabase, pageId)

  return (
    <PageDocView
      page={{
        id: page.id,
        projectId: page.project_id,
        projectName: project?.name ?? 'Project',
        title: page.title,
        icon: page.icon,
      }}
      user={presenceUser}
      workspaceId={membership.workspaceId}
      isOwner={membership.role === 'owner'}
      initialBacklinks={initialBacklinks}
    />
  )
}
