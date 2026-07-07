import { DemoStoreProvider } from '@/lib/demo/context'
import { DemoAppShell } from '@/components/demo/demo-app-shell'

/**
 * The /demo route group. Lives OUTSIDE app/(app)/ so it never renders the
 * DAL-gated auth layout — no login, no Supabase, no redirects. All data comes
 * from the in-memory DemoStore (created once per page load ⇒ resets on refresh).
 * The root app/layout.tsx already provides <html>/<body> + ThemeProvider.
 */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <DemoStoreProvider>
      <DemoAppShell>{children}</DemoAppShell>
    </DemoStoreProvider>
  )
}
