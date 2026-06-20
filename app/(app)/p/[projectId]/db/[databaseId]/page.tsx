import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireMember } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'
import { loadDatabase, loadWorkspaceMembers } from '@/lib/databases/load-database'
import { DatabaseView } from '@/components/databases/database-view'

export default async function DatabaseRoute({
  params,
}: {
  params: Promise<{ projectId: string; databaseId: string }>
}) {
  const { projectId, databaseId } = await params
  const membership = await requireMember()
  const supabase = await createClient()

  const aggregate = await loadDatabase(supabase, membership.workspaceId, databaseId)
  if (!aggregate || aggregate.database.projectId !== projectId) notFound()

  const [members, projectRes] = await Promise.all([
    loadWorkspaceMembers(supabase, membership.workspaceId),
    supabase.from('projects').select('name').eq('id', projectId).maybeSingle(),
  ])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-2 text-sm">
        <Link
          href={`/p/${projectId}`}
          className="truncate text-neutral-500 transition hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          {projectRes.data?.name ?? 'Project'}
        </Link>
        <span className="text-neutral-300 dark:text-neutral-600">/</span>
        <span className="truncate font-medium">{aggregate.database.name.trim() || 'Untitled'}</span>
      </div>
      <div className="min-h-0 flex-1">
        <DatabaseView
          initial={aggregate}
          workspaceId={membership.workspaceId}
          members={members}
          isOwner={membership.role === 'owner'}
        />
      </div>
    </div>
  )
}
