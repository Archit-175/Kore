'use client'

import { useEffect, useState } from 'react'
import type { PresenceUser } from '@/lib/presence'
import { Sidebar, type SidebarData } from './sidebar'
import { Topbar } from './topbar'

export function AppShell({
  sidebar,
  user,
  email,
  workspaceId,
  isOwner,
  children,
}: {
  sidebar: SidebarData
  user: PresenceUser
  email: string
  workspaceId: string
  isOwner: boolean
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    // Restore the persisted collapse preference on mount (browser-only read).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(localStorage.getItem('kore-sidebar-collapsed') === '1')
  }, [])

  const toggleCollapse = () =>
    setCollapsed((v) => {
      const next = !v
      try {
        localStorage.setItem('kore-sidebar-collapsed', next ? '1' : '0')
      } catch {
        // ignore
      }
      return next
    })

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop sidebar */}
      <aside
        className={`hidden shrink-0 border-r border-border bg-surface md:block ${
          collapsed ? 'md:w-16' : 'md:w-64'
        }`}
      >
        <Sidebar data={sidebar} collapsed={collapsed} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-border bg-surface shadow-xl">
            <Sidebar data={sidebar} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={user}
          email={email}
          workspaceId={workspaceId}
          isOwner={isOwner}
          onMenu={() => setMobileOpen(true)}
          onToggleCollapse={toggleCollapse}
        />
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
