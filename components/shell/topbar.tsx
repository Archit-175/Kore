'use client'

import type { PresenceUser } from '@/lib/presence'
import { useWorkspacePresence } from '@/lib/use-workspace-presence'
import { ThemeToggle } from '@/components/theme-toggle'
import { GlobalSearch } from './global-search'
import { OnlineAvatars } from './online-avatars'
import { AvatarMenu } from './avatar-menu'

export function Topbar({
  user,
  email,
  workspaceId,
  isOwner,
  onMenu,
  onToggleCollapse,
}: {
  user: PresenceUser
  email: string
  workspaceId: string
  isOwner: boolean
  onMenu: () => void
  onToggleCollapse: () => void
}) {
  const online = useWorkspacePresence(workspaceId, user)

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open menu"
        className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-600 hover:bg-black/5 md:hidden dark:text-neutral-300 dark:hover:bg-white/10"
      >
        <MenuIcon />
      </button>
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label="Toggle sidebar"
        className="hidden h-8 w-8 items-center justify-center rounded-md text-neutral-600 hover:bg-black/5 md:flex dark:text-neutral-300 dark:hover:bg-white/10"
      >
        <SidebarIcon />
      </button>

      <div className="flex flex-1 justify-center px-2">
        <GlobalSearch />
      </div>

      <OnlineAvatars users={online} />
      <ThemeToggle />
      <AvatarMenu user={user} email={email} isOwner={isOwner} />
    </header>
  )
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  )
}

function SidebarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
    </svg>
  )
}
