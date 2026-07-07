'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { DemoSidebar } from './demo-sidebar'
import { DemoTopbar } from './demo-topbar'

/** Demo shell: a fork of AppShell that swaps in the store-backed DemoSidebar /
 *  DemoTopbar and adds the "changes reset on refresh" banner. No Supabase. */
export function DemoAppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [bannerOpen, setBannerOpen] = useState(true)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(localStorage.getItem('kore-demo-sidebar-collapsed') === '1')
  }, [])

  const toggleCollapse = () =>
    setCollapsed((v) => {
      const next = !v
      try {
        localStorage.setItem('kore-demo-sidebar-collapsed', next ? '1' : '0')
      } catch {
        // ignore
      }
      return next
    })

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {bannerOpen && (
        <div className="flex shrink-0 items-center justify-center gap-2 bg-indigo-600 px-3 py-1.5 text-center text-xs font-medium text-white sm:text-sm">
          <span>
            ✨ Demo mode — changes aren’t saved and reset on refresh.{' '}
            <Link href="/signup" className="underline underline-offset-2 hover:opacity-90">
              Sign up to keep your work →
            </Link>
          </span>
          <button
            type="button"
            onClick={() => setBannerOpen(false)}
            aria-label="Dismiss"
            className="ml-1 rounded px-1 text-white/80 hover:bg-white/15 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <aside
          className={`hidden shrink-0 border-r border-border bg-surface md:block ${
            collapsed ? 'md:w-0 md:overflow-hidden' : 'md:w-64'
          }`}
        >
          <DemoSidebar />
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} aria-hidden />
            <aside className="absolute left-0 top-0 h-full w-64 border-r border-border bg-surface shadow-xl">
              <DemoSidebar onNavigate={() => setMobileOpen(false)} />
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <DemoTopbar onMenu={() => setMobileOpen(true)} onToggleCollapse={toggleCollapse} />
          <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </div>
  )
}
