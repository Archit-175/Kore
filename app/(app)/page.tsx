import Link from 'next/link'
import { requireMember } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'
import { NOTE_COLOR_CLASSES, normalizeColor } from '@/lib/notes/colors'

function ProjectCard({
  id,
  name,
  icon,
}: {
  id: string
  name: string
  icon: string | null
}) {
  return (
    <Link
      href={`/p/${id}`}
      className="flex items-center gap-2.5 rounded-xl border border-border bg-surface/80 p-3.5 backdrop-blur transition hover:border-indigo-400 hover:shadow-sm"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black/5 text-base dark:bg-white/10">
        {icon ?? '📁'}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="block text-xs text-neutral-400">Project</span>
      </span>
    </Link>
  )
}

export default async function HomePage() {
  const membership = await requireMember()
  const supabase = await createClient()

  const [teamsRes, projectsRes, pinnedRes] = await Promise.all([
    supabase.from('teams').select('id, name, icon, position').order('position'),
    supabase.from('projects').select('id, name, icon, team_id, position').order('position'),
    supabase
      .from('notes')
      .select('id, title, content, color')
      .eq('workspace_id', membership.workspaceId)
      .eq('pinned', true)
      .is('trashed_at', null)
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
      .limit(8),
  ])

  const teams = teamsRes.data ?? []
  const projects = projectsRes.data ?? []
  const pinned = pinnedRes.data ?? []
  const isOwner = membership.role === 'owner'

  return (
    <div className="relative min-h-full">
      {/* Outline-only "KORE" wordmark behind everything (see .kore-watermark). */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 flex items-center justify-center overflow-hidden"
      >
        <span className="kore-watermark">KORE</span>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-10">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
            Workspace
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            {membership.workspace.name}
          </h1>
          <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
            Your teams, projects, and pinned notes — all in one place.
          </p>
        </header>

        {teams.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-surface/60 p-10 text-center backdrop-blur">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {isOwner
                ? 'Create a team and a project from the sidebar to get started.'
                : 'No teams yet. Ask the workspace owner to set one up.'}
            </p>
          </div>
        )}

        <div className="space-y-9">
          {teams.map((team) => {
            const teamProjects = projects.filter((p) => p.team_id === team.id)
            return (
              <section key={team.id}>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-lg">{team.icon ?? '👥'}</span>
                  <Link
                    href={`/t/${team.id}`}
                    className="text-base font-semibold tracking-tight hover:underline"
                  >
                    {team.name}
                  </Link>
                  <span className="text-xs text-neutral-400">
                    {teamProjects.length} {teamProjects.length === 1 ? 'project' : 'projects'}
                  </span>
                </div>
                {teamProjects.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-4 py-5 text-sm text-neutral-400">
                    No projects yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {teamProjects.map((p) => (
                      <ProjectCard key={p.id} id={p.id} name={p.name} icon={p.icon} />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>

        {pinned.length > 0 && (
          <section className="mt-12">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-lg">📌</span>
              <h2 className="text-base font-semibold tracking-tight">Pinned notes</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pinned.map((n) => (
                <Link
                  key={n.id}
                  href="/notes"
                  className={`block rounded-xl border p-3.5 shadow-sm transition hover:shadow-md ${
                    NOTE_COLOR_CLASSES[normalizeColor(n.color)].card
                  }`}
                >
                  {n.title && (
                    <p className="mb-1 truncate text-sm font-semibold">{n.title}</p>
                  )}
                  <p className="line-clamp-4 whitespace-pre-wrap text-sm text-neutral-600 dark:text-neutral-300">
                    {n.content || (n.title ? '' : 'Untitled note')}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
