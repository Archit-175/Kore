'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  createInvite,
  createProject,
  createTeam,
  deleteProject,
  deleteTeam,
  renameProject,
  renameTeam,
} from '@/lib/actions/workspace'
import { InlineCreate } from './inline-create'
import { EntitySettingsMenu } from './entity-settings-menu'
import { ProjectPagesTree } from './project-pages-tree'
import { ProjectDatabasesTree } from './project-databases-tree'
import { ProjectWhiteboardsTree } from './project-whiteboards-tree'
import { ChatUnreadBadge } from './chat-unread-badge'

export type SidebarTeam = { id: string; name: string; icon: string | null }
export type SidebarProject = { id: string; name: string; icon: string | null; teamId: string }
export type SidebarLink = { id: string; name: string; href: string }

export type SidebarData = {
  workspaceId: string
  workspaceName: string
  currentUserId: string
  chatUnread: number
  isOwner: boolean
  myTeamIds: string[]
  teams: SidebarTeam[]
  projects: SidebarProject[]
  favorites: SidebarLink[]
  recents: SidebarLink[]
}

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
}: {
  href: string
  label: string
  icon?: string | null
  active: boolean
  onNavigate?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center gap-2 truncate rounded px-2 py-1.5 text-sm transition ${
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

export function Sidebar({
  data,
  collapsed = false,
  onNavigate,
}: {
  data: SidebarData
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()

  // Collapsed desktop rail: workspace initial + project initials as squares.
  if (collapsed) {
    return (
      <nav className="flex h-full flex-col items-center gap-1 overflow-y-auto py-3">
        <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-indigo-600 text-sm font-bold text-white">
          {data.workspaceName.slice(0, 1).toUpperCase()}
        </div>
        <Link
          href="/notes"
          onClick={onNavigate}
          title="Notes"
          className={`mb-1 flex h-8 w-8 items-center justify-center rounded-md text-xs transition ${
            pathname === '/notes'
              ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300'
              : 'text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10'
          }`}
        >
          🗒
        </Link>
        <Link
          href="/chat"
          onClick={onNavigate}
          title="Chat"
          className={`relative mb-1 flex h-8 w-8 items-center justify-center rounded-md text-xs transition ${
            pathname === '/chat'
              ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300'
              : 'text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10'
          }`}
        >
          💬
          <ChatUnreadBadge
            workspaceId={data.workspaceId}
            currentUserId={data.currentUserId}
            initial={data.chatUnread}
            dot
          />
        </Link>
        {data.projects.map((p) => {
          const href = `/p/${p.id}`
          const active = pathname === href
          return (
            <Link
              key={p.id}
              href={href}
              onClick={onNavigate}
              title={p.name}
              className={`flex h-8 w-8 items-center justify-center rounded-md text-xs transition ${
                active
                  ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300'
                  : 'text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10'
              }`}
            >
              {p.icon ?? p.name.slice(0, 1).toUpperCase()}
            </Link>
          )
        })}
      </nav>
    )
  }

  return (
    <nav className="flex h-full flex-col overflow-y-auto px-2 py-3">
      <Link
        href="/"
        onClick={onNavigate}
        className="mb-2 flex items-center gap-2 px-2 py-1"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-sm font-bold text-white">
          {data.workspaceName.slice(0, 1).toUpperCase()}
        </span>
        <span className="truncate text-sm font-semibold">{data.workspaceName}</span>
      </Link>

      <div>
        <SectionLabel>Workspace</SectionLabel>
        <NavLink
          href="/notes"
          label="Notes"
          icon="🗒"
          active={pathname === '/notes'}
          onNavigate={onNavigate}
        />
        <Link
          href="/chat"
          onClick={onNavigate}
          className={`flex items-center gap-2 truncate rounded px-2 py-1.5 text-sm transition ${
            pathname === '/chat'
              ? 'bg-indigo-500/10 font-medium text-indigo-600 dark:text-indigo-300'
              : 'text-neutral-700 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/5'
          }`}
        >
          <span className="w-4 text-center text-xs">💬</span>
          <span className="truncate">Chat</span>
          <ChatUnreadBadge
            workspaceId={data.workspaceId}
            currentUserId={data.currentUserId}
            initial={data.chatUnread}
          />
        </Link>
      </div>

      {data.favorites.length > 0 && (
        <div>
          <SectionLabel>Favorites</SectionLabel>
          {data.favorites.map((f) => (
            <NavLink
              key={f.id}
              href={f.href}
              label={f.name}
              icon="★"
              active={pathname === f.href}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <SectionLabel>Teams</SectionLabel>
      </div>
      {data.teams.length === 0 && (
        <p className="px-2 py-1 text-xs text-neutral-400">No teams yet.</p>
      )}
      {data.teams.map((team) => {
        const teamHref = `/t/${team.id}`
        const projects = data.projects.filter((p) => p.teamId === team.id)
        return (
          <div key={team.id} className="mb-1">
            <div className="group/row relative flex items-center">
              <div className="min-w-0 flex-1">
                <NavLink
                  href={teamHref}
                  label={team.name}
                  icon={team.icon ?? '▸'}
                  active={pathname === teamHref}
                  onNavigate={onNavigate}
                />
              </div>
              {data.isOwner && (
                <div className="absolute right-0.5 opacity-0 transition focus-within:opacity-100 group-hover/row:opacity-100">
                  <EntitySettingsMenu
                    id={team.id}
                    name={team.name}
                    label="team"
                    renameAction={renameTeam}
                    deleteAction={deleteTeam}
                    canDelete
                    cascadeWarning="Every project in this team — and all of its pages, databases, and whiteboards — will be permanently deleted."
                  />
                </div>
              )}
            </div>
            <div className="ml-3 border-l border-border pl-1">
              {projects.map((p) => (
                <div key={p.id}>
                  <div className="group/row relative flex items-center">
                    <div className="min-w-0 flex-1">
                      <NavLink
                        href={`/p/${p.id}`}
                        label={p.name}
                        icon={p.icon ?? '·'}
                        active={pathname === `/p/${p.id}`}
                        onNavigate={onNavigate}
                      />
                    </div>
                    <div className="absolute right-0.5 opacity-0 transition focus-within:opacity-100 group-hover/row:opacity-100">
                      <EntitySettingsMenu
                        id={p.id}
                        name={p.name}
                        label="project"
                        renameAction={renameProject}
                        deleteAction={deleteProject}
                        canDelete={data.isOwner || data.myTeamIds.includes(p.teamId)}
                        cascadeWarning="All of this project's pages, databases, and whiteboards will be permanently deleted."
                      />
                    </div>
                  </div>
                  <div className="ml-3 border-l border-border pl-1">
                    <ProjectPagesTree
                      projectId={p.id}
                      workspaceId={data.workspaceId}
                      onNavigate={onNavigate}
                    />
                    <ProjectDatabasesTree
                      projectId={p.id}
                      workspaceId={data.workspaceId}
                      onNavigate={onNavigate}
                    />
                    <ProjectWhiteboardsTree
                      projectId={p.id}
                      workspaceId={data.workspaceId}
                      onNavigate={onNavigate}
                    />
                  </div>
                </div>
              ))}
              <InlineCreate
                action={createProject}
                placeholder="Project name"
                triggerLabel="New project"
                hidden={[{ name: 'teamId', value: team.id }]}
              />
            </div>
          </div>
        )
      })}

      {data.isOwner && (
        <InlineCreate action={createTeam} placeholder="Team name" triggerLabel="New team" />
      )}

      {data.recents.length > 0 && (
        <div>
          <SectionLabel>Recent</SectionLabel>
          {data.recents.map((r) => (
            <NavLink
              key={r.id}
              href={r.href}
              label={r.name}
              icon="🕘"
              active={pathname === r.href}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}

      {data.isOwner && (
        <div className="mt-auto pt-3">
          <InlineCreate
            action={createInvite}
            placeholder="teammate@email.com"
            triggerLabel="Invite member"
          />
          <Link
            href="/members"
            onClick={onNavigate}
            className="block rounded px-2 py-1 text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            Manage members →
          </Link>
        </div>
      )}
    </nav>
  )
}
