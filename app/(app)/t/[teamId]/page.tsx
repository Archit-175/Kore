import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireMember } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'
import { deleteTeam, renameTeam } from '@/lib/actions/workspace'
import { EntitySettingsMenu } from '@/components/shell/entity-settings-menu'

export default async function TeamPage({
  params,
}: {
  params: Promise<{ teamId: string }>
}) {
  const { teamId } = await params
  const membership = await requireMember()
  const isOwner = membership.role === 'owner'
  const supabase = await createClient()

  const { data: team } = await supabase
    .from('teams')
    .select('id, name')
    .eq('id', teamId)
    .maybeSingle()
  if (!team) notFound()

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('team_id', teamId)
    .order('position')

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{team.name}</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Team</p>
        </div>
        {isOwner && (
          <EntitySettingsMenu
            id={team.id}
            name={team.name}
            label="team"
            renameAction={renameTeam}
            deleteAction={deleteTeam}
            canDelete
            cascadeWarning="Every project in this team — and all of its pages, databases, and whiteboards — will be permanently deleted."
          />
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(projects ?? []).map((p) => (
          <Link
            key={p.id}
            href={`/p/${p.id}`}
            className="rounded-lg border border-border bg-surface p-4 transition hover:border-indigo-400 hover:shadow-sm"
          >
            <p className="truncate text-sm font-medium">{p.name}</p>
            <p className="mt-1 text-xs text-neutral-400">Project</p>
          </Link>
        ))}
        {(projects ?? []).length === 0 && (
          <p className="text-sm text-neutral-400">
            No projects in this team yet. Add one from the sidebar.
          </p>
        )}
      </div>
    </div>
  )
}
