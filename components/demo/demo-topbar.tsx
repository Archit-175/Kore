'use client'

import Link from 'next/link'
import { useDemo } from '@/lib/demo/context'
import { ThemeToggle } from '@/components/theme-toggle'
import { OnlineAvatars } from '@/components/shell/online-avatars'
import { DemoGlobalSearch } from './demo-global-search'

/** Demo topbar: in-memory search + STATIC presence avatars (no networking) +
 *  theme toggle + a "Sign up" CTA in place of the real account menu. */
export function DemoTopbar({
  onMenu,
  onToggleCollapse,
}: {
  onMenu: () => void
  onToggleCollapse: () => void
}) {
  const store = useDemo()
  const online = [store.presenceUser, ...store.onlinePeers]

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
        <DemoGlobalSearch />
      </div>

      <OnlineAvatars users={online} />
      <ThemeToggle />
      <Link
        href="/signup"
        className="hidden rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-700 sm:block"
      >
        Sign up free
      </Link>
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
