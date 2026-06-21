import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireMember } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'
import { deleteTeam, renameTeam, setTeamIcon } from '@/lib/actions/workspace'
import { loadWorkspaceMembers } from '@/lib/databases/load-database'
import { EntitySettingsMenu } from '@/components/shell/entity-settings-menu'
import { EntityIcon } from '@/components/shell/entity-icon'
import { TeamMembers } from '@/components/teams/team-members'

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
    .select('id, name, icon')
    .eq('id', teamId)
    .maybeSingle()
  if (!team) notFound()

  const [{ data: projects }, { data: roster }, allMembers] = await Promise.all([
    supabase.from('projects').select('id, name, icon').eq('team_id', teamId).order('position'),
    supabase.from('team_members').select('user_id').eq('team_id', teamId),
    loadWorkspaceMembers(supabase, membership.workspaceId),
  ])

  const memberIds = new Set((roster ?? []).map((r) => r.user_id))
  const members = allMembers.filter((m) => memberIds.has(m.id))
  const candidates = allMembers.filter((m) => !memberIds.has(m.id))

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <EntityIcon
            id={team.id}
            icon={team.icon}
            editable={isOwner}
            action={setTeamIcon}
            fallback="👥"
          />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{team.name}</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {members.length} {members.length === 1 ? 'member' : 'members'} ·{' '}
              {(projects ?? []).length} {(projects ?? []).length === 1 ? 'project' : 'projects'}
            </p>
          </div>
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

      <div className="mt-8">
        <TeamMembers
          teamId={team.id}
          members={members}
          candidates={candidates}
          canManage={isOwner}
        />
        {!isOwner && members.length > 0 && (
          <p className="mt-2 text-xs text-neutral-400">
            Team members can manage this team&apos;s projects (delete, empty trash). The
            workspace owner manages who&apos;s on the team.
          </p>
        )}
      </div>

      <div className="mt-10">
        <h2 className="mb-3 text-sm font-semibold text-neutral-500 dark:text-neutral-400">
          Projects
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(projects ?? []).map((p) => (
            <Link
              key={p.id}
              href={`/p/${p.id}`}
              className="flex items-center gap-2.5 rounded-lg border border-border bg-surface p-3.5 transition hover:border-indigo-400 hover:shadow-sm"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black/5 text-base dark:bg-white/10">
                {p.icon ?? '📁'}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{p.name}</span>
                <span className="block text-xs text-neutral-400">Project</span>
              </span>
            </Link>
          ))}
          {(projects ?? []).length === 0 && (
            <p className="text-sm text-neutral-400">
              No projects in this team yet. Add one from the sidebar.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
