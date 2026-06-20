import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireMember } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'

export default async function TeamPage({
  params,
}: {
  params: Promise<{ teamId: string }>
}) {
  const { teamId } = await params
  await requireMember()
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
      <h1 className="text-2xl font-semibold tracking-tight">{team.name}</h1>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Team</p>

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
