'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useDemo } from '@/lib/demo/context'
import { pageHref, pageDisplayTitle } from '@/lib/docs/types'
import { dbHref } from '@/lib/databases/types'
import { wbHref } from '@/lib/whiteboards/types'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
      {children}
    </p>
  )
}

function NavLink({
  href,
  label,
  icon,
  active,
  onNavigate,
  indent,
}: {
  href: string
  label: string
  icon?: string | null
  active: boolean
  onNavigate?: () => void
  indent?: boolean
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center gap-2 truncate rounded px-2 py-1.5 text-sm transition ${indent ? 'pl-3' : ''} ${
        active
          ? 'bg-indigo-500/10 font-medium text-indigo-600 dark:text-indigo-300'
          : 'text-neutral-700 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/5'
      }`}
    >
      <span className="w-4 text-center text-xs">{icon ?? '#'}</span>
      <span className="truncate">{label}</span>
    </Link>
  )
}

export function DemoSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const store = useDemo()
  const pathname = usePathname()
  const is = (href: string) => pathname === href

  return (
    <nav className="flex h-full flex-col overflow-y-auto px-2 py-3">
      <Link href="/demo" onClick={onNavigate} className="mb-2 flex items-center gap-2 px-2 py-1">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-sm font-bold text-white">
          K
        </span>
        <span className="truncate text-sm font-semibold">{store.workspace.name}</span>
      </Link>

      <div>
        <SectionLabel>Workspace</SectionLabel>
        <NavLink href="/demo/notes" label="Notes" icon="🗒" active={is('/demo/notes')} onNavigate={onNavigate} />
        <Link
          href="/demo/chat"
          onClick={onNavigate}
          className={`flex items-center gap-2 truncate rounded px-2 py-1.5 text-sm transition ${
            is('/demo/chat')
              ? 'bg-indigo-500/10 font-medium text-indigo-600 dark:text-indigo-300'
              : 'text-neutral-700 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/5'
          }`}
        >
          <span className="w-4 text-center text-xs">💬</span>
          <span className="truncate">Chat</span>
          <span className="ml-auto rounded-full bg-indigo-600 px-1.5 text-[10px] font-semibold text-white">2</span>
        </Link>
      </div>

      <SectionLabel>Teams</SectionLabel>
      {store.teams.map((team) => {
        const projects = store.projects.filter((p) => p.teamId === team.id)
        return (
          <div key={team.id} className="mb-1">
            <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-neutral-500">
              <span className="w-4 text-center text-xs">{team.icon ?? '▸'}</span>
              <span className="truncate font-medium">{team.name}</span>
            </div>
            <div className="ml-3 border-l border-border pl-1">
              {projects.map((p) => {
                const projHref = `/demo/p/${p.id}`
                const pages = store.pages.filter((pg) => pg.projectId === p.id && !pg.parentPageId && !pg.trashedAt)
                const dbs = store.listDatabases(p.id).filter((d) => !d.trashedAt)
                const wbs = store.whiteboards.filter((w) => w.projectId === p.id && !w.trashedAt)
                return (
                  <div key={p.id}>
                    <NavLink
                      href={projHref}
                      label={p.name}
                      icon={p.icon ?? '·'}
                      active={is(projHref)}
                      onNavigate={onNavigate}
                    />
                    <div className="ml-3 border-l border-border pl-1">
                      {pages.map((pg) => (
                        <NavLink
                          key={pg.id}
                          href={`/demo${pageHref(pg.projectId, pg.id)}`}
                          label={pageDisplayTitle(pg.title)}
                          icon={pg.icon ?? '📄'}
                          active={is(`/demo${pageHref(pg.projectId, pg.id)}`)}
                          onNavigate={onNavigate}
                          indent
                        />
                      ))}
                      {dbs.map((d) => (
                        <NavLink
                          key={d.id}
                          href={`/demo${dbHref(p.id, d.id)}`}
                          label={d.name}
                          icon={d.icon ?? '🗃'}
                          active={is(`/demo${dbHref(p.id, d.id)}`)}
                          onNavigate={onNavigate}
                          indent
                        />
                      ))}
                      {wbs.map((w) => (
                        <NavLink
                          key={w.id}
                          href={`/demo${wbHref(p.id, w.id)}`}
                          label={w.title}
                          icon={w.icon ?? '🎨'}
                          active={is(`/demo${wbHref(p.id, w.id)}`)}
                          onNavigate={onNavigate}
                          indent
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <div className="mt-auto pt-3">
        <Link
          href="/demo/members"
          onClick={onNavigate}
          className="block rounded px-2 py-1 text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
        >
          Members →
        </Link>
      </div>
    </nav>
  )
}
