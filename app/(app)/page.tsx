import Link from 'next/link'
import { requireMember, verifySession } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'

function ProjectCard({ id, name }: { id: string; name: string }) {
  return (
    <Link
      href={`/p/${id}`}
      className="rounded-lg border border-border bg-surface p-4 transition hover:border-indigo-400 hover:shadow-sm"
    >
      <p className="truncate text-sm font-medium">{name}</p>
      <p className="mt-1 text-xs text-neutral-400">Project</p>
    </Link>
  )
}

export default async function HomePage() {
  const membership = await requireMember()
  const user = await verifySession()
  const supabase = await createClient()

  const [projectsRes, recentRes, favRes] = await Promise.all([
    supabase.from('projects').select('id, name'),
    supabase
      .from('recents')
      .select('target_id, visited_at')
      .eq('user_id', user.id)
      .eq('target_type', 'project')
      .order('visited_at', { ascending: false })
      .limit(8),
    supabase
      .from('favorites')
      .select('target_id')
      .eq('user_id', user.id)
      .eq('target_type', 'project'),
  ])

  const projects = projectsRes.data ?? []
  const byId = new Map(projects.map((p) => [p.id, p.name]))
  const recents = (recentRes.data ?? [])
    .filter((r) => byId.has(r.target_id))
    .map((r) => ({ id: r.target_id, name: byId.get(r.target_id)! }))
  const favorites = (favRes.data ?? [])
    .filter((f) => byId.has(f.target_id))
    .map((f) => ({ id: f.target_id, name: byId.get(f.target_id)! }))

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        {membership.workspace.name}
      </h1>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Your team workspace. Open a project to start collaborating in real time.
      </p>

      {projects.length === 0 && (
        <div className="mt-8 rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {membership.role === 'owner'
              ? 'Create a team and a project from the sidebar to get started.'
              : 'No projects yet. Ask the workspace owner to set up a team and project.'}
          </p>
        </div>
      )}

      {favorites.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-neutral-500 dark:text-neutral-400">
            Favorites
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {favorites.map((p) => (
              <ProjectCard key={p.id} {...p} />
            ))}
          </div>
        </section>
      )}

      {recents.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-neutral-500 dark:text-neutral-400">
            Recent
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recents.map((p) => (
              <ProjectCard key={p.id} {...p} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
