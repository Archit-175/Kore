'use client'

import Link from 'next/link'
import { useDemo } from '@/lib/demo/context'
import { NOTE_COLOR_CLASSES } from '@/lib/notes/colors'
import { noteTab } from '@/lib/notes/types'

function ProjectCard({ id, name, icon }: { id: string; name: string; icon: string | null }) {
  return (
    <Link
      href={`/demo/p/${id}`}
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

export function DemoHome() {
  const store = useDemo()
  const pinned = store.notes.filter((n) => n.pinned && noteTab(n) === 'active')

  return (
    <div className="relative min-h-full">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 flex items-center justify-center overflow-hidden"
      >
        <span className="kore-watermark">KORE</span>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-10">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">Workspace</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{store.workspace.name}</h1>
          <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
            A live, interactive tour of Kore — notes, docs, databases, whiteboards, and chat. Nothing you do
            here is saved; refresh to reset.
          </p>
        </header>

        <div className="space-y-9">
          {store.teams.map((team) => {
            const teamProjects = store.projects.filter((p) => p.teamId === team.id)
            return (
              <section key={team.id}>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-lg">{team.icon ?? '👥'}</span>
                  <span className="text-base font-semibold tracking-tight">{team.name}</span>
                  <span className="text-xs text-neutral-400">
                    {teamProjects.length} {teamProjects.length === 1 ? 'project' : 'projects'}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {teamProjects.map((p) => (
                    <ProjectCard key={p.id} id={p.id} name={p.name} icon={p.icon} />
                  ))}
                </div>
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
                  href="/demo/notes"
                  className={`block rounded-xl border p-3.5 shadow-sm transition hover:shadow-md ${
                    NOTE_COLOR_CLASSES[n.color].card
                  }`}
                >
                  {n.title && <p className="mb-1 truncate text-sm font-semibold">{n.title}</p>}
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
