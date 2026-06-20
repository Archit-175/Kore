import { notFound } from 'next/navigation'
import { requireMember, getPresenceUser } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'
import { loadWhiteboard } from '@/lib/whiteboards/load-whiteboards'
import { WhiteboardView } from '@/components/whiteboards/whiteboard-view'

export default async function WhiteboardRoute({
  params,
}: {
  params: Promise<{ projectId: string; whiteboardId: string }>
}) {
  const { projectId, whiteboardId } = await params
  const membership = await requireMember()
  const supabase = await createClient()

  const meta = await loadWhiteboard(supabase, membership.workspaceId, whiteboardId)
  if (!meta || meta.projectId !== projectId) notFound()

  const user = await getPresenceUser()

  return (
    <div className="h-full">
      <WhiteboardView
        whiteboardId={whiteboardId}
        projectId={projectId}
        workspaceId={membership.workspaceId}
        user={user}
        initialMeta={meta}
      />
    </div>
  )
}
